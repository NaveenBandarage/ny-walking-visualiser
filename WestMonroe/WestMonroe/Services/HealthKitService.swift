import Foundation
import HealthKit
import CoreLocation

@Observable
final class HealthKitService {

    enum AuthStatus {
        case notDetermined
        case authorized
        case unavailable
    }

    private let store = HKHealthStore()
    private static let hasRequestedKey = "hk_has_requested_auth"

    /// 150 pts/walk is invisible from default city zoom and keeps MapKit well within limits.
    private static let maxPointsPerWalk = 150
    /// Maximum walks to load — caps total vertex count at ~22k.
    private static let maxWalks = 150
    /// Concurrent route fetches — avoids a memory spike from loading everything at once.
    private static let fetchConcurrency = 10

    private(set) var authStatus: AuthStatus = .notDetermined

    // MARK: - Authorization

    func checkAuthStatus() {
        guard HKHealthStore.isHealthDataAvailable() else {
            authStatus = .unavailable
            return
        }
        authStatus = UserDefaults.standard.bool(forKey: Self.hasRequestedKey)
            ? .authorized : .notDetermined
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

        // Process in batches to keep peak memory low
        var allWalks: [Walk] = []

        let batches = workouts.chunked(into: Self.fetchConcurrency)
        for batch in batches {
            let batchWalks = try await withThrowingTaskGroup(of: Walk?.self) { group in
                for workout in batch {
                    group.addTask {
                        guard let routes = try? await self.fetchRoutes(for: workout),
                              !routes.isEmpty else { return nil }

                        let locations = routes.flatMap { $0 }
                        guard locations.count >= 2 else { return nil }

                        let coords = self.downsample(locations.map(\.coordinate))
                        let (gain, loss) = self.elevationStats(from: locations)

                        return Walk(
                            id: workout.uuid,
                            startDate: workout.startDate,
                            endDate: workout.endDate,
                            duration: workout.duration,
                            distance: workout.totalDistance?.doubleValue(for: .meter()) ?? 0,
                            coordinates: coords,
                            elevationGain: gain,
                            elevationLoss: loss,
                            colorIndex: 0  // reassigned below after sorting
                        )
                    }
                }

                var collected: [Walk] = []
                for try await walk in group {
                    if let w = walk { collected.append(w) }
                }
                return collected
            }
            allWalks.append(contentsOf: batchWalks)
        }

        // Sort newest-first, assign stable color indices
        return allWalks
            .sorted { $0.startDate > $1.startDate }
            .enumerated()
            .map { idx, walk in
                Walk(id: walk.id, startDate: walk.startDate, endDate: walk.endDate,
                     duration: walk.duration, distance: walk.distance,
                     coordinates: walk.coordinates, elevationGain: walk.elevationGain,
                     elevationLoss: walk.elevationLoss, colorIndex: idx)
            }
    }

    // MARK: - Coordinate Downsampling

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
                limit: Self.maxWalks,
                sortDescriptors: [sortDescriptor]
            ) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: samples as? [HKWorkout] ?? [])
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
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: samples as? [HKWorkoutRoute] ?? [])
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
                    if !didFinish { didFinish = true; continuation.resume(throwing: error) }
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
    var errorDescription: String? { "HealthKit is not available on this device." }
}

// MARK: - Array chunk helper

private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map {
            Array(self[$0 ..< Swift.min($0 + size, count)])
        }
    }
}
