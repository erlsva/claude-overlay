import { useState } from "react";
import { type ChatEmoteSpawn } from "../../types";

/** State for the emote preview and the emote block and allow lists. */
export function useEmotePreview() {
  const [emotePreview, setEmotePreview] = useState<ChatEmoteSpawn | null>(null);
  const [emoteRunning, setEmoteRunning] = useState(false);
  const [emoteClear, setEmoteClear] = useState(0);
  const [blacklistName, setBlacklistName] = useState("");
  const [blockedEmoteName, setBlockedEmoteName] = useState("");
  const [additionalEmoteName, setAdditionalEmoteName] = useState("");

  return {
    emotePreview,
    setEmotePreview,
    emoteRunning,
    setEmoteRunning,
    emoteClear,
    setEmoteClear,
    blacklistName,
    setBlacklistName,
    blockedEmoteName,
    setBlockedEmoteName,
    additionalEmoteName,
    setAdditionalEmoteName,
  };
}
