/**
 * Local development deliberately targets the owner's test channel. Production
 * keeps the two streamer channels configured for the live overlay.
 */
export const TWITCH_CHANNELS: readonly string[] = import.meta.env.DEV
  ? ["eple7"]
  : ["vicksy", "wixels"];

export const DEFAULT_TWITCH_CHANNEL = TWITCH_CHANNELS[0];
export const CAN_SWITCH_TWITCH_CHANNEL = TWITCH_CHANNELS.length > 1;
