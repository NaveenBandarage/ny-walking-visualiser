import SwiftUI

struct StatsHeaderView: View {

    let stats: WalkStats

    var body: some View {
        HStack(alignment: .center, spacing: WabiSabi.spacingMD) {
            // Title
            VStack(alignment: .leading, spacing: 2) {
                Text("nyc walks")
                    .font(WabiSabi.mono(16, weight: .medium))
                    .foregroundStyle(WabiSabi.textPrimary)
                Text("walking routes visualizer")
                    .font(WabiSabi.mono(9))
                    .foregroundStyle(WabiSabi.textTertiary)
                    .textCase(.uppercase)
                    .tracking(0.5)
            }

            Spacer()

            // Stat boxes
            HStack(spacing: WabiSabi.spacingXS) {
                StatBox(label: "walks", value: "\(stats.totalWalks)")
                StatBox(label: "distance", value: stats.formattedDistance)
                StatBox(label: "time", value: stats.formattedDuration)
            }
        }
        .padding(.horizontal, WabiSabi.spacingLG)
        .padding(.vertical, WabiSabi.spacingMD)
        .glassPanel()
        .padding(.horizontal, WabiSabi.spacingMD)
        .padding(.top, WabiSabi.spacingSM)
    }
}

// MARK: - Stat Box Component

struct StatBox: View {
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(WabiSabi.mono(13, weight: .medium))
                .foregroundStyle(WabiSabi.textPrimary)
            Text(label)
                .font(WabiSabi.mono(8))
                .foregroundStyle(WabiSabi.textTertiary)
                .textCase(.uppercase)
                .tracking(0.5)
        }
        .statBox()
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        VStack {
            StatsHeaderView(stats: PreviewData.sampleStats)
            Spacer()
        }
    }
}
