import {
  Pencil,
  Eraser,
  PaintBucket,
  Minus,
  ArrowRight,
  Square,
  Circle,
  Palette,
  SlidersHorizontal,
  Droplets,
  Pin,
  Trash2,
} from "lucide-react";
import { ICON_SIZE, BUTTON_HEIGHT, TOOLBAR_FONT_SIZE, PRESET_COLORS } from "./constants";
import type { ToolbarContext } from "./context";
import type { ToolbarProps } from "./types";

/** Pen, colour, size, opacity and the other drawing controls. */
export function DrawingTools({
  props,
  s,
}: {
  props: ToolbarProps;
  s: Pick<ToolbarContext, "btn" | "toolBtn">;
}) {
  const {
    drawColor,
    onDrawColorChange,
    drawSize,
    onDrawSizeChange,
    drawOpacity,
    onDrawOpacityChange,
    fillTolerance,
    onFillToleranceChange,
    toolMode,
    onToolModeChange,
    onDrawClear,
    onSaveDrawingAsElement,
    hasStrokes,
    strokeCount,
  } = props;
  const { btn, toolBtn } = s;
  return (
    <>
      <span
        className="drawing-action-count"
        title="Completed drawing actions; each stroke, shape, or fill can be undone separately"
      >
        DRAWING · {strokeCount}
      </span>
      {/* Tool buttons */}
      {toolBtn(
        <>
          <Pencil size={ICON_SIZE} /> Pen
        </>,
        "pen",
        "Freehand pen",
      )}
      {toolBtn(
        <>
          <Eraser size={ICON_SIZE} /> Erase
        </>,
        "eraser",
        "Eraser",
      )}
      {toolBtn(
        <>
          <PaintBucket size={ICON_SIZE} /> Fill
        </>,
        "fill",
        "Flood fill enclosed area",
      )}
      {toolBtn(
        <>
          <Minus size={ICON_SIZE} /> Line
        </>,
        "line",
        "Draw a straight line. Hold Shift to snap it to 45-degree angles",
      )}
      {toolBtn(
        <>
          <ArrowRight size={ICON_SIZE} /> Arrow
        </>,
        "arrow",
        "Draw an arrow. Hold Shift to snap it to 45-degree angles",
      )}
      {toolBtn(
        <>
          <Square size={ICON_SIZE} /> Box
        </>,
        "rectangle",
        "Draw a rectangle. Hold Shift to make a square",
      )}
      {toolBtn(
        <>
          <Circle size={ICON_SIZE} /> Oval
        </>,
        "ellipse",
        "Draw an ellipse. Hold Shift to make a circle",
      )}

      <div
        style={{
          width: 1,
          height: 24,
          background: "var(--line)",
          margin: "0 2px",
        }}
      />

      {/* Color swatches */}
      <div
        style={{
          height: BUTTON_HEIGHT,
          display: "flex",
          gap: 4,
          alignItems: "center",
          fontSize: TOOLBAR_FONT_SIZE,
          color: "var(--text-muted)",
          fontFamily: "Inter,sans-serif",
        }}
      >
        <Palette size={ICON_SIZE} />
        <span>Color</span>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => {
              onDrawColorChange(c);
              if (toolMode === "eraser" || toolMode === "fill") onToolModeChange("pen");
            }}
            title={`Use ${c} as the drawing color`}
            aria-label={`Use drawing color ${c}`}
            style={{
              width: 20,
              height: 20,
              background: c,
              border:
                drawColor === c && toolMode === "pen"
                  ? "2px solid #fff"
                  : "1.5px solid var(--line-strong)",
              borderRadius: 3,
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          />
        ))}
        <input
          type="color"
          value={drawColor}
          onChange={(e) => {
            onDrawColorChange(e.target.value);
            if (toolMode === "eraser" || toolMode === "fill") onToolModeChange("pen");
          }}
          title="Choose a custom drawing color"
          style={{
            width: 24,
            height: 24,
            padding: 0,
            border: "1.5px solid var(--line-strong)",
            borderRadius: 3,
            cursor: "pointer",
            background: "none",
          }}
        />
      </div>

      {/* Size slider — not shown for fill */}
      {toolMode !== "fill" && (
        <div
          style={{
            height: BUTTON_HEIGHT,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <SlidersHorizontal size={ICON_SIZE} color="var(--text-muted)" />
          <span
            style={{
              fontSize: TOOLBAR_FONT_SIZE,
              color: "var(--text-muted)",
              fontFamily: "Inter,sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            Size
          </span>
          <input
            type="range"
            min="2"
            max="60"
            value={drawSize}
            onChange={(e) => onDrawSizeChange(Number(e.target.value))}
            style={{ width: 80, accentColor: "var(--accent-border)" }}
          />
          <span
            style={{
              fontSize: TOOLBAR_FONT_SIZE,
              color: "var(--text-muted)",
              fontFamily: "Inter,sans-serif",
              minWidth: 20,
            }}
          >
            {drawSize}
          </span>
        </div>
      )}

      <div className="draw-setting">
        <Droplets size={ICON_SIZE} />
        <span>Opacity</span>
        <input
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          value={drawOpacity}
          onChange={(event) => onDrawOpacityChange(Number(event.target.value))}
        />
        <output>{Math.round(drawOpacity * 100)}%</output>
      </div>

      {toolMode === "fill" && (
        <div
          className="draw-setting"
          title="How closely pixels must match for flood fill; lower values stop at sharper boundaries"
        >
          <SlidersHorizontal size={ICON_SIZE} />
          <span>Tolerance</span>
          <input
            type="range"
            min="0"
            max="160"
            step="8"
            value={fillTolerance}
            onChange={(event) => onFillToleranceChange(Number(event.target.value))}
          />
          <output>{fillTolerance}</output>
        </div>
      )}

      {hasStrokes &&
        btn(
          <>
            <Pin size={ICON_SIZE} /> Add as Element
          </>,
          onSaveDrawingAsElement,
          false,
          "Convert drawing to a draggable element",
          "primary",
        )}
      {hasStrokes &&
        btn(
          <>
            <Trash2 size={ICON_SIZE} /> Clear
          </>,
          onDrawClear,
          false,
          "Clear all drawing",
          "danger",
        )}
    </>
  );
}
