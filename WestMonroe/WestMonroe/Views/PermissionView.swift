import SwiftUI

struct PermissionView: View {

    let onRequestAccess: () -> Void

    var body: some View {
        ZStack {
            WabiSabi.bgPrimary.ignoresSafeArea()

            VStack(spacing: WabiSabi.spacingXL) {
                Spacer()

                Image(systemName: "heart.text.square")
                    .font(.system(size: 56, weight: .thin))
                    .foregroundStyle(WabiSabi.textTertiary)

                VStack(spacing: WabiSabi.spacingMD) {
                    Text("nyc walks")
                        .font(WabiSabi.mono(24, weight: .medium))
                        .foregroundStyle(WabiSabi.textPrimary)

                    Text("nyc walks reads your walking workouts to display your routes on a map. No data is stored outside of Health.")
                        .font(WabiSabi.sans(14))
                        .foregroundStyle(WabiSabi.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, WabiSabi.spacingXL)
                }

                Button("Allow Access", action: onRequestAccess)
                    .buttonStyle(PrimaryButtonStyle())

                Spacer()
                Spacer()
            }
        }
    }
}

// MARK: - Primary Button Style

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(WabiSabi.mono(14, weight: .medium))
            .foregroundStyle(WabiSabi.bgPrimary)
            .padding(.horizontal, WabiSabi.spacingXL)
            .padding(.vertical, WabiSabi.spacingMD)
            .background(
                configuration.isPressed
                    ? WabiSabi.textSecondary
                    : WabiSabi.textPrimary
            )
            .clipShape(RoundedRectangle(cornerRadius: WabiSabi.radiusMD))
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

#Preview {
    PermissionView(onRequestAccess: {})
}
