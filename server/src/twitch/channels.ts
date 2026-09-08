const twitchLoginPattern = /^[a-z0-9_]{3,25}$/;

/**
 * Render supplies EVENT_CHANNELS for production. A development server defaults
 * to EPLE7 so local testing can never silently join a live streamer channel.
 */
export function getConfiguredTwitchChannels(): string[] {
  // Never let a leftover local .env value point development at a streamer or
  // chatbot channel. Render is the only environment where EVENT_CHANNELS is
  // configurable.
  if (process.env.NODE_ENV !== "production") return ["eple7"];

  const configured = process.env.EVENT_CHANNELS ?? "vicksy,wixels";
  return [
    ...new Set(
      configured
        .split(",")
        .map((value) => value.trim().replace(/^#/, "").toLowerCase())
        .filter((value) => twitchLoginPattern.test(value)),
    ),
  ];
}

export function getDefaultTwitchChannel(): string {
  return getConfiguredTwitchChannels()[0] ?? "eple7";
}
