/** Where the server runs. In development it is the local server; a deployment sets VITE_SERVER_URL. */
export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
