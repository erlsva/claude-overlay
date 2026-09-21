import { useStageRefs } from "./useStageRefs";
import { useTwitchEmbed } from "./useTwitchEmbed";
import { useStageViewport } from "./useStageViewport";
import { useDvdMotion } from "./useDvdMotion";
import { useElementSync } from "./useElementSync";
import { type CanvasStageContext } from "./context";
import {
  WORKSPACE_W,
  WORKSPACE_H,
  STREAM_OFFSET_X,
  STREAM_OFFSET_Y,
  STREAM_W,
  STREAM_H,
} from "../../canvas/config";
import { LiveCursors } from "../LiveCursors";
import { RefreshCw } from "lucide-react";
import { type CanvasStageProps } from "./types";

export function CanvasStage(props: CanvasStageProps) {
  const stageRefs = useStageRefs(props);
  const twitchEmbed = useTwitchEmbed(props);
  const stageViewport = useStageViewport(props, { ...stageRefs });
  const dvdMotion = useDvdMotion({ ...stageRefs });
  const elementSync = useElementSync(props, { ...stageRefs, ...stageViewport });
  const s: CanvasStageContext = {
    ...stageRefs,
    ...twitchEmbed,
    ...stageViewport,
    ...dvdMotion,
    ...elementSync,
  };
  const {
    cursors = new Map(),
    showTwitchEmbed = false,
    twitchInteractionEnabled = false,
    drawingLayer,
  } = props;
  const {
    wrapperRef,
    workspaceRef,
    twitchEmbedRef,
    snapXGuideRef,
    snapYGuideRef,
    panState,
    zoomState,
    twitchNeedsReconnect,
    reconnectTwitchPlayer,
    resetView,
  } = s;

  return (
    <div
      ref={wrapperRef}
      data-media-drop-target
      className="canvas-stage-drop-target"
      data-player-mode={twitchInteractionEnabled ? "true" : undefined}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--bg-app)",
        userSelect: "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={workspaceRef}
        id="viewport"
        style={{
          position: "absolute",
          transformOrigin: "0 0",
          width: WORKSPACE_W,
          height: WORKSPACE_H,
          background: "var(--bg-panel)",
        }}
      >
        {/* Twitch.Player container — inside workspace so zoom/pan applies automatically */}
        <div
          ref={twitchEmbedRef}
          className="canvas-interaction-surface"
          style={{
            position: "absolute",
            left: STREAM_OFFSET_X,
            top: STREAM_OFFSET_Y,
            width: STREAM_W,
            height: STREAM_H,
            display: showTwitchEmbed ? "block" : "none",
            overflow: "hidden",
          }}
        >
          <div
            id="twitch-player-container"
            style={{
              width: "100%",
              height: "100%",
              pointerEvents: twitchInteractionEnabled ? "auto" : "none",
            }}
          />
        </div>
        <div
          className="viewport-rect"
          style={{
            position: "absolute",
            left: STREAM_OFFSET_X,
            top: STREAM_OFFSET_Y - 22,
            fontSize: 11,
            color: "var(--accent-border)",
            fontFamily: "Inter,sans-serif",
            userSelect: "none",
            whiteSpace: "nowrap",
            zIndex: 1,
          }}
        >
          1920 × 1080 — stream viewport
        </div>
        <div
          className="viewport-rect"
          style={{
            position: "absolute",
            left: STREAM_OFFSET_X,
            top: STREAM_OFFSET_Y,
            width: STREAM_W,
            height: STREAM_H,
            background: "transparent",
            outline: "2px solid var(--accent-border)",
            boxSizing: "border-box",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        <div
          ref={snapXGuideRef}
          style={{
            position: "absolute",
            top: STREAM_OFFSET_Y,
            height: STREAM_H,
            width: 2,
            background: "#f97316",
            boxShadow: "0 0 6px rgba(249,115,22,0.8)",
            pointerEvents: "none",
            display: "none",
            zIndex: 2147483647,
          }}
        />
        <div
          ref={snapYGuideRef}
          style={{
            position: "absolute",
            left: STREAM_OFFSET_X,
            width: STREAM_W,
            height: 2,
            background: "#f97316",
            boxShadow: "0 0 6px rgba(249,115,22,0.8)",
            pointerEvents: "none",
            display: "none",
            zIndex: 2147483647,
          }}
        />
        {drawingLayer}
      </div>
      <LiveCursors cursors={cursors} pan={panState} zoom={zoomState} />
      <div
        style={{
          position: "absolute",
          bottom: 12,
          // Leave a full button-width gap for Diagnostics and Help.
          right: 98,
          display: "flex",
          gap: 6,
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {showTwitchEmbed && twitchNeedsReconnect && (
            <button
              className="ui-button"
              onClick={reconnectTwitchPlayer}
              title="Reload only the Twitch player after it was paused by browser visibility rules"
              style={{
                background: "var(--accent-solid)",
                color: "var(--accent-contrast)",
                fontSize: 11,
                pointerEvents: "all",
                padding: "3px 8px",
                borderRadius: 4,
                border: "1px solid var(--accent-border)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                whiteSpace: "nowrap",
              }}
            >
              <RefreshCw size={12} /> Reconnect stream
            </button>
          )}
          <button
            className="ui-button canvas-fit-button"
            onClick={resetView}
            title="Reset zoom and center the 1920×1080 stream area"
            style={{
              background: "rgba(0,0,0,0.7)",
              color: "var(--text-secondary)",
              fontSize: 11,
              pointerEvents: "all",
              padding: "0 10px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {Math.round(zoomState * 100)}% · Fit
          </button>
        </div>
      </div>
    </div>
  );
}
