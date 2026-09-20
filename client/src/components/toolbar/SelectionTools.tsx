import { Maximize2, Expand, Disc, FlipHorizontal2, FlipVertical2 } from "lucide-react";
import { ICON_SIZE } from "./constants";
import type { ToolbarContext } from "./context";
import type { ToolbarProps } from "./types";

/** Fit, fill, flip and DVD for the selected element. */
export function SelectionTools({
  props,
  s,
}: {
  props: ToolbarProps;
  s: Pick<ToolbarContext, "btn" | "fitSelected" | "flipSelected" | "toggleDvd">;
}) {
  const { selectedElement, onElementChange } = props;
  if (!selectedElement) return null;
  const { btn, fitSelected, flipSelected, toggleDvd } = s;
  return (
    <>
      <div style={{ width: 1, height: 24, background: "var(--line)", margin: "0 2px" }} />
      <span style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 700 }}>SELECTED</span>
      {btn(
        <>
          <Maximize2 size={ICON_SIZE} /> Fit
        </>,
        () => fitSelected("fit"),
        false,
        "Fit selected element inside the Twitch viewport",
      )}
      {btn(
        <>
          <Expand size={ICON_SIZE} /> Fill
        </>,
        () => fitSelected("fill"),
        false,
        "Fill the Twitch viewport with the selected element",
      )}
      {selectedElement.type !== "audio" &&
        btn(
          <>
            <Disc size={ICON_SIZE} /> DVD
          </>,
          toggleDvd,
          Boolean(selectedElement.dvdEnabled),
          selectedElement.dvdEnabled ? "Stop DVD movement" : "Start DVD movement",
        )}
      {["image", "gif", "video"].includes(selectedElement.type) && (
        <>
          {btn(
            <>
              <FlipHorizontal2 size={ICON_SIZE} /> Flip X
            </>,
            () => flipSelected("x"),
            (selectedElement.scaleX ?? 1) < 0,
            "Mirror selected media left to right",
          )}
          {btn(
            <>
              <FlipVertical2 size={ICON_SIZE} /> Flip Y
            </>,
            () => flipSelected("y"),
            (selectedElement.scaleY ?? 1) < 0,
            "Mirror selected media top to bottom",
          )}
        </>
      )}
      {selectedElement.type === "video" &&
        btn(
          <>Auto</>,
          () =>
            onElementChange(selectedElement.id, {
              autoVisibility: !selectedElement.autoVisibility,
            }),
          Boolean(selectedElement.autoVisibility),
          selectedElement.autoVisibility
            ? "Disable automatic show on play and hide on end"
            : "Automatically show on play and hide when the video ends",
        )}
    </>
  );
}
