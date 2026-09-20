/** Settings read from the environment that more than one part of the server needs. */

/** Where the dashboard runs; the only origin allowed to call this server from a browser. */
export const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

export const PORT = Number(process.env.PORT ?? 3001);

/** The public address of this server, without a trailing slash. Render provides its own. */
export const publicServerUrl = () =>
  (
    process.env.PUBLIC_SERVER_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3001"
  ).replace(/\/$/, "");
