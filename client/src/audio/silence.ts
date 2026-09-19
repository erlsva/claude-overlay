/**
 * Makes this page unable to produce sound. The dashboard's live overlay preview
 * runs the real overlay in an iframe, so without this every clip would play a
 * second time in the moderator's browser.
 *
 * It works at the browser level instead of touching each component:
 *  - every media element is permanently muted, whatever code sets `muted` later;
 *  - nothing can be connected to an audio context's output.
 */
export function silencePage() {
  const muted = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "muted");
  if (muted?.get && muted.set) {
    const { get, set } = muted;
    Object.defineProperty(HTMLMediaElement.prototype, "muted", {
      configurable: true,
      get() {
        return get.call(this);
      },
      set() {
        set.call(this, true);
      },
    });
  }

  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    this.muted = true;
    return play.call(this);
  };

  if (typeof AudioNode !== "undefined" && typeof AudioDestinationNode !== "undefined") {
    const connect = AudioNode.prototype.connect as (...args: unknown[]) => unknown;
    Object.defineProperty(AudioNode.prototype, "connect", {
      configurable: true,
      writable: true,
      value(this: AudioNode, destination: unknown, ...rest: unknown[]) {
        if (destination instanceof AudioDestinationNode) return destination;
        return connect.call(this, destination, ...rest);
      },
    });
  }
}

/** True when the overlay was opened as the dashboard's silent live preview. */
export const isMirrorMode = () =>
  new URLSearchParams(window.location.search).get("mirror") === "1";
