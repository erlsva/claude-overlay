import { lazy, Suspense } from "react";
import { CanvasArea } from "./CanvasArea";
import { SidebarFooter } from "./SidebarFooter";
import { DashboardTopbar } from "./DashboardTopbar";
import { customAccentVariables } from "../../theme";
import { TextDialog } from "../../components/TextDialog";
import TileController from "../../components/TileController";
import { MessageCircle, Volume2 } from "lucide-react";
import { Toolbar } from "../../components/toolbar/Toolbar";
import { ElementPanel } from "../../components/layers/ElementPanel";
import { WhitelistPanel } from "../../components/WhitelistPanel";
import { SetupGuide } from "../../components/SetupGuide";
import { OnboardingTour } from "../../components/OnboardingTour";
import { type DashboardProps } from "./types";
import { useDashboardServices } from "./useDashboardServices";
import { useDashboardSocket } from "./useDashboardSocket";
import { useAppearance } from "./useAppearance";
import { useDashboardPanels } from "./useDashboardPanels";
import { useOnboarding } from "./useOnboarding";
import { useCanvasSelection } from "./useCanvasSelection";
import { useDrawingTools } from "./useDrawingTools";
import { useTextEditing } from "./useTextEditing";
import type { DashboardContext } from "./context";

const StudioPanel = lazy(() =>
  import("../../components/studio/StudioPanel").then((module) => ({ default: module.StudioPanel })),
);

export function Dashboard(props: DashboardProps) {
  const dashboardServices = useDashboardServices();
  const dashboardSocket = useDashboardSocket(props, { ...dashboardServices });
  const appearance = useAppearance({ ...dashboardServices });
  const dashboardPanels = useDashboardPanels(props, { ...dashboardSocket, ...dashboardServices });
  const onboarding = useOnboarding(props.user, dashboardPanels);
  const canvasSelection = useCanvasSelection({ ...dashboardSocket, ...dashboardServices });
  const drawingTools = useDrawingTools({ ...dashboardSocket, ...dashboardServices });
  const textEditing = useTextEditing({ ...dashboardSocket, ...dashboardServices });
  const s: DashboardContext = {
    ...dashboardServices,
    ...dashboardSocket,
    ...appearance,
    ...dashboardPanels,
    ...onboarding,
    ...canvasSelection,
    ...drawingTools,
    ...textEditing,
  };
  const { user } = props;
  const {
    theme,
    uiScale,
    customAccent,
    twitchChannel,
    toast,
    overlayConnected,
    studio,
    chatEmoteSettings,
    elements,
    testOverlayAudio,
    isAdmin,
    setShowWhitelist,
    showStudio,
    setShowStudio,
    handleAdd,
    mediaUploadRef,
    saveSound,
    drawMode,
    setDrawMode,
    drawColor,
    setDrawColor,
    drawSize,
    setDrawSize,
    drawOpacity,
    setDrawOpacity,
    fillTolerance,
    setFillTolerance,
    toolMode,
    setToolMode,
    confirm,
    clearStrokes,
    handleSaveDrawingAsElement,
    strokes,
    selectedElement,
    updateElement,
    undo,
    redo,
    historyStatus,
    ttsPlayback,
    selectedIds,
    handleSelect,
    handleDelete,
    handleGroup,
    handleUngroup,
    handleEditText,
    dvdCelebrationSettings,
    dvdSoundUploading,
    setDvdCelebrationSettings,
    handleDvdSoundUpload,
    setShowSetup,
    featureFlags,
    previewFlyRef,
    saveScene,
    loadScene,
    deleteScene,
    savePreset,
    loadPreset,
    deletePreset,
    deleteSound,
    previewSound,
    previewingSoundIds,
    stopPreviewSound,
    playSound,
    stopSound,
    saveTrigger,
    deleteTrigger,
    setChatEmoteSettings,
    showWhitelist,
    editingTextId,
    editingTextConfig,
    handleTextUpdate,
    setEditingTextId,
    showSetup,
    showOnboarding,
    closeOnboarding,
    skipQueuedTour,
    dontShowOnboardingAgain,
    setDontShowOnboardingAgain,
  } = s;

  return (
    <div
      className="dashboard-shell"
      data-theme={theme}
      data-ui-scale={uiScale}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg-app)",
        color: "white",
        overflow: "hidden",
        ...(theme === "custom" ? customAccentVariables(customAccent) : {}),
      }}
    >
      <TileController channel={twitchChannel} />
      {/* Top bar */}
      <DashboardTopbar s={s} />

      <Toolbar
        onAdd={handleAdd}
        mediaUploadRef={mediaUploadRef}
        onSaveSound={saveSound}
        drawMode={drawMode}
        onDrawModeToggle={() => setDrawMode((v) => !v)}
        drawColor={drawColor}
        onDrawColorChange={setDrawColor}
        drawSize={drawSize}
        onDrawSizeChange={setDrawSize}
        drawOpacity={drawOpacity}
        onDrawOpacityChange={setDrawOpacity}
        fillTolerance={fillTolerance}
        onFillToleranceChange={setFillTolerance}
        toolMode={toolMode}
        onToolModeChange={setToolMode}
        onDrawClear={async () => {
          if (
            !(await confirm({
              title: "Clear the drawing?",
              message:
                "This removes every stroke, shape, and fill. You can restore it immediately with Undo.",
              confirmLabel: "Clear drawing",
              danger: true,
            }))
          )
            return;
          clearStrokes();
          toast.success("Drawing cleared");
        }}
        onSaveDrawingAsElement={handleSaveDrawingAsElement}
        hasStrokes={strokes.length > 0}
        strokeCount={strokes.length}
        selectedElement={selectedElement}
        onElementChange={updateElement}
        onUndo={undo}
        onRedo={redo}
        canUndo={historyStatus.canUndo}
        canRedo={historyStatus.canRedo}
        trailing={
          (chatEmoteSettings.enabled || ttsPlayback.enabled) && (
            <>
              {chatEmoteSettings.enabled && (
                <span
                  className="chat-emote-active-indicator"
                  title="Chat emote mode is active on the overlay. Live chat emotes are intentionally not mirrored on the dashboard; use Studio → Emotes for a local preview."
                >
                  <span className="chat-emote-active-indicator__dot" />
                  <MessageCircle size={13} />
                  Chat emotes active
                </span>
              )}
              {ttsPlayback.enabled && (
                <span
                  className="chat-emote-active-indicator"
                  title="TTS playback is enabled for the overlay. Open Studio → TTS to generate clips or turn TTS off."
                >
                  <span className="chat-emote-active-indicator__dot" />
                  <Volume2 size={13} />
                  TTS active
                </span>
              )}
            </>
          )
        }
      />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <ElementPanel
          elements={elements}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onToggleVisible={(id) => {
            const el = elements.find((e) => e.id === id);
            if (el) updateElement(id, { visible: !el.visible });
          }}
          onDelete={handleDelete}
          onGroup={handleGroup}
          onUngroup={handleUngroup}
          onElementChange={updateElement}
          onEditText={handleEditText}
          dvdCelebrationSettings={dvdCelebrationSettings}
          dvdSoundUploading={dvdSoundUploading}
          onDvdSettingsChange={setDvdCelebrationSettings}
          onDvdSoundUpload={handleDvdSoundUpload}
          footer={<SidebarFooter props={props} s={s} />}
        />
        {/* Own stacking layer: canvas layers and the floating preview stay below dialogs, and dialogs stay above Studio. */}
        <CanvasArea props={props} s={s} />
        <div
          className={`studio-panel-shell${showStudio ? " studio-panel-shell--open" : ""}`}
          aria-hidden={!showStudio}
        >
          <Suspense fallback={<div className="studio-panel-loading">Loading Studio…</div>}>
            <StudioPanel
              studio={studio}
              elements={elements}
              selectedIds={selectedIds}
              isOwner={user.isOwner}
              overlayConnected={overlayConnected}
              ttsPlayback={ttsPlayback}
              featureFlags={featureFlags}
              onClose={() => setShowStudio(false)}
              onSaveScene={saveScene}
              onLoadScene={loadScene}
              onDeleteScene={deleteScene}
              onSavePreset={savePreset}
              onLoadPreset={loadPreset}
              onDeletePreset={deletePreset}
              onSaveSound={saveSound}
              onDeleteSound={deleteSound}
              onPreviewSound={previewSound}
              previewingSoundIds={previewingSoundIds}
              onStopPreviewSound={stopPreviewSound}
              onPlaySound={playSound}
              onStopSound={stopSound}
              onSaveTrigger={saveTrigger}
              onDeleteTrigger={deleteTrigger}
              onPreviewFly={(id, direction, durationSeconds, onDone) =>
                previewFlyRef.current?.(id, direction, durationSeconds, onDone) ?? null
              }
              chatEmoteSettings={chatEmoteSettings}
              onChatEmoteSettingsChange={setChatEmoteSettings}
            />
          </Suspense>
        </div>
      </div>

      {isAdmin && (
        <WhitelistPanel
          open={showWhitelist}
          onClose={() => setShowWhitelist(false)}
          isOwner={user.isOwner}
          isAdmin={isAdmin}
        />
      )}

      {editingTextId && (
        <TextDialog
          initial={editingTextConfig}
          onConfirm={handleTextUpdate}
          onClose={() => setEditingTextId(null)}
        />
      )}
      <SetupGuide
        open={showSetup}
        onClose={() => setShowSetup(false)}
        role={user.role}
        roles={user.roles}
        overlayConnected={overlayConnected}
        onTestAudio={testOverlayAudio}
        onOpenReadiness={() => {
          // They went straight on to the Go-live check, so the tour does not cover it.
          skipQueuedTour();
          window.setTimeout(
            () =>
              document
                .querySelector<HTMLButtonElement>('[data-onboarding-action="readiness"]')
                ?.click(),
            0,
          );
        }}
      />
      <OnboardingTour
        open={showOnboarding}
        userName={user.displayName}
        onClose={closeOnboarding}
        dontShowAgain={dontShowOnboardingAgain}
        onDontShowAgainChange={setDontShowOnboardingAgain}
        hasLayers={elements.length > 0}
        overlayConnected={overlayConnected}
        onStartText={() => {
          closeOnboarding();
          window.setTimeout(
            () =>
              document
                .querySelector<HTMLButtonElement>('[data-onboarding-action="add-text"]')
                ?.click(),
            0,
          );
        }}
        onOpenSetup={() => {
          closeOnboarding();
          setShowSetup(true);
        }}
      />
    </div>
  );
}
