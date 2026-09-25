/**
 * The key that signs dashboard sessions and Twitch OAuth state. This repository is public, so the
 * built-in fallback is a key anyone could use to forge an owner session. It is allowed only for
 * local development; a deployed server (NODE_ENV=production, or any Render service) refuses to
 * start without a real SESSION_SECRET.
 */
const deployed = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);
if (deployed && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required on a deployed server");
}

export const SESSION_SECRET = process.env.SESSION_SECRET ?? "development-only-secret";
