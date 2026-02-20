import SwiftUI

struct WalkDetailView: View {

    let walk: Walk
    let onBack: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: WabiSabi.spacingLG) {

                // Header: date + back button
                HStack {
                    Button(action: onBack) {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 11, weight: .medium))
                            Text("all walks")
                                .font(WabiSabi.mono(11))
                        }
                        .foregroundStyle(WabiSabi.textSecondary)
                    }
                    Spacer()
                }

                // Walk date
                Text(walk.formattedDate)
                    .font(WabiSabi.mono(18, weight: .medium))
                    .foregroundStyle(WabiSabi.textPrimary)

                // Stats grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: WabiSabi.spacingSM) {
                    DetailStatBox(
                        icon: "figure.walk",
                        label: "distance",
                        value: walk.formattedDistance
                    )
                    DetailStatBox(
                        icon: "clock",
                        label: "duration",
                        value: walk.formattedDuration
                    )
                    if let gain = walk.formattedElevationGain {
                        DetailStatBox(
                            icon: "arrow.up.right",
                            label: "elevation gain",
                            value: gain
                        )
                    }
                    if let loss = walk.formattedElevationLoss {
                        DetailStatBox(
                            icon: "arrow.down.right",
                            label: "elevation loss",
                            value: loss
                        )
                    }
                }

                // Coordinates count
                HStack {
                    Image(systemName: "mappin")
                        .font(.system(size: 10))
                        .foregroundStyle(WabiSabi.textTertiary)
                    Text("\(walk.coordinates.count) GPS points")
                        .font(WabiSabi.mono(10))
                        .foregroundStyle(WabiSabi.textTertiary)
                }
            }
            .padding(WabiSabi.spacingLG)
        }
    }
}

// MARK: - Detail Stat Box

struct DetailStatBox: View {
    let icon: String
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: WabiSabi.spacingXS) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 10))
                    .foregroundStyle(WabiSabi.textTertiary)
                Text(label)
                    .font(WabiSabi.mono(9))
                    .foregroundStyle(WabiSabi.textTertiary)
                    .textCase(.uppercase)
                    .tracking(0.5)
            }
            Text(value)
                .font(WabiSabi.mono(16, weight: .medium))
                .foregroundStyle(WabiSabi.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(WabiSabi.spacingMD)
        .background(WabiSabi.bgTertiary)
        .clipShape(RoundedRectangle(cornerRadius: WabiSabi.radiusSM))
        .overlay(
            RoundedRectangle(cornerRadius: WabiSabi.radiusSM)
                .strokeBorder(WabiSabi.border, lineWidth: 1)
        )
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
    }
    .sheet(isPresented: .constant(true)) {
        WalkDetailView(
            walk: PreviewData.sampleWalks[0],
            onBack: {}
        )
        .presentationDetents([.medium, .large])
        .presentationBackground(.ultraThinMaterial)
    }
}
