import type { TtsClip } from "./store.js";

const CURRENT_AUDIO_FILENAME = "tts_audio.mp3";
const audioUrlCache = new Map<string, { url: string; expiresAt: number }>();

export function discordStorageConfigured() {
  return /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(
    process.env.DISCORD_TTS_WEBHOOK_URL || "",
  );
}

function webhook() {
  const raw = process.env.DISCORD_TTS_WEBHOOK_URL || "";
  if (!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(raw)) {
    throw new Error("Configure DISCORD_TTS_WEBHOOK_URL on the server.");
  }
  return raw;
}

async function request(suffix: string, init?: RequestInit): Promise<any> {
  let response: Response;
  try {
    response = await fetch(webhook() + suffix, {
      ...init,
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new Error("Discord request failed. Check the webhook configuration and connection.");
  }
  if (!response.ok) {
    throw new Error(`Discord returned ${response.status}. Check webhook access or try again later.`);
  }
  return response.json();
}

/** Keep user text inside one Discord code block without allowing nested fences. */
export function formatDiscordClipMessage(token: string, sender: string, prompt: string) {
  const safe = `${sender}: ${prompt}`.replace(/`/g, "ˋ").replace(/\0/g, "").slice(0, 1_880);
  return `${token}\n\`\`\`\n${safe}\n\`\`\``;
}

export async function uploadClip(
  bytes: Buffer,
  clip: Omit<TtsClip, "discordMessageId">,
): Promise<string> {
  if (bytes.length > 10 * 1024 * 1024) {
    throw new Error("MP3 exceeds the Discord upload limit. Use a shorter scene.");
  }

  const form = new FormData();
  form.append("payload_json", JSON.stringify({
    content: formatDiscordClipMessage(clip.token, clip.sender, clip.prompt),
    allowed_mentions: { parse: [] },
  }));
  form.append(
    "files[0]",
    new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }),
    CURRENT_AUDIO_FILENAME,
  );

  const message = await request("?wait=true", { method: "POST", body: form });
  if (!/^\d+$/.test(message.id)) {
    throw new Error("Discord did not confirm the uploaded clip.");
  }
  return message.id;
}

export async function audioUrl(clip: TtsClip): Promise<string> {
  const cached = audioUrlCache.get(clip.discordMessageId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const message = await request(`/messages/${clip.discordMessageId}`);
  // The ID-based filename keeps clips produced before this simplified Discord
  // message format replayable.
  const attachment = message.attachments?.find(
    (item: { filename: string; content_type?: string }) =>
      item.filename === CURRENT_AUDIO_FILENAME ||
      item.filename === `${clip.id}.mp3` ||
      item.content_type === "audio/mpeg",
  );
  if (!attachment) {
    throw new Error("The Discord audio attachment is no longer available.");
  }

  const url = new URL(attachment.url);
  if (url.protocol !== "https:" || url.hostname !== "cdn.discordapp.com") {
    throw new Error("Discord returned an unexpected attachment URL.");
  }
  const signedExpiry = Number.parseInt(url.searchParams.get("ex") || "", 16) * 1000;
  audioUrlCache.set(clip.discordMessageId, {
    url: url.href,
    expiresAt: Number.isFinite(signedExpiry) ? signedExpiry : Date.now() + 5 * 60_000,
  });
  return url.href;
}

export async function deleteUploadedClip(messageId: string): Promise<void> {
  if (!/^\d+$/.test(messageId)) throw new Error("Invalid Discord clip message ID.");
  let response: Response;
  try {
    response = await fetch(webhook() + `/messages/${messageId}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new Error("Discord request failed while deleting the clip.");
  }
  if (!response.ok && response.status !== 404) {
    throw new Error(`Discord returned ${response.status} while deleting the clip.`);
  }
  audioUrlCache.delete(messageId);
}
