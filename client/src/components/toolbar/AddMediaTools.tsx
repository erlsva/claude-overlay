import { BUTTON_HEIGHT, TOOLBAR_FONT_SIZE, ICON_SIZE } from "./constants";
import { ImagePlus, Library, Type } from "lucide-react";
import type { ToolbarContext } from "./context";

/** Add media, the media library and text layers. */
export function AddMediaTools({
  s,
}: {
  s: Pick<ToolbarContext, "btn" | "fileRef" | "setShowLibrary" | "setShowTextDialog" | "uploading">;
}) {
  const { btn, fileRef, setShowLibrary, setShowTextDialog, uploading } = s;
  return (
    <>
      <button
        className="ui-button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        title="Upload an image, GIF, video, or audio file"
        style={{
          height: BUTTON_HEIGHT,
          padding: "0 11px",
          background: "var(--accent-solid)",
          border: "1px solid var(--accent-border)",
          borderRadius: 5,
          color: "var(--accent-contrast)",
          fontSize: TOOLBAR_FONT_SIZE,
          cursor: uploading ? "not-allowed" : "pointer",
          opacity: uploading ? 0.6 : 1,
          fontFamily: "Inter, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          boxSizing: "border-box",
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        <ImagePlus size={ICON_SIZE} />
        {uploading ? "Uploading…" : "Add media"}
      </button>
      {btn(
        <>
          <Library size={ICON_SIZE} /> Library
        </>,
        () => setShowLibrary(true),
        false,
        "Shared media library: files that stay available for everyone",
      )}
      {btn(
        <>
          <Type size={ICON_SIZE} /> Text
        </>,
        () => setShowTextDialog(true),
        false,
        "Add text",
      )}
      <div
        style={{
          width: 1,
          height: 24,
          background: "var(--line)",
          margin: "0 2px",
        }}
      />
    </>
  );
}
