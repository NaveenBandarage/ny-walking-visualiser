import Foundation
import Observation

@Observable
final class WalksViewModel {

    // MARK: - State
    var walks: [Walk] = []
    var selectedWalk: Walk?
    var stats: WalkStats = .empty
    var isLoading: Bool = false
    var error: String?

    var authStatus: HealthKitService.AuthStatus {
        healthKit.authStatus
    }

    // MARK: - Dependencies
    private let healthKit = HealthKitService()

    // MARK: - Lifecycle

    func onAppear() {
        healthKit.checkAuthStatus()
        if healthKit.authStatus == .authorized {
            Task { await loadWalks() }
        }
    }

    // MARK: - Auth

    func requestAuthorization() {
        Task {
            do {
                try await healthKit.requestAuthorization()
                if healthKit.authStatus == .authorized {
                    await loadWalks()
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Data Loading

    @MainActor
    func loadWalks() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let fetched = try await healthKit.fetchWalks()
            walks = fetched
            stats = WalkStats.compute(from: fetched)
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Selection

    func selectWalk(_ walk: Walk) {
        selectedWalk = (selectedWalk?.id == walk.id) ? nil : walk
    }

    func deselectWalk() {
        selectedWalk = nil
    }
}
