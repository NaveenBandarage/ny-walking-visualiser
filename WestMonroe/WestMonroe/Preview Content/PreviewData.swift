import Foundation
import CoreLocation

// MARK: - Preview Data for Xcode Previews
enum PreviewData {

    static let sampleWalks: [Walk] = [
        Walk(
            id: UUID(uuidString: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890")!,
            startDate: Date().addingTimeInterval(-86400 * 2),
            endDate: Date().addingTimeInterval(-86400 * 2 + 3600),
            duration: 3600,
            distance: 5200,
            coordinates: centralParkLoop,
            elevationGain: 42,
            elevationLoss: 38,
            colorIndex: 0
        ),
        Walk(
            id: UUID(uuidString: "B2C3D4E5-F6A7-8901-BCDE-F12345678901")!,
            startDate: Date().addingTimeInterval(-86400 * 5),
            endDate: Date().addingTimeInterval(-86400 * 5 + 2400),
            duration: 2400,
            distance: 3100,
            coordinates: brooklynBridgeWalk,
            elevationGain: 25,
            elevationLoss: 22,
            colorIndex: 1
        ),
        Walk(
            id: UUID(uuidString: "C3D4E5F6-A7B8-9012-CDEF-123456789012")!,
            startDate: Date().addingTimeInterval(-86400 * 10),
            endDate: Date().addingTimeInterval(-86400 * 10 + 5400),
            duration: 5400,
            distance: 8700,
            coordinates: highLineWalk,
            elevationGain: 18,
            elevationLoss: 20,
            colorIndex: 2
        )
    ]

    static let sampleStats = WalkStats.compute(from: sampleWalks)

    // Central Park loop (simplified)
    static let centralParkLoop: [CLLocationCoordinate2D] = [
        CLLocationCoordinate2D(latitude: 40.7829, longitude: -73.9654),
        CLLocationCoordinate2D(latitude: 40.7851, longitude: -73.9583),
        CLLocationCoordinate2D(latitude: 40.7968, longitude: -73.9521),
        CLLocationCoordinate2D(latitude: 40.8002, longitude: -73.9580),
        CLLocationCoordinate2D(latitude: 40.7968, longitude: -73.9654),
        CLLocationCoordinate2D(latitude: 40.7829, longitude: -73.9654)
    ]

    // Brooklyn Bridge walk (simplified)
    static let brooklynBridgeWalk: [CLLocationCoordinate2D] = [
        CLLocationCoordinate2D(latitude: 40.7127, longitude: -74.0059),
        CLLocationCoordinate2D(latitude: 40.7122, longitude: -73.9990),
        CLLocationCoordinate2D(latitude: 40.7128, longitude: -73.9921),
        CLLocationCoordinate2D(latitude: 40.7069, longitude: -73.9973)
    ]

    // High Line walk (simplified)
    static let highLineWalk: [CLLocationCoordinate2D] = [
        CLLocationCoordinate2D(latitude: 40.7480, longitude: -74.0048),
        CLLocationCoordinate2D(latitude: 40.7524, longitude: -74.0040),
        CLLocationCoordinate2D(latitude: 40.7568, longitude: -74.0028),
        CLLocationCoordinate2D(latitude: 40.7598, longitude: -74.0018),
        CLLocationCoordinate2D(latitude: 40.7640, longitude: -74.0007)
    ]
}
