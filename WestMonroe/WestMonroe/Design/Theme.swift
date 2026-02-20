import SwiftUI

enum WabiSabi {
    // MARK: - Background Colors
    static let bgPrimary   = Color(hex: "#000000")
    static let bgSecondary = Color(hex: "#0a0a0a")
    static let bgTertiary  = Color(hex: "#111111")

    // MARK: - Border
    static let border = Color(hex: "#1a1a1a")

    // MARK: - Text Colors
    static let textPrimary   = Color(hex: "#ededed")
    static let textSecondary = Color(hex: "#888888")
    static let textTertiary  = Color(hex: "#666666")

    // MARK: - Route Color (white at 0.7 opacity)
    static let routeColor = Color.white.opacity(0.7)

    // MARK: - Walk Route Palette (vibrant, dark-map-friendly)
    static let walkPalette: [Color] = [
        Color(hex: "#FF6B6B"),  // coral
        Color(hex: "#4ECDC4"),  // teal
        Color(hex: "#FFD93D"),  // amber
        Color(hex: "#A78BFA"),  // lavender
        Color(hex: "#6EE7B7"),  // mint
        Color(hex: "#FB923C"),  // orange
        Color(hex: "#60A5FA"),  // sky blue
        Color(hex: "#F472B6"),  // pink
        Color(hex: "#34D399"),  // emerald
        Color(hex: "#FBBF24"),  // yellow
    ]

    // MARK: - Spacing
    static let spacingXS: CGFloat = 4
    static let spacingSM: CGFloat = 8
    static let spacingMD: CGFloat = 12
    static let spacingLG: CGFloat = 16
    static let spacingXL: CGFloat = 24

    // MARK: - Corner Radius
    static let radiusSM: CGFloat = 4
    static let radiusMD: CGFloat = 8
    static let radiusLG: CGFloat = 12

    // MARK: - Typography
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    static func sans(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }
}

// MARK: - Color Hex Initializer
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
