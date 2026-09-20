/** The ElevenLabs HTTP client and its error messages. */

export async function eleven(pathname: string, key: string, body?: unknown): Promise<Response> {
  const response = await fetch(`https://api.elevenlabs.io/v1/${pathname}`, {
    method: body ? "POST" : "GET",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    throw new Error(await elevenErrorMessage(response));
  }
  return response;
}

export async function elevenErrorMessage(response: Response): Promise<string> {
  // Provider error metadata is safe to surface; request bodies and credentials
  // are deliberately never included.
  const payload = (await response.json().catch(() => null)) as {
    detail?: { code?: string; message?: string; status?: string; request_id?: string };
  } | null;
  const detail = payload?.detail;
  const requestId = detail?.request_id ? ` Request ID: ${detail.request_id}.` : "";
  if (
    detail?.status === "missing_permissions" ||
    /missing the permission/i.test(detail?.message || "")
  ) {
    const permission = detail?.message?.match(/permission\s+([a-z_]+)/i)?.[1];
    const names: Record<string, string> = {
      text_to_speech: "Text to Speech",
      sound_generation: "Sound Effects",
      voices_read: "Voices Read",
      models_read: "Models Read",
    };
    const label = permission
      ? names[permission] || permission.replaceAll("_", " ")
      : "the required generation";
    return `ElevenLabs API key is missing the ${label} permission${permission ? ` (${permission})` : ""}. Update the key restrictions in ElevenLabs, then restart or redeploy the server.${requestId}`;
  }
  const messages: Record<number, string> = {
    401: "ElevenLabs rejected the server API key. Confirm the key is active and restart or redeploy the server.",
    403: "The ElevenLabs API key or plan does not allow this voice or generation request.",
    429: "ElevenLabs quota or rate limit reached. Wait briefly or check the account usage limit.",
  };
  return `${messages[response.status] || `ElevenLabs returned HTTP ${response.status}. Check the account and voice access.`}${requestId}`;
}
