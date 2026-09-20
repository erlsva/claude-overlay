import { OverlayMirror } from "../../components/OverlayMirror";
import { CanvasStage } from "../../components/CanvasStage";
import { DrawingCanvas } from "../../components/DrawingCanvas";
import { WORKSPACE_W, WORKSPACE_H } from "../../canvas/config";
import { HelpGuide } from "../../components/HelpGuide";
import { SupportDiagnostics } from "../../components/SupportDiagnostics";
import { APP_VERSION } from "./constants";
import { SelectionHint } from "../../components/SelectionHint";
import type { DashboardContext } from "./context";
import type { DashboardProps } from "./types";

/** The canvas with its overlay preview, drawing layer, help and diagnostics. */
export function CanvasArea({
  props,
  s,
}: {
  props: DashboardProps;
  s: Pick<
    DashboardContext,
    | "activeUsers"
    | "addStroke"
    | "connected"
    | "cursors"
    | "dashboardControlRef"
    | "directUpdateRef"
    | "drawColor"
    | "drawMode"
    | "drawOpacity"
    | "drawSize"
    | "elements"
    | "fillTolerance"
    | "handleDelete"
    | "handleEditText"
    | "handleFillRejected"
    | "handleMediaControl"
    | "handleSelect"
    | "handleSelectMany"
    | "liveStrokes"
    | "mirrorPresence"
    | "overlayConnected"
    | "overlayCount"
    | "previewFlyRef"
    | "selectedIds"
    | "sendCursor"
    | "sendLiveStroke"
    | "setShowOnboarding"
    | "setShowSetup"
    | "setTwitchInteraction"
    | "showTwitchEmbed"
    | "strokes"
    | "studio"
    | "theme"
    | "toggleMirror"
    | "toolMode"
    | "twitchChannel"
    | "twitchInteraction"
    | "updateElement"
  >;
}) {
  const { user } = props;
  const {
    activeUsers,
    addStroke,
    connected,
    cursors,
    dashboardControlRef,
    directUpdateRef,
    drawColor,
    drawMode,
    drawOpacity,
    drawSize,
    elements,
    fillTolerance,
    handleDelete,
    handleEditText,
    handleFillRejected,
    handleMediaControl,
    handleSelect,
    handleSelectMany,
    liveStrokes,
    mirrorPresence,
    overlayConnected,
    overlayCount,
    previewFlyRef,
    selectedIds,
    sendCursor,
    sendLiveStroke,
    setShowOnboarding,
    setShowSetup,
    setTwitchInteraction,
    showTwitchEmbed,
    strokes,
    studio,
    theme,
    toggleMirror,
    toolMode,
    twitchChannel,
    twitchInteraction,
    updateElement,
  } = s;
  return (
    <div style={{ flex: 1, position: "relative", minHeight: 0, isolation: "isolate", zIndex: 3 }}>
      {mirrorPresence.mounted && (
        <OverlayMirror state={mirrorPresence.state} onClose={toggleMirror} />
      )}
      <CanvasStage
        elements={elements}
        cursors={cursors}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onSelectMany={handleSelectMany}
        onElementChange={updateElement}
        onElementDelete={handleDelete}
        onCursorMove={sendCursor}
        onEditText={handleEditText}
        onMediaControl={handleMediaControl}
        mediaControlRef={dashboardControlRef}
        directUpdateRef={directUpdateRef}
        previewFlyRef={previewFlyRef}
        showTwitchEmbed={showTwitchEmbed}
        twitchInteractionEnabled={twitchInteraction && showTwitchEmbed}
        onTwitchInteractionChange={setTwitchInteraction}
        twitchChannel={twitchChannel}
        drawingLayer={
          <DrawingCanvas
            width={WORKSPACE_W}
            height={WORKSPACE_H}
            strokes={strokes}
            liveStrokes={liveStrokes}
            drawMode={drawMode}
            toolMode={toolMode}
            color={drawColor}
            size={drawSize}
            opacity={drawOpacity}
            fillTolerance={fillTolerance}
            onStroke={addStroke}
            onFillRejected={handleFillRejected}
            onLiveStroke={sendLiveStroke}
          />
        }
      />
      {drawMode && liveStrokes.size > 0 && (
        <div className="drawing-presence" role="status">
          <span />
          {[...liveStrokes.keys()]
            .map(
              (userId) =>
                activeUsers.find((activeUser) => activeUser.userId === userId)?.displayName ??
                "Another editor",
            )
            .slice(0, 2)
            .join(", ")}
          {liveStrokes.size > 2 ? ` +${liveStrokes.size - 2}` : ""} drawing
        </div>
      )}
      <HelpGuide
        onOpenTour={() => setShowOnboarding(true)}
        onOpenSetup={() => setShowSetup(true)}
      />
      <SupportDiagnostics
        snapshot={{
          version: APP_VERSION,
          user: user.displayName,
          channel: twitchChannel,
          theme,
          dashboardConnected: connected,
          overlayConnected,
          overlayCount,
          chatConnected: studio.twitchConnected,
          elementCount: elements.length,
          soundCount: studio.sounds.length,
          commandCount: studio.triggers.length,
        }}
      />
      <SelectionHint elements={elements} selectedIds={selectedIds} />
    </div>
  );
}
