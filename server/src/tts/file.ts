import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import type { TtsClip } from "./store.js";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Serves a saved clip's audio itself instead of redirecting to where it is stored. The public
 * clip page needs that: a browser only honours "download" for a file from the same site, and it
 * can only draw a waveform from audio it is allowed to read. Like the OBS audio link, the address
 * is an unguessable clip capability. `?download=1` sends it as an attachment.
 */
export function clipFileHandler(deps: {
  getClip: (id: string) => Promise<TtsClip | undefined>;
  audioUrl: (clip: TtsClip) => Promise<string>;
  fetchAudio?: typeof fetch;
}) {
  const fetchAudio = deps.fetchAudio ?? fetch;
  return async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!/^[a-f0-9]{32}$/.test(id)) {
      res.sendStatus(400);
      return;
    }
    try {
      const clip = await deps.getClip(id);
      if (!clip) {
        res.sendStatus(404);
        return;
      }
      const upstream = await fetchAudio(await deps.audioUrl(clip), {
        signal: AbortSignal.timeout(20_000),
      });
      const length = Number(upstream.headers.get("content-length") ?? 0);
      if (!upstream.ok || !upstream.body || length > MAX_BYTES)
        throw new Error(`The audio store answered ${upstream.status}`);
      const disposition = req.query.download === "1" ? "attachment" : "inline";
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `${disposition}; filename="tts-${id.slice(0, 8)}.mp3"`);
      res.setHeader("Cache-Control", "public, max-age=600");
      if (length) res.setHeader("Content-Length", String(length));
      // The header can be missing or wrong, so the size is also counted as it streams.
      let sent = 0;
      const capped = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          sent += chunk.length;
          done(sent > MAX_BYTES ? new Error("The audio is larger than expected") : null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(upstream.body as never), capped, res);
    } catch (error) {
      console.error("Clip file could not be served", error);
      if (res.headersSent) res.destroy();
      else res.status(502).json({ error: "Saved audio could not be loaded." });
    }
  };
}
