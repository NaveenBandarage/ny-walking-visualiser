import Foundation
import CoreLocation

struct Walk: Identifiable, Hashable {
    let id: UUID
    let startDate: Date
    let endDate: Date
    let duration: TimeInterval       // seconds
    let distance: Double             // meters
    let coordinates: [CLLocationCoordinate2D]
    let elevationGain: Double?
    let elevationLoss: Double?

    var distanceKm: Double { distance / 1000.0 }
    var durationMinutes: Double { duration / 60.0 }

    // Hashable conformance — CLLocationCoordinate2D isn't Hashable by default
    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Walk, rhs: Walk) -> Bool {
        lhs.id == rhs.id
    }
}

struct WalkStats {
    let totalWalks: Int
    let totalDistance: Double   // km
    let totalDuration: Double   // minutes

    static let empty = WalkStats(totalWalks: 0, totalDistance: 0, totalDuration: 0)

    static func compute(from walks: [Walk]) -> WalkStats {
        WalkStats(
            totalWalks: walks.count,
            totalDistance: walks.reduce(0) { $0 + $1.distanceKm },
            totalDuration: walks.reduce(0) { $0 + $1.durationMinutes }
        )
    }
}

// MARK: - Formatting Helpers (ported from utils.ts)
extension Walk {
    var formattedDistance: String {
        let km = distanceKm
        if km < 1.0 {
            return "\(Int(km * 1000))m"
        } else {
            return String(format: "%.1fkm", km)
        }
    }

    var formattedDuration: String {
        let mins = Int(durationMinutes)
        if mins < 60 {
            return "\(mins)min"
        } else {
            let h = mins / 60
            let m = mins % 60
            return m == 0 ? "\(h)h" : "\(h)h \(m)m"
        }
    }

    var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d yyyy"
        return formatter.string(from: startDate)
    }

    var formattedElevationGain: String? {
        guard let gain = elevationGain else { return nil }
        return "+\(Int(gain))m"
    }

    var formattedElevationLoss: String? {
        guard let loss = elevationLoss else { return nil }
        return "-\(Int(loss))m"
    }
}

extension WalkStats {
    var formattedDistance: String {
        if totalDistance < 1.0 {
            return "\(Int(totalDistance * 1000))m"
        }
        return String(format: "%.1fkm", totalDistance)
    }

    var formattedDuration: String {
        let mins = Int(totalDuration)
        if mins < 60 {
            return "\(mins)min"
        }
        let h = mins / 60
        let m = mins % 60
        return m == 0 ? "\(h)h" : "\(h)h \(m)m"
    }
}
