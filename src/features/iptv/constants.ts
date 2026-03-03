export const TIMEOUTS = {
  cinemaControlsHideMs: 4000,
  staticSwitchMs: 300,
  antennaWobbleMs: 1000,
  osdHideMs: 3000,
  volumeHideMs: 1500,
  powerOffMs: 500,
  powerOnMs: 800,
  numberCommitMs: 1500,
} as const;

export const CACHE = {
  channelCacheTtlMs: 60 * 60 * 1000,
  fetchRetries: 3,
  fetchBaseBackoffMs: 700,
} as const;

export const KEYBINDINGS = {
  power: ["Enter", " "],
  menuToggle: ["g", "G", "Enter"],
  closeMenu: ["Escape", "Backspace"],
  mute: ["m", "M"],
} as const;

export const SECRET_CHANNEL_CODE = 1337;
