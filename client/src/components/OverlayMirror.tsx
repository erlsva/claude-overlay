import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "overlay_mirror_box";
const STREAM_WIDTH = 1920;
const STREAM_HEIGHT = 1080;
const HEADER_HEIGHT = 34;
// The card's own 1px border on each side.
const FRAME_BORDER = 2;
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 240;
const EDGE_GAP = 12;
const KEY_STEP = 16;

interface Box {
  x: number;
  y: number;
  width: number;
}

const frameHeight = (width: number) => (width * STREAM_HEIGHT) / STREAM_WIDTH;

function loadBox(): Box | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Box> | null;
    if (value && [value.x, value.y, value.width].every((n) => typeof n === "number" && Number.isFinite(n))) {
      return value as Box;
    }
  } catch {
    // Storage can be unavailable; the preview then simply uses its default place.
  }
  return null;
}

function saveBox(box: Box) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(box));
  } catch {
    // Not critical.
  }
}

/**
 * A live, silent copy of what the overlay is showing, including chat emotes and
 * the TTS notice that the dashboard canvas deliberately doesn't draw. Drag the
 * header to move it, drag the corner to resize it, double-click the header to
 * put it back in the top-right corner.
 *
 * `desired` is where the person put it; what is drawn is that place fitted into
 * the space currently available, so opening a side panel squeezes it only while
 * the panel is open.
 */
export function OverlayMirror({ onClose, state = "open" }: { onClose: () => void; state?: "open" | "closed" }) {
  const rootRef = useRef<HTMLElement>(null);
  const [desired, setDesired] = useState<Box | null>(loadBox);
  const desiredRef = useRef(desired);
  desiredRef.current = desired;
  const [ready, setReady] = useState(false);
  const [, setLayoutTick] = useState(0);
  const gesture = useRef<{ kind: "move" | "resize"; pointerX: number; pointerY: number; start: Box } | null>(null);

  const bounds = () => {
    const parent = rootRef.current?.offsetParent as HTMLElement | null;
    return { width: parent?.clientWidth ?? 1200, height: parent?.clientHeight ?? 700 };
  };

  /** Keep the whole preview inside the canvas area, at a usable size. */
  const fit = (candidate: Box): Box => {
    const area = bounds();
    const maxWidth = Math.max(MIN_WIDTH, area.width - FRAME_BORDER);
    const width = Math.min(Math.max(candidate.width, MIN_WIDTH), maxWidth);
    const height = HEADER_HEIGHT + frameHeight(width) + FRAME_BORDER;
    return {
      width,
      x: Math.min(Math.max(candidate.x, 0), Math.max(0, area.width - width - FRAME_BORDER)),
      y: Math.min(Math.max(candidate.y, 0), Math.max(0, area.height - height)),
    };
  };

  const homeBox = (): Box => {
    const area = bounds();
    const width = Math.min(DEFAULT_WIDTH, Math.max(MIN_WIDTH, area.width - EDGE_GAP * 2 - FRAME_BORDER));
    return fit({ width, x: area.width - width - EDGE_GAP - FRAME_BORDER, y: EDGE_GAP });
  };

  const shown: Box = desired ? fit(desired) : homeBox();
  const shownRef = useRef(shown);
  shownRef.current = shown;

  // The canvas area's size is only known after mounting; measure, then show.
  useLayoutEffect(() => {
    setReady(true);
    setLayoutTick((tick) => tick + 1);
  }, []);

  // Re-fit when the window or a side panel changes the available space.
  useEffect(() => {
    const parent = rootRef.current?.offsetParent;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setLayoutTick((tick) => tick + 1));
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const begin = useCallback(
    (kind: "move" | "resize") => (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { kind, pointerX: event.clientX, pointerY: event.clientY, start: shownRef.current };
    },
    [],
  );

  const update = (event: PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active) return;
    const dx = event.clientX - active.pointerX;
    const dy = event.clientY - active.pointerY;
    if (active.kind === "move") {
      setDesired(fit({ ...active.start, x: active.start.x + dx, y: active.start.y + dy }));
      return;
    }
    // Resizing keeps the 16:9 shape and the top-left corner where it is.
    const area = bounds();
    const widest = Math.min(
      area.width - active.start.x - FRAME_BORDER,
      ((area.height - active.start.y - HEADER_HEIGHT - FRAME_BORDER) * STREAM_WIDTH) / STREAM_HEIGHT,
    );
    const width = Math.min(
      Math.max(active.start.width + Math.max(dx, (dy * STREAM_WIDTH) / STREAM_HEIGHT), MIN_WIDTH),
      Math.max(MIN_WIDTH, widest),
    );
    setDesired({ ...active.start, width });
  };

  const end = () => {
    if (!gesture.current) return;
    gesture.current = null;
    if (desiredRef.current) saveBox(desiredRef.current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const dx = event.key === "ArrowLeft" ? -KEY_STEP : event.key === "ArrowRight" ? KEY_STEP : 0;
    const dy = event.key === "ArrowUp" ? -KEY_STEP : event.key === "ArrowDown" ? KEY_STEP : 0;
    const current = shownRef.current;
    const next = event.shiftKey
      ? fit({ ...current, width: current.width + (dx || dy) * 2 })
      : fit({ ...current, x: current.x + dx, y: current.y + dy });
    setDesired(next);
    saveBox(next);
  };

  const resetPlace = () => {
    setDesired(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Not critical.
    }
  };

  return (
    <section
      ref={rootRef}
      className={`overlay-mirror${ready ? " motion-popover" : ""}`}
      data-state={state}
      aria-label="Live overlay preview"
      style={{ left: shown.x, top: shown.y, visibility: ready ? "visible" : "hidden" }}
    >
      <header
        tabIndex={0}
        onPointerDown={begin("move")}
        onPointerMove={update}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={resetPlace}
        onKeyDown={onKeyDown}
        title="Drag to move. Arrow keys also move it (hold Shift to resize). Double-click to reset."
      >
        <span>
          <i aria-hidden="true" />
          Overlay preview
          <small>live · silent</small>
        </span>
        <button
          className="ui-icon-button ui-button--compact ui-icon-button--ghost"
          onClick={onClose}
          title="Hide the overlay preview"
          aria-label="Hide the overlay preview"
        >
          <X size={14} />
        </button>
      </header>
      <div className="overlay-mirror__frame" style={{ width: shown.width, height: frameHeight(shown.width) }}>
        <iframe
          title="Live overlay preview"
          src={`${window.location.origin}/overlay?mirror=1`}
          tabIndex={-1}
          style={{
            width: STREAM_WIDTH,
            height: STREAM_HEIGHT,
            transform: `scale(${shown.width / STREAM_WIDTH})`,
          }}
        />
      </div>
      <div
        className="overlay-mirror__grip"
        role="separator"
        aria-label="Resize the overlay preview"
        onPointerDown={begin("resize")}
        onPointerMove={update}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </section>
  );
}
