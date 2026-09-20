import { AddMediaTools } from "./AddMediaTools";
import { SelectionTools } from "./SelectionTools";
import { DrawingTools } from "./DrawingTools";
import { TextDialog } from "../TextDialog";
import { ImagePlus, Undo2, Redo2, X, Pencil } from "lucide-react";
import { MediaLibrary } from "../MediaLibrary";
import { type ToolbarProps } from "./types";
import { ACCEPTED, ICON_SIZE } from "./constants";
import { useToolbarServices } from "./useToolbarServices";
import { useMediaUpload } from "./useMediaUpload";
import { useSelectionTools } from "./useSelectionTools";
import { useToolbarDialogs } from "./useToolbarDialogs";
import { useToolbarButtons } from "./useToolbarButtons";
import type { ToolbarContext } from "./context";

export function Toolbar(props: ToolbarProps) {
  const toolbarServices = useToolbarServices();
  const mediaUpload = useMediaUpload(props, { ...toolbarServices });
  const selectionTools = useSelectionTools(props);
  const toolbarDialogs = useToolbarDialogs(props, { ...toolbarServices });
  const toolbarButtons = useToolbarButtons(props);
  const s: ToolbarContext = {
    ...toolbarServices,
    ...mediaUpload,
    ...selectionTools,
    ...toolbarDialogs,
    ...toolbarButtons,
  };
  const {
    onAdd,
    onSaveSound,
    drawMode,
    onDrawModeToggle,
    selectedElement,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    trailing,
  } = props;
  const {
    dropActive,
    fileRef,
    handleFile,
    btn,
    setShowLibrary,
    setShowTextDialog,
    showLibrary,
    showTextDialog,
    handleTextConfirm,
  } = s;

  return (
    <>
      {dropActive && (
        <div className="media-drop-shield" aria-hidden="true">
          <div>
            <ImagePlus size={28} /> Drop media to upload
          </div>
        </div>
      )}
      <div
        className="dashboard-toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          style={{ display: "none" }}
          onChange={handleFile}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <button
            className="ui-icon-button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo the latest canvas change (Ctrl+Z)"
            style={{
              background: "var(--bg-control)",
              border: "1px solid var(--line-strong)",
              color: canUndo ? "#d6d9df" : "#555",
              cursor: canUndo ? "pointer" : "not-allowed",
            }}
          >
            <Undo2 size={ICON_SIZE} />
          </button>
          <button
            className="ui-icon-button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo the latest undone canvas change (Ctrl+Y)"
            style={{
              background: "var(--bg-control)",
              border: "1px solid var(--line-strong)",
              color: canRedo ? "#d6d9df" : "#555",
              cursor: canRedo ? "pointer" : "not-allowed",
            }}
          >
            <Redo2 size={ICON_SIZE} />
          </button>
        </div>
        <div style={{ width: 1, height: 24, background: "var(--line)", margin: "0 2px" }} />

        {!drawMode && <AddMediaTools s={s} />}

        {btn(
          drawMode ? (
            <>
              <X size={ICON_SIZE} /> Exit Draw
            </>
          ) : (
            <>
              <Pencil size={ICON_SIZE} /> Draw
            </>
          ),
          onDrawModeToggle,
          drawMode,
          "Toggle drawing mode",
        )}

        {!drawMode && selectedElement && !selectedElement.locked && (
          <SelectionTools props={props} s={s} />
        )}

        {drawMode && <DrawingTools props={props} s={s} />}

        {trailing && <div className="toolbar-trailing">{trailing}</div>}
      </div>

      <MediaLibrary
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        onAdd={onAdd}
        onSaveSound={onSaveSound}
      />

      {showTextDialog && (
        <TextDialog onConfirm={handleTextConfirm} onClose={() => setShowTextDialog(false)} />
      )}
    </>
  );
}
