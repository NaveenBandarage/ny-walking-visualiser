import SwiftUI

struct WalkListSheet: View {

    let walks: [Walk]
    let selectedWalk: Walk?
    let onSelect: (Walk) -> Void
    let onDeselect: () -> Void

    var body: some View {
        NavigationStack {
            Group {
                if let walk = selectedWalk {
                    WalkDetailView(walk: walk, onBack: onDeselect)
                } else {
                    walkList
                }
            }
            .navigationTitle(selectedWalk == nil ? "walks" : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
        }
    }

    // MARK: - Walk List

    private var walkList: some View {
        ScrollView {
            LazyVStack(spacing: 1) {
                ForEach(walks) { walk in
                    WalkRow(walk: walk, isSelected: walk.id == selectedWalk?.id)
                        .onTapGesture { onSelect(walk) }
                }
            }
            .padding(.horizontal, WabiSabi.spacingMD)
            .padding(.vertical, WabiSabi.spacingSM)
        }
    }
}

// MARK: - Walk Row

struct WalkRow: View {
    let walk: Walk
    let isSelected: Bool

    var body: some View {
        HStack(alignment: .center, spacing: WabiSabi.spacingMD) {
            // Date column
            VStack(alignment: .leading, spacing: 2) {
                Text(walk.formattedDate)
                    .font(WabiSabi.mono(12, weight: .medium))
                    .foregroundStyle(isSelected ? WabiSabi.textPrimary : WabiSabi.textSecondary)
            }

            Spacer()

            // Stats
            HStack(spacing: WabiSabi.spacingMD) {
                Label {
                    Text(walk.formattedDistance)
                        .font(WabiSabi.mono(11))
                        .foregroundStyle(WabiSabi.textPrimary)
                } icon: {
                    Image(systemName: "figure.walk")
                        .font(.system(size: 9))
                        .foregroundStyle(WabiSabi.textTertiary)
                }

                Label {
                    Text(walk.formattedDuration)
                        .font(WabiSabi.mono(11))
                        .foregroundStyle(WabiSabi.textSecondary)
                } icon: {
                    Image(systemName: "clock")
                        .font(.system(size: 9))
                        .foregroundStyle(WabiSabi.textTertiary)
                }
            }

            // Selection indicator
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(isSelected ? WabiSabi.textPrimary : WabiSabi.textTertiary)
        }
        .padding(.horizontal, WabiSabi.spacingMD)
        .padding(.vertical, WabiSabi.spacingMD)
        .background(
            isSelected
                ? WabiSabi.bgTertiary
                : WabiSabi.bgSecondary
        )
        .clipShape(RoundedRectangle(cornerRadius: WabiSabi.radiusSM))
        .overlay(
            RoundedRectangle(cornerRadius: WabiSabi.radiusSM)
                .strokeBorder(
                    isSelected ? WabiSabi.textTertiary : WabiSabi.border,
                    lineWidth: 1
                )
        )
        .animation(.easeInOut(duration: 0.15), value: isSelected)
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
    }
    .sheet(isPresented: .constant(true)) {
        WalkListSheet(
            walks: PreviewData.sampleWalks,
            selectedWalk: nil,
            onSelect: { _ in },
            onDeselect: {}
        )
        .presentationDetents([.fraction(0.15), .medium, .large])
        .presentationBackground(.ultraThinMaterial)
    }
}
