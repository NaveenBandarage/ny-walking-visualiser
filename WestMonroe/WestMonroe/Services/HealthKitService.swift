import Foundation
import HealthKit
import CoreLocation

@Observable
final class HealthKitService {

    enum AuthStatus {
        case notDetermined  // Haven't asked yet
        case authorized     // requestAuthorization has been called; data fetch will proceed
        case unavailable    // Device doesn't support HealthKit
    }

    private let store = HKHealthStore()
    private static let hasRequestedKey = "hk_has_requested_auth"

    /// Max GPS points kept per walk after downsampling. Enough detail at city scale.
    private static let maxPointsPerWalk = 500

    private(set) var authStatus: AuthStatus = .notDetermined

    // MARK: - Authorization

    func checkAuthStatus() {
        guard HKHealthStore.isHealthDataAvailable() else {
            authStatus = .unavailable
            return
        }
        let hasRequested = UserDefaults.standard.bool(forKey: Self.hasRequestedKey)
        authStatus = hasRequested ? .authorized : .notDetermined
    }

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            authStatus = .unavailable
            throw HealthKitError.notAvailable
        }

        let typesToRead: Set<HKObjectType> = [
            HKWorkoutType.workoutType(),
            HKSeriesType.workoutRoute(),
            HKQuantityType(.distanceWalkingRunning)
        ]

        try await store.requestAuthorization(toShare: [], read: typesToRead)
        UserDefaults.standard.set(true, forKey: Self.hasRequestedKey)
        authStatus = .authorized
    }

    // MARK: - Walk Queries

    func fetchWalks() async throws -> [Walk] {
        let workouts = try await fetchWalkingWorkouts()

        // Fetch all routes in parallel — this is the main perf win vs serial fetching
        let results: [(date: Date, walk: Walk?)] = try await withThrowingTaskGroup(
            of: (Date, Walk?).self
        ) { group in
            for (index, workout) in workouts.enumerated() {
                group.addTask {
                    guard let routes = try? await self.fetchRoutes(for: workout),
                          !routes.isEmpty else { return (workout.startDate, nil) }

                    let locations = routes.flatMap { $0 }
                    guard locations.count >= 2 else { return (workout.startDate, nil) }

                    let coords = self.downsample(locations.map(\.coordinate))
                    let (gain, loss) = self.elevationStats(from: locations)

                    let walk = Walk(
                        id: workout.uuid,
                        startDate: workout.startDate,
                        endDate: workout.endDate,
                        duration: workout.duration,
                        distance: workout.totalDistance?.doubleValue(for: .meter()) ?? 0,
                        coordinates: coords,
                        elevationGain: gain,
                        elevationLoss: loss,
                        colorIndex: index
                    )
                    return (workout.startDate, walk)
                }
            }

            var collected: [(Date, Walk?)] = []
            for try await pair in group {
                collected.append(pair)
            }
            return collected
        }

        // Sort newest-first, then re-assign colorIndex by final position for consistent colors
        let sorted = results
            .compactMap(\.walk)
            .sorted { $0.startDate > $1.startDate }
            .enumerated()
            .map { idx, walk in
                Walk(
                    id: walk.id,
                    startDate: walk.startDate,
                    endDate: walk.endDate,
                    duration: walk.duration,
                    distance: walk.distance,
                    coordinates: walk.coordinates,
                    elevationGain: walk.elevationGain,
                    elevationLoss: walk.elevationLoss,
                    colorIndex: idx
                )
            }

        return sorted
    }

    // MARK: - Coordinate Downsampling

    /// Keep every Nth point so each walk stays under maxPointsPerWalk.
    /// Preserves first and last point exactly.
    private func downsample(_ coords: [CLLocationCoordinate2D]) -> [CLLocationCoordinate2D] {
        guard coords.count > Self.maxPointsPerWalk else { return coords }
        let step = coords.count / Self.maxPointsPerWalk
        var result: [CLLocationCoordinate2D] = []
        result.reserveCapacity(Self.maxPointsPerWalk + 1)
        for i in stride(from: 0, to: coords.count - 1, by: step) {
            result.append(coords[i])
        }
        result.append(coords[coords.count - 1])
        return result
    }

    // MARK: - Private Helpers

    private func fetchWalkingWorkouts() async throws -> [HKWorkout] {
        let predicate = HKQuery.predicateForWorkouts(with: .walking)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKWorkoutType.workoutType(),
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sortDescriptor]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let workouts = samples as? [HKWorkout] ?? []
                continuation.resume(returning: workouts)
            }
            store.execute(query)
        }
    }

    private func fetchRoutes(for workout: HKWorkout) async throws -> [[CLLocation]] {
        let routeSamples = try await fetchRouteSamples(for: workout)
        var allRoutes: [[CLLocation]] = []
        for routeSample in routeSamples {
            let locations = try await fetchLocations(for: routeSample)
            if !locations.isEmpty { allRoutes.append(locations) }
        }
        return allRoutes
    }

    private func fetchRouteSamples(for workout: HKWorkout) async throws -> [HKWorkoutRoute] {
        let predicate = HKQuery.predicateForObjects(from: workout)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKSeriesType.workoutRoute(),
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let routes = samples as? [HKWorkoutRoute] ?? []
                continuation.resume(returning: routes)
            }
            store.execute(query)
        }
    }

    private func fetchLocations(for route: HKWorkoutRoute) async throws -> [CLLocation] {
        try await withCheckedThrowingContinuation { continuation in
            var locations: [CLLocation] = []
            var didFinish = false

            let query = HKWorkoutRouteQuery(route: route) { _, batch, done, error in
                if let error {
                    if !didFinish {
                        didFinish = true
                        continuation.resume(throwing: error)
                    }
                    return
                }
                if let batch { locations.append(contentsOf: batch) }
                if done && !didFinish {
                    didFinish = true
                    continuation.resume(returning: locations)
                }
            }
            store.execute(query)
        }
    }

    private func elevationStats(from locations: [CLLocation]) -> (gain: Double, loss: Double) {
        var gain: Double = 0
        var loss: Double = 0
        for i in 1..<locations.count {
            let delta = locations[i].altitude - locations[i - 1].altitude
            if delta > 0 { gain += delta } else { loss += abs(delta) }
        }
        return (gain, loss)
    }
}

enum HealthKitError: LocalizedError {
    case notAvailable

    var errorDescription: String? {
        "HealthKit is not available on this device."
    }
}
