import SwiftUI

struct PermissionView: View {

    let authStatus: HealthKitService.AuthStatus
    let onRequestAccess: () -> Void

    var body: some View {
        ZStack {
            WabiSabi.bgPrimary.ignoresSafeArea()

            VStack(spacing: WabiSabi.spacingXL) {
                Spacer()

                // Icon
                Image(systemName: "heart.text.square")
                    .font(.system(size: 56, weight: .thin))
                    .foregroundStyle(WabiSabi.textTertiary)

                // Title & message
                VStack(spacing: WabiSabi.spacingMD) {
                    Text("nyc walks")
                        .font(WabiSabi.mono(24, weight: .medium))
                        .foregroundStyle(WabiSabi.textPrimary)

                    Text(authStatus == .denied ? deniedMessage : requestMessage)
                        .font(WabiSabi.sans(14))
                        .foregroundStyle(WabiSabi.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, WabiSabi.spacingXL)
                }

                // Action button
                if authStatus == .denied {
                    Button("Open Health Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                } else {
                    Button("Allow Access", action: onRequestAccess)
                        .buttonStyle(PrimaryButtonStyle())
                }

                Spacer()
                Spacer()
            }
        }
    }

    private let requestMessage = "nyc walks reads your walking workouts to display your routes on a map. No data is stored outside of Health."

    private let deniedMessage = "Health access was denied. Enable it in Settings → Health → Data Access & Devices → nyc walks."
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
    PermissionView(
        authStatus: .notDetermined,
        onRequestAccess: {}
    )
}
