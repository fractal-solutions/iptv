export const DEFAULT_SETTINGS_PREFS = {
  scanlines: true,
  crtIntensity: 0.5,
  theme: "wood",
} as const;

export const THEME_OPTIONS = [
  { id: "wood", label: "Oak", icon: "🪵", desc: "Classic 70s" },
  { id: "walnut", label: "Walnut", icon: "🌰", desc: "Dark wood" },
  { id: "plastic", label: "Plastic", icon: "📺", desc: "90s black" },
  { id: "silver", label: "Silver", icon: "🪩", desc: "Modern" },
  { id: "midnight", label: "Midnight", icon: "🌙", desc: "Dark luxe" },
  { id: "cinema", label: "Cinema", icon: "🎬", desc: "Frameless" },
] as const;

