import SwiftUI
import MapKit

struct WalkMapView: View {

    let walks: [Walk]
    let selectedWalk: Walk?
    let onSelectWalk: (Walk) -> Void

    @State private var position: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 40.748, longitude: -73.985),
            span: MKCoordinateSpan(latitudeDelta: 0.12, longitudeDelta: 0.12)
        )
    )

    @State private var revealedCount: Int = 0

    var body: some View {
        Map(position: $position) {
            ForEach(Array(walks.prefix(revealedCount).enumerated()), id: \.element.id) { _, walk in
                let style = polylineStyle(for: walk)
                MapPolyline(coordinates: walk.coordinates)
                    .stroke(style.color, lineWidth: style.width)
            }
        }
        .mapStyle(.standard(
            elevation: .flat,
            emphasis: .muted,
            pointsOfInterest: .excludingAll,
            showsTraffic: false
        ))
        .colorScheme(.dark)
        .ignoresSafeArea()
        .onAppear { startRevealAnimation() }
        .onChange(of: walks) { _, newWalks in
            revealedCount = 0
            if !newWalks.isEmpty { startRevealAnimation() }
        }
        .onChange(of: selectedWalk) { _, walk in
            if let walk {
                animateToWalk(walk)
            } else {
                animateToAllWalks()
            }
        }
        .onMapCameraChange { _ in }
    }

    // MARK: - Polyline Styling

    private struct PolylineStyle {
        let color: Color
        let width: CGFloat
    }

    private func polylineStyle(for walk: Walk) -> PolylineStyle {
        if let selected = selectedWalk {
            if walk.id == selected.id {
                return PolylineStyle(color: walk.color.opacity(0.95), width: 4)
            } else {
                return PolylineStyle(color: walk.color.opacity(0.2), width: 1.5)
            }
        } else {
            return PolylineStyle(color: walk.color.opacity(0.75), width: 2.5)
        }
    }

    // MARK: - Animation

    private func startRevealAnimation() {
        revealedCount = 0
        guard !walks.isEmpty else { return }

        let interval = max(0.05, min(0.15, 1.5 / Double(walks.count)))
        var count = 0

        func revealNext() {
            guard count < walks.count else { return }
            count += 1
            revealedCount = count
            DispatchQueue.main.asyncAfter(deadline: .now() + interval) {
                revealNext()
            }
        }
        revealNext()
    }

    private func animateToWalk(_ walk: Walk) {
        guard !walk.coordinates.isEmpty else { return }
        let region = walk.coordinates.boundingRegion(padding: 0.15)
        withAnimation(.easeInOut(duration: 0.6)) {
            position = .region(region)
        }
    }

    private func animateToAllWalks() {
        let allCoords = walks.flatMap(\.coordinates)
        guard !allCoords.isEmpty else { return }
        let region = allCoords.boundingRegion(padding: 0.1)
        withAnimation(.easeInOut(duration: 0.6)) {
            position = .region(region)
        }
    }
}

// MARK: - Coordinate Helpers

extension Array where Element == CLLocationCoordinate2D {
    func boundingRegion(padding: Double = 0.05) -> MKCoordinateRegion {
        guard !isEmpty else {
            return MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 40.748, longitude: -73.985),
                span: MKCoordinateSpan(latitudeDelta: 0.12, longitudeDelta: 0.12)
            )
        }

        let minLat = self.map(\.latitude).min()!
        let maxLat = self.map(\.latitude).max()!
        let minLon = self.map(\.longitude).min()!
        let maxLon = self.map(\.longitude).max()!

        let latDelta = Swift.max((maxLat - minLat) * (1 + padding), 0.005)
        let lonDelta = Swift.max((maxLon - minLon) * (1 + padding), 0.005)

        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(
                latitude: (minLat + maxLat) / 2,
                longitude: (minLon + maxLon) / 2
            ),
            span: MKCoordinateSpan(latitudeDelta: latDelta, longitudeDelta: lonDelta)
        )
    }
}

#Preview {
    WalkMapView(
        walks: PreviewData.sampleWalks,
        selectedWalk: nil,
        onSelectWalk: { _ in }
    )
}
