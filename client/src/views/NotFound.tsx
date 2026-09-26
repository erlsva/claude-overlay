import { TabIdentity } from "../components/TabIdentity";
import { useNoIndex } from "../hooks/useNoIndex";
import { Emote } from "./tts-guide/Emote";
import "./tts-guide/fonts";

/** Shown for any address the app does not have. It needs nothing from the server to appear. */
export function NotFound() {
  useNoIndex();
  return (
    <main className="not-found">
      <TabIdentity title="Page not found | Stream Overlay" />
      <Emote name="peek" size={112} eager />
      <p className="not-found__code">404</p>
      <h1>This page does not exist</h1>
      <p>The address may be misspelled, or the page may have moved.</p>
      <a href="/">Back to the start</a>
    </main>
  );
}
