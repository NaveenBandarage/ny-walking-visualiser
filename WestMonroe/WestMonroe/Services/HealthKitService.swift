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

    private(set) var authStatus: AuthStatus = .notDetermined

    // MARK: - Authorization

    /// Sets initial state based purely on whether we've ever called requestAuthorization before.
    /// NOTE: authorizationStatus(for:) only reflects *write* permission, so we never use it
    /// to gate read-only access — HealthKit intentionally hides read auth status from apps.
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

        // This shows the system permission sheet exactly once; subsequent calls are no-ops.
        try await store.requestAuthorization(toShare: [], read: typesToRead)

        // Mark that we've requested so we skip the prompt on next launch.
        UserDefaults.standard.set(true, forKey: Self.hasRequestedKey)
        authStatus = .authorized
    }

    // MARK: - Walk Queries

    func fetchWalks() async throws -> [Walk] {
        let workouts = try await fetchWalkingWorkouts()
        var walks: [Walk] = []

        for workout in workouts {
            guard let routes = try? await fetchRoutes(for: workout),
                  !routes.isEmpty else { continue }

            let locations = routes.flatMap { $0 }
            guard locations.count >= 2 else { continue }

            let coordinates = locations.map(\.coordinate)
            let (gain, loss) = elevationStats(from: locations)

            let walk = Walk(
                id: workout.uuid,
                startDate: workout.startDate,
                endDate: workout.endDate,
                duration: workout.duration,
                distance: workout.totalDistance?.doubleValue(for: .meter()) ?? 0,
                coordinates: coordinates,
                elevationGain: gain,
                elevationLoss: loss
            )
            walks.append(walk)
        }

        return walks.sorted { $0.startDate > $1.startDate }
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
            if !locations.isEmpty {
                allRoutes.append(locations)
            }
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
                if let batch {
                    locations.append(contentsOf: batch)
                }
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
            if delta > 0 {
                gain += delta
            } else {
                loss += abs(delta)
            }
        }
        return (gain, loss)
    }
}

// MARK: - Errors

enum HealthKitError: LocalizedError {
    case notAvailable

    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "HealthKit is not available on this device."
        }
    }
}
