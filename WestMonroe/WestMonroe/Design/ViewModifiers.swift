import SwiftUI

// MARK: - Glass Panel Modifier
// Matches .panel-glass from CSS: rgba(10,10,10,0.8) + ultraThinMaterial + 1px border + 8pt corner radius
struct GlassPanelModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                ZStack {
                    Color(hex: "#0a0a0a").opacity(0.85)
                    Rectangle().fill(.ultraThinMaterial)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: WabiSabi.radiusMD))
            .overlay(
                RoundedRectangle(cornerRadius: WabiSabi.radiusMD)
                    .strokeBorder(WabiSabi.border, lineWidth: 1)
            )
    }
}

// MARK: - Stat Box Modifier
struct StatBoxModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, WabiSabi.spacingSM)
            .padding(.vertical, WabiSabi.spacingXS)
            .background(WabiSabi.bgTertiary)
            .clipShape(RoundedRectangle(cornerRadius: WabiSabi.radiusSM))
            .overlay(
                RoundedRectangle(cornerRadius: WabiSabi.radiusSM)
                    .strokeBorder(WabiSabi.border, lineWidth: 1)
            )
    }
}

// MARK: - View Extensions
extension View {
    func glassPanel() -> some View {
        modifier(GlassPanelModifier())
    }

    func statBox() -> some View {
        modifier(StatBoxModifier())
    }
}
