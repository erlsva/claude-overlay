import { useNoIndex } from "../hooks/useNoIndex";

/** Shown for any address the app does not have. Static: it never asks the server for anything. */
export function NotFound() {
  useNoIndex("Page not found");
  return (
    <main className="not-found">
      <p className="not-found__code">404</p>
      <h1>This page does not exist</h1>
      <p>The address may be misspelled, or the page may have moved.</p>
      <a href="/">Back to the start</a>
    </main>
  );
}
