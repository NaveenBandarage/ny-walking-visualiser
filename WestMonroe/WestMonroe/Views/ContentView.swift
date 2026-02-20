import SwiftUI

struct ContentView: View {

    @State private var viewModel = WalksViewModel()
    @State private var sheetDetent: PresentationDetent = .fraction(0.15)

    var body: some View {
        Group {
            switch viewModel.authStatus {
            case .notDetermined, .denied:
                PermissionView(
                    authStatus: viewModel.authStatus,
                    onRequestAccess: { viewModel.requestAuthorization() }
                )
            case .authorized:
                authorizedContent
            }
        }
        .onAppear { viewModel.onAppear() }
    }

    // MARK: - Authorized Content

    private var authorizedContent: some View {
        ZStack(alignment: .top) {
            // Full-screen map
            WalkMapView(
                walks: viewModel.walks,
                selectedWalk: viewModel.selectedWalk,
                onSelectWalk: { viewModel.selectWalk($0) }
            )

            // Floating header — passes touches through to map
            VStack {
                if !viewModel.isLoading || !viewModel.walks.isEmpty {
                    StatsHeaderView(stats: viewModel.stats)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer()
            }
            .animation(.easeOut(duration: 0.3), value: viewModel.isLoading)

            // Loading overlay
            if viewModel.isLoading && viewModel.walks.isEmpty {
                loadingOverlay
            }
        }
        .sheet(isPresented: .constant(true)) {
            sheetContent
                .presentationDetents(
                    [.fraction(0.15), .medium, .large],
                    selection: $sheetDetent
                )
                .presentationBackground(.ultraThinMaterial)
                .presentationDragIndicator(.visible)
                .presentationBackgroundInteraction(.enabled)
                .interactiveDismissDisabled()
        }
        .onChange(of: viewModel.selectedWalk) { _, walk in
            withAnimation {
                sheetDetent = walk != nil ? .medium : .fraction(0.15)
            }
        }
    }

    // MARK: - Sheet Content

    private var sheetContent: some View {
        Group {
            if viewModel.walks.isEmpty && !viewModel.isLoading {
                EmptyStateView()
            } else {
                WalkListSheet(
                    walks: viewModel.walks,
                    selectedWalk: viewModel.selectedWalk,
                    onSelect: { walk in
                        viewModel.selectWalk(walk)
                    },
                    onDeselect: {
                        viewModel.deselectWalk()
                    }
                )
            }
        }
    }

    // MARK: - Loading Overlay

    private var loadingOverlay: some View {
        VStack(spacing: WabiSabi.spacingMD) {
            ProgressView()
                .tint(WabiSabi.textSecondary)
            Text("loading walks...")
                .font(WabiSabi.mono(11))
                .foregroundStyle(WabiSabi.textTertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(WabiSabi.bgPrimary.opacity(0.7))
    }
}

#Preview {
    ContentView()
}
