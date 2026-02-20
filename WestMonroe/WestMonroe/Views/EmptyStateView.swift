import SwiftUI

struct EmptyStateView: View {

    var body: some View {
        ZStack {
            WabiSabi.bgPrimary.ignoresSafeArea()

            VStack(spacing: WabiSabi.spacingXL) {
                Spacer()

                Image(systemName: "map")
                    .font(.system(size: 48, weight: .thin))
                    .foregroundStyle(WabiSabi.textTertiary)

                VStack(spacing: WabiSabi.spacingMD) {
                    Text("no walks found")
                        .font(WabiSabi.mono(18, weight: .medium))
                        .foregroundStyle(WabiSabi.textSecondary)

                    Text("Start walking with your iPhone in your pocket — Apple Health will record your routes automatically.")
                        .font(WabiSabi.sans(13))
                        .foregroundStyle(WabiSabi.textTertiary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, WabiSabi.spacingXL)
                }

                Spacer()
                Spacer()
            }
        }
    }
}

#Preview {
    EmptyStateView()
}
