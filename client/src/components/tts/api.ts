/** Talking to the server's TTS endpoints, and small formatting helpers. */

import { authHeaders } from "../../hooks/useAuth";

export const base = (import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001") + "/tts";

export const tokenPattern = /^\(?TTS:([a-f0-9]{32})\)?$/i;

export async function api<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(base + route, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || `TTS request failed (${response.status})`);
  return data as T;
}

/** One short line for the card; the full text stays in the tooltip and "Copy details". */
export function shorten(text: string, max = 110) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  const firstSentence = oneLine.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? oneLine;
  const chosen = firstSentence.length <= max ? firstSentence : oneLine;
  return chosen.length <= max ? chosen : `${chosen.slice(0, max - 1).trimEnd()}…`;
}

export const formatDuration = (seconds: number) =>
  seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
    : `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
