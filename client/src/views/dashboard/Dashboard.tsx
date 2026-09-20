import { lazy, Suspense } from "react";
import { ActivityHistory } from "./ActivityHistory";
import { ConnectionsPopover } from "./ConnectionsPopover";
import { AccountMenu } from "./AccountMenu";
import { CanvasArea } from "./CanvasArea";
import { DashboardTopbar } from "./DashboardTopbar";
import { customAccentVariables } from "../../theme";
import { TextDialog } from "../../components/TextDialog";
import TileController from "../../components/TileController";
import { MessageCircle, Volume2, Activity } from "lucide-react";
import { Toolbar } from "../../components/toolbar/Toolbar";
import { ElementPanel } from "../../components/ElementPanel";
import { RoleTag } from "../../components/RoleTag";
import { WhitelistPanel } from "../../components/WhitelistPanel";
import { SetupGuide } from "../../components/SetupGuide";
import { OnboardingTour } from "../../components/OnboardingTour";
import { type DashboardProps } from "./types";
import { useDashboardServices } from "./useDashboardServices";
import { useDashboardSocket } from "./useDashboardSocket";
import { useAppearance } from "./useAppearance";
import { useDashboardPanels } from "./useDashboardPanels";
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
  const appearance = useAppearance(props, { ...dashboardServices });
  const dashboardPanels = useDashboardPanels(props, { ...dashboardSocket, ...dashboardServices });
  const canvasSelection = useCanvasSelection({ ...dashboardSocket, ...dashboardServices });
  const drawingTools = useDrawingTools({ ...dashboardSocket, ...dashboardServices });
  const textEditing = useTextEditing({ ...dashboardSocket, ...dashboardServices });
  const s: DashboardContext = {
    ...dashboardServices,
    ...dashboardSocket,
    ...appearance,
    ...dashboardPanels,
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
    setActivityMenuOpen,
    setPresenceMenuOpen,
    setProfileMenuOpen,
    activityMenuOpen,
    activityPresence,
    connectionPresence,
    activeUsers,
    presenceMenuOpen,
    profilePresence,
    setShowSetup,
    featureFlags,
    profileMenuOpen,
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
          footer={
            <div
              style={{
                position: "relative",
                borderTop: "1px solid var(--line)",
                padding: 8,
                background: "var(--bg-app)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "block",
                  padding: "0 0 7px",
                  marginBottom: 7,
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <button
                  onClick={() => {
                    setActivityMenuOpen((open) => !open);
                    setPresenceMenuOpen(false);
                    setProfileMenuOpen(false);
                  }}
                  title="Show the complete activity history"
                  aria-expanded={activityMenuOpen}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    minHeight: 32,
                    padding: "0 7px",
                    border: `1px solid ${activityMenuOpen ? "var(--accent-border)" : "var(--line)"}`,
                    borderRadius: 5,
                    background: activityMenuOpen ? "var(--accent-surface)" : "var(--bg-raised)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <Activity size={13} color="var(--accent-text)" />
                  <span style={{ fontSize: 11, fontWeight: 700 }}>Activity</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    {studio.activity.length} {activityMenuOpen ? "▲" : "▼"}
                  </span>
                </button>
                <div style={{ display: "grid", gap: 3, marginTop: 5 }}>
                  {studio.activity.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "5px 7px",
                        border: "1px solid var(--line)",
                        borderRadius: 4,
                        background: "var(--bg-sunken)",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-secondary)",
                          fontSize: 11,
                          lineHeight: 1.35,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <strong>{item.user}</strong> {item.action}
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 1 }}>
                        {new Date(item.at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {studio.activity.length === 0 && (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 11,
                        padding: "4px 7px",
                      }}
                    >
                      No activity yet
                    </div>
                  )}
                </div>
              </div>
              {activityPresence.mounted && <ActivityHistory s={s} />}
              {connectionPresence.mounted && <ConnectionsPopover s={s} />}
              <button
                onClick={() => {
                  setPresenceMenuOpen((open) => !open);
                  setProfileMenuOpen(false);
                  setActivityMenuOpen(false);
                }}
                title="Show overlay status and everyone currently on the dashboard"
                aria-expanded={presenceMenuOpen}
                style={{
                  width: "100%",
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "0 6px",
                  marginBottom: 6,
                  background: presenceMenuOpen ? "var(--bg-raised)" : "transparent",
                  border: "1px solid var(--line)",
                  borderRadius: 5,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: overlayConnected ? "#4ade80" : "#f87171",
                    boxShadow: overlayConnected ? "0 0 6px rgba(74,222,128,0.55)" : "none",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 11, fontWeight: 600 }}>
                  {overlayConnected ? "Overlay Online" : "Overlay Offline"}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ display: "flex", alignItems: "center" }}>
                  {activeUsers.slice(0, 4).map((activeUser, index) => (
                    <img
                      key={activeUser.userId}
                      src={activeUser.avatar}
                      alt={activeUser.displayName}
                      title={`${activeUser.displayName} is active`}
                      style={{
                        width: 22,
                        height: 22,
                        marginLeft: index === 0 ? 0 : -6,
                        borderRadius: "50%",
                        border: `2px solid ${activeUser.color}`,
                        background: "var(--bg-panel)",
                      }}
                    />
                  ))}
                  {activeUsers.length > 4 && (
                    <span
                      style={{
                        marginLeft: 4,
                        color: "var(--text-muted)",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      +{activeUsers.length - 4}
                    </span>
                  )}
                </span>
              </button>
              {profilePresence.mounted && <AccountMenu props={props} s={s} />}
              <button
                onClick={() => {
                  setProfileMenuOpen((open) => !open);
                  setPresenceMenuOpen(false);
                  setActivityMenuOpen(false);
                }}
                aria-expanded={profileMenuOpen}
                title={profileMenuOpen ? "Close account menu" : "Open account menu and settings"}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 6,
                  background: profileMenuOpen ? "var(--bg-raised)" : "transparent",
                  border: "1px solid transparent",
                  borderRadius: 5,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <img
                  src={user.avatar}
                  alt=""
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: `2px solid ${user.color ?? "#9146FF"}`,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    minWidth: 0,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 12,
                  }}
                >
                  {user.displayName}
                </span>
                <RoleTag role={user.role} />
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  {profileMenuOpen ? "▼" : "▲"}
                </span>
              </button>
            </div>
          }
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
        onOpenReadiness={() =>
          window.setTimeout(
            () =>
              document
                .querySelector<HTMLButtonElement>('[data-onboarding-action="readiness"]')
                ?.click(),
            0,
          )
        }
      />
      <OnboardingTour
        open={showOnboarding}
        userName={user.displayName}
        onClose={closeOnboarding}
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
