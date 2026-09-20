import {
  type CanvasElement,
  type DvdCelebrationSettings,
  type ElementEffectAnimation,
} from "../types";
import { useState, useRef, useEffect } from "react";
import { useToast } from "./ToastProvider";
import {
  parseTextSrc,
  getFileLabel,
  STREAM_OFFSET_X,
  STREAM_W,
  STREAM_OFFSET_Y,
  STREAM_H,
} from "../canvas/config";
import {
  Image as ImageIcon,
  Images,
  FileAudio,
  Film,
  Type as TypeIcon,
  ChevronUp,
  ChevronDown,
  Pencil,
  X,
  Eye,
  EyeOff,
  Maximize2,
  Expand,
  Disc,
  FlipHorizontal2,
  FlipVertical2,
  Play,
  Unlock,
  Lock,
  Group as GroupIcon,
} from "lucide-react";
import { randomUUID } from "../utils";
import { getDvdPosition, createDvdMotion } from "../canvas/dvdMotion";
import { DvdCelebrationControls } from "./DvdCelebrationControls";
import { ActionScopeBadge } from "./ActionScopeBadge";
import { applySlotOrder, buildSlots } from "../canvas/layerSlots";

export function ElementPanel({
  elements,
  selectedIds,
  onSelect,
  onToggleVisible,
  onDelete,
  onGroup,
  onUngroup,
  onElementChange,
  onEditText,
  dvdCelebrationSettings,
  dvdSoundUploading,
  onDvdSettingsChange,
  onDvdSoundUpload,
  footer,
}: {
  elements: CanvasElement[];
  selectedIds: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onToggleVisible: (id: string) => void;
  onDelete: (id: string) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onElementChange: (id: string, changes: Partial<CanvasElement>) => void;
  onEditText: (id: string) => void;
  dvdCelebrationSettings: DvdCelebrationSettings;
  dvdSoundUploading: boolean;
  onDvdSettingsChange: (settings: DvdCelebrationSettings) => void;
  onDvdSoundUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  footer?: React.ReactNode;
}) {
  type SelectedAnimation =
    | "slide-lr"
    | "slide-rl"
    | "slide-tb"
    | "slide-bt"
    | "bounce"
    | "float"
    | "sway"
    | "heartbeat"
    | "pulse"
    | "spin"
    | "shake";
  const [layerSearch, setLayerSearch] = useState("");
  const [selectedAnimation, setSelectedAnimation] = useState<SelectedAnimation>("bounce");
  const [animationDuration, setAnimationDuration] = useState(1.2);
  const animationTimersRef = useRef(new Map<string, number>());
  const toast = useToast();
  const slots = buildSlots(elements);
  const normalizedSearch = layerSearch.trim().toLowerCase();
  const visibleSlots = slots
    .map((slot, originalIndex) => ({ slot, originalIndex }))
    .filter(({ slot }) => {
      if (!normalizedSearch) return true;
      const members = slot.kind === "element" ? [slot.el] : slot.members;
      const groupName = slot.kind === "group" ? (slot.members[0]?.groupName ?? "group") : "";
      return [
        groupName,
        ...members.map((element) =>
          element.type === "text"
            ? parseTextSrc(element.src).text
            : element.displayName || getFileLabel(element.src) || element.type,
        ),
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  const icon = (t: string) => {
    const Icon =
      t === "image"
        ? ImageIcon
        : t === "gif"
          ? Images
          : t === "audio"
            ? FileAudio
            : t === "video"
              ? Film
              : TypeIcon;
    return <Icon size={12} strokeWidth={2} />;
  };
  const anyGrouped = [...selectedIds].some((id) => elements.find((e) => e.id === id)?.groupId);
  const canGroup = selectedIds.size >= 2;
  const selectedElement =
    selectedIds.size === 1 ? elements.find((element) => selectedIds.has(element.id)) : undefined;

  useEffect(
    () => () => {
      for (const timer of animationTimersRef.current.values()) window.clearTimeout(timer);
    },
    [],
  );

  const playSelectedAnimation = () => {
    if (!selectedElement || !["image", "gif", "video"].includes(selectedElement.type)) return;
    const durationMs = Math.round(Math.max(0.2, Math.min(10, animationDuration)) * 1000);
    const existingTimer = animationTimersRef.current.get(selectedElement.id);
    if (existingTimer) window.clearTimeout(existingTimer);
    if (!["slide-lr", "slide-rl", "slide-tb", "slide-bt"].includes(selectedAnimation)) {
      const effectLabels: Record<ElementEffectAnimation, string> = {
        pop: "pop",
        pulse: "spotlight pulse",
        spin: "spin",
        shake: "energetic shake",
        bounce: "bounce",
        float: "gentle float",
        sway: "sway",
        heartbeat: "heartbeat",
      };
      onElementChange(selectedElement.id, {
        effectAnimation: selectedAnimation as ElementEffectAnimation,
        effectId: randomUUID(),
        effectStartedAt: Date.now(),
        effectDurationMs: durationMs,
      });
      toast.success(
        `Playing ${effectLabels[selectedAnimation as ElementEffectAnimation]} on ${selectedElement.displayName || getFileLabel(selectedElement.src) || selectedElement.type}`,
      );
      return;
    }

    const original = {
      x: selectedElement.x,
      y: selectedElement.y,
      visible: selectedElement.visible,
    };
    const horizontal = selectedAnimation === "slide-lr" || selectedAnimation === "slide-rl";
    const forward = selectedAnimation === "slide-lr" || selectedAnimation === "slide-tb";
    const laneX = Math.max(
      STREAM_OFFSET_X,
      Math.min(STREAM_OFFSET_X + STREAM_W - selectedElement.width, selectedElement.x),
    );
    const laneY = Math.max(
      STREAM_OFFSET_Y,
      Math.min(STREAM_OFFSET_Y + STREAM_H - selectedElement.height, selectedElement.y),
    );
    const fromX = horizontal
      ? forward
        ? STREAM_OFFSET_X - selectedElement.width
        : STREAM_OFFSET_X + STREAM_W
      : laneX;
    const toX = horizontal
      ? forward
        ? STREAM_OFFSET_X + STREAM_W
        : STREAM_OFFSET_X - selectedElement.width
      : laneX;
    const fromY = horizontal
      ? laneY
      : forward
        ? STREAM_OFFSET_Y - selectedElement.height
        : STREAM_OFFSET_Y + STREAM_H;
    const toY = horizontal
      ? laneY
      : forward
        ? STREAM_OFFSET_Y + STREAM_H
        : STREAM_OFFSET_Y - selectedElement.height;
    onElementChange(selectedElement.id, {
      visible: true,
      dvdEnabled: false,
      x: fromX,
      y: fromY,
      flyStartedAt: Date.now(),
      flyDurationMs: durationMs,
      flyFromX: fromX,
      flyFromY: fromY,
      flyToX: toX,
      flyToY: toY,
    });
    const timer = window.setTimeout(() => {
      onElementChange(selectedElement.id, {
        ...original,
        flyStartedAt: 0,
        flyDurationMs: 0,
        flyFromX: 0,
        flyFromY: 0,
        flyToX: 0,
        flyToY: 0,
      });
      animationTimersRef.current.delete(selectedElement.id);
    }, durationMs + 50);
    animationTimersRef.current.set(selectedElement.id, timer);
    toast.success("Media slide started on the dashboard and overlay");
  };

  const fitSelectedToStream = (mode: "fit" | "fill") => {
    if (!selectedElement || selectedElement.width <= 0 || selectedElement.height <= 0) return;
    const factor =
      mode === "fit"
        ? Math.min(STREAM_W / selectedElement.width, STREAM_H / selectedElement.height)
        : Math.max(STREAM_W / selectedElement.width, STREAM_H / selectedElement.height);
    const width = selectedElement.width * factor;
    const height = selectedElement.height * factor;
    onElementChange(selectedElement.id, {
      x: STREAM_OFFSET_X + (STREAM_W - width) / 2,
      y: STREAM_OFFSET_Y + (STREAM_H - height) / 2,
      width,
      height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      dvdEnabled: false,
    });
  };

  const toggleDvdMotion = () => {
    if (!selectedElement) return;
    if (selectedElement.dvdEnabled) {
      const position = getDvdPosition(selectedElement);
      onElementChange(selectedElement.id, {
        dvdEnabled: false,
        x: position.x,
        y: position.y,
      });
      return;
    }
    onElementChange(selectedElement.id, createDvdMotion(selectedElement));
  };

  const setDvdSpeed = (speed: number) => {
    if (
      !selectedElement?.dvdEnabled ||
      selectedElement.dvdVelocityX === undefined ||
      selectedElement.dvdVelocityY === undefined
    )
      return;
    const currentSpeed = Math.hypot(selectedElement.dvdVelocityX, selectedElement.dvdVelocityY);
    if (currentSpeed <= 0) return;
    const position = getDvdPosition(selectedElement);
    const factor = speed / currentSpeed;
    onElementChange(selectedElement.id, {
      x: position.x,
      y: position.y,
      dvdStartX: position.x,
      dvdStartY: position.y,
      dvdStartedAt: Date.now(),
      dvdVelocityX: selectedElement.dvdVelocityX * factor,
      dvdVelocityY: selectedElement.dvdVelocityY * factor,
    });
  };

  const dvdSpeed = selectedElement?.dvdEnabled
    ? Math.round(Math.hypot(selectedElement.dvdVelocityX ?? 0, selectedElement.dvdVelocityY ?? 0))
    : 0;

  const canFlipSelected =
    selectedElement && ["image", "gif", "video"].includes(selectedElement.type);
  const flipSelected = (axis: "x" | "y") => {
    if (!selectedElement || !canFlipSelected) return;
    onElementChange(
      selectedElement.id,
      axis === "x"
        ? { scaleX: -(selectedElement.scaleX ?? 1) }
        : { scaleY: -(selectedElement.scaleY ?? 1) },
    );
  };

  const moveSlot = (idx: number, dir: "up" | "down") => {
    const arr = [...slots];
    const to = dir === "up" ? idx - 1 : idx + 1;
    if (to < 0 || to >= arr.length) return;
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    applySlotOrder(arr, onElementChange);
  };

  const moveMember = (groupId: string, memberId: string, dir: "up" | "down") => {
    const newSlots = slots.map((slot) => {
      if (slot.kind !== "group" || slot.groupId !== groupId) return slot;
      const arr = [...slot.members];
      const idx = arr.findIndex((m) => m.id === memberId);
      const to = dir === "up" ? idx - 1 : idx + 1;
      if (to < 0 || to >= arr.length) return slot;
      [arr[idx], arr[to]] = [arr[to], arr[idx]];
      return { ...slot, members: arr };
    });
    applySlotOrder(newSlots, onElementChange);
  };

  const arrowBtn = (disabled: boolean, label: string, onClick: () => void) => (
    <button
      className="ui-icon-button ui-button--compact ui-icon-button--ghost layer-row__arrow"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      title={`Move layer ${label}`}
      aria-label={`Move layer ${label}`}
    >
      {label === "up" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
  );

  const renderRow = (
    el: CanvasElement,
    slotIdx: number,
    inGroup: boolean,
    memberIdx?: number,
    groupId?: string,
    groupSize?: number,
  ) => {
    const sel = selectedIds.has(el.id);
    const label =
      el.type === "text"
        ? parseTextSrc(el.src).text.slice(0, 60) || "Text"
        : (el.displayName || getFileLabel(el.src)).slice(0, 80) || el.type;
    const isTop = inGroup ? memberIdx === 0 : slotIdx === 0;
    const isBottom = inGroup ? memberIdx === groupSize! - 1 : slotIdx === slots.length - 1;
    return (
      <div
        key={el.id}
        onClick={(e) => onSelect(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}
        className={`layer-row${sel ? " is-selected" : ""}${inGroup ? " is-grouped" : ""}${el.visible ? "" : " is-hidden"}`}
      >
        <span className="layer-row__icon">{icon(el.type)}</span>
        <span className="layer-row__label" title={label}>
          {label}
        </span>
        <div className="layer-row__tools">
          {el.type !== "text" && (
            <button
              className="ui-icon-button ui-button--compact ui-icon-button--ghost"
              title="Rename this media in the dashboard"
              aria-label={`Rename ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                const value = window
                  .prompt("Media name", el.displayName || getFileLabel(el.src) || el.type)
                  ?.trim();
                if (value) onElementChange(el.id, { displayName: value.slice(0, 120) });
              }}
            >
              <Pencil size={13} />
            </button>
          )}
          {arrowBtn(isTop, "up", () =>
            inGroup ? moveMember(groupId!, el.id, "up") : moveSlot(slotIdx, "up"),
          )}
          {arrowBtn(isBottom, "down", () =>
            inGroup ? moveMember(groupId!, el.id, "down") : moveSlot(slotIdx, "down"),
          )}
          <button
            className="ui-icon-button ui-button--compact ui-icon-button--ghost ui-icon-button--danger"
            title="Delete this layer. Use Ctrl/Cmd + Z immediately afterward to undo"
            aria-label={`Delete ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(el.id);
            }}
          >
            <X size={14} />
          </button>
        </div>
        <button
          className="ui-icon-button ui-button--compact ui-icon-button--ghost layer-row__eye"
          title={el.visible ? "Hide this layer from the overlay" : "Show this layer on the overlay"}
          aria-label={el.visible ? `Hide ${label}` : `Show ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible(el.id);
          }}
        >
          {el.visible ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
      </div>
    );
  };

  return (
    <div
      className="layers-panel"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div className="layers-panel__header">
        <span>Layers</span>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 4 }}>
          {selectedElement && !selectedElement.locked && (
            <span style={{ display: "none" }}>
              <button
                className="ui-button ui-button--compact"
                onClick={() => fitSelectedToStream("fit")}
                title="Fit selected element inside the stream"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  background: "var(--bg-control)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 3,
                  color: "var(--accent-text)",
                  fontSize: 11,
                  padding: "2px 5px",
                  cursor: "pointer",
                }}
              >
                <Maximize2 size={11} /> Fit
              </button>
              <button
                className="ui-button ui-button--compact"
                onClick={() => fitSelectedToStream("fill")}
                title="Fill the stream with the selected element (edges may crop)"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  background: "var(--bg-control)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 3,
                  color: "var(--accent-text)",
                  fontSize: 11,
                  padding: "2px 5px",
                  cursor: "pointer",
                }}
              >
                <Expand size={11} /> Fill
              </button>
              {selectedElement.type !== "audio" && (
                <button
                  className="ui-button ui-button--compact"
                  onClick={toggleDvdMotion}
                  title={
                    selectedElement.dvdEnabled
                      ? "Stop DVD motion at its current position"
                      : "Bounce the selected element around inside the stream"
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    background: selectedElement.dvdEnabled
                      ? "var(--accent-surface-strong)"
                      : "var(--bg-control)",
                    border: selectedElement.dvdEnabled
                      ? "1px solid var(--accent-border)"
                      : "1px solid var(--line-strong)",
                    borderRadius: 3,
                    color: selectedElement.dvdEnabled ? "var(--accent-text)" : "#aaa",
                    fontSize: 11,
                    padding: "2px 5px",
                    cursor: "pointer",
                  }}
                >
                  <Disc size={11} /> DVD
                </button>
              )}
              {canFlipSelected && (
                <>
                  <button
                    className="ui-icon-button ui-button--compact"
                    onClick={() => flipSelected("x")}
                    title="Flip selected media left to right"
                    style={{
                      background: "var(--bg-control)",
                      border: "1px solid var(--line-strong)",
                      color: "var(--accent-text)",
                      cursor: "pointer",
                    }}
                  >
                    <FlipHorizontal2 size={12} />
                  </button>
                  <button
                    className="ui-icon-button ui-button--compact"
                    onClick={() => flipSelected("y")}
                    title="Flip selected media top to bottom"
                    style={{
                      background: "var(--bg-control)",
                      border: "1px solid var(--line-strong)",
                      color: "var(--accent-text)",
                      cursor: "pointer",
                    }}
                  >
                    <FlipVertical2 size={12} />
                  </button>
                </>
              )}
            </span>
          )}
          {canGroup && !anyGrouped && (
            <button
              className="ui-button ui-button--compact"
              onClick={onGroup}
              style={{
                background: "var(--bg-control)",
                border: "1px solid var(--line-strong)",
                borderRadius: 3,
                color: "var(--accent-text)",
                fontSize: 11,
                padding: "1px 4px",
                cursor: "pointer",
              }}
            >
              Group
            </button>
          )}
          {anyGrouped && (
            <button
              className="ui-button ui-button--compact ui-danger"
              onClick={onUngroup}
              title="Ungroup"
              style={{
                background: "var(--bg-control)",
                border: "1px solid var(--line-strong)",
                borderRadius: 3,
                color: "#f87171",
                fontSize: 11,
                padding: "1px 4px",
                cursor: "pointer",
              }}
            >
              Ungroup
            </button>
          )}
        </div>
      </div>
      {elements.length > 0 && (
        <div className="layers-panel__search">
          <input
            value={layerSearch}
            onChange={(event) => setLayerSearch(event.target.value)}
            placeholder="Search layers…"
            aria-label="Search layers"
          />
        </div>
      )}
      {selectedElement?.dvdEnabled && !selectedElement.locked && (
        <div className="dvd-selected-controls">
          <div
            style={{
              height: 34,
              padding: "5px 9px",
              display: "flex",
              alignItems: "center",
              gap: 7,
              borderBottom: "1px solid var(--line)",
              background: "var(--accent-surface)",
              flexShrink: 0,
            }}
          >
            <Disc size={12} color="var(--accent-text)" />
            <span
              style={{
                color: "var(--text-secondary)",
                fontSize: 11,
                fontFamily: "Inter,sans-serif",
              }}
            >
              Speed
            </span>
            <input
              type="range"
              min="40"
              max="400"
              step="10"
              value={Math.min(400, Math.max(40, dvdSpeed))}
              onChange={(event) => setDvdSpeed(Number(event.target.value))}
              style={{
                minWidth: 0,
                flex: 1,
                accentColor: "var(--accent-border)",
                cursor: "pointer",
              }}
            />
            <span
              style={{
                width: 30,
                color: "var(--accent-text)",
                fontSize: 11,
                fontFamily: "monospace",
                textAlign: "right",
              }}
            >
              {dvdSpeed}
            </span>
          </div>
          <DvdCelebrationControls
            settings={dvdCelebrationSettings}
            uploading={dvdSoundUploading}
            onChange={onDvdSettingsChange}
            onSoundUpload={onDvdSoundUpload}
          />
        </div>
      )}
      {selectedElement && (
        <div className="selected-layer-controls">
          <section className="selected-control-section">
            <header>
              <strong>Appearance</strong>
              <span>How this layer looks and enters the stream</span>
            </header>
            {selectedElement.type === "text" && (
              <button
                type="button"
                className="ui-button selected-text-edit-button"
                onClick={() => onEditText(selectedElement.id)}
              >
                <Pencil size={13} /> Edit text and style
              </button>
            )}
            <label className="selected-opacity-control">
              <span>Opacity</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={selectedElement.opacity ?? 1}
                onChange={(event) =>
                  onElementChange(selectedElement.id, {
                    opacity: Number(event.target.value),
                  })
                }
              />
              <output>{Math.round((selectedElement.opacity ?? 1) * 100)}%</output>
            </label>
            <div className="selected-transition-controls">
              {(
                [
                  ["Show effect", "enterAnimation"],
                  ["Hide effect", "exitAnimation"],
                ] as const
              ).map(([label, property]) => (
                <label key={property}>
                  <span>{label}</span>
                  <select
                    value={selectedElement[property] ?? "fade"}
                    onChange={(event) =>
                      onElementChange(selectedElement.id, {
                        [property]: event.target.value as CanvasElement[typeof property],
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="fade">Fade</option>
                    <option value="pop">Pop</option>
                    <option value="slide-left">Slide from left</option>
                    <option value="slide-right">Slide from right</option>
                    <option value="slide-up">Slide from top</option>
                    <option value="slide-down">Slide from bottom</option>
                    <option value="spin">Spin</option>
                  </select>
                </label>
              ))}
            </div>
          </section>

          {["image", "gif", "video"].includes(selectedElement.type) && (
            <section className="selected-control-section selected-media-animation">
              <header className="selected-media-animation__header">
                <span className="selected-media-animation__heading">
                  <strong>Motion</strong>
                  <small>Play a one-time reaction or move across the stream</small>
                </span>
                <ActionScopeBadge scope="both" />
              </header>
              <label className="selected-animation-choice">
                <span>Animation</span>
                <select
                  value={selectedAnimation}
                  onChange={(event) =>
                    setSelectedAnimation(event.target.value as SelectedAnimation)
                  }
                >
                  <optgroup label="Reactions">
                    <option value="bounce">Bounce</option>
                    <option value="float">Gentle float</option>
                    <option value="heartbeat">Heartbeat</option>
                    <option value="sway">Sway</option>
                    <option value="pulse">Spotlight pulse</option>
                    <option value="shake">Energetic shake</option>
                    <option value="spin">Full spin</option>
                  </optgroup>
                  <optgroup label="Travel across stream">
                    <option value="slide-lr">Left → right</option>
                    <option value="slide-rl">Right → left</option>
                    <option value="slide-tb">Top → bottom</option>
                    <option value="slide-bt">Bottom → top</option>
                  </optgroup>
                </select>
              </label>
              <label className="selected-animation-duration">
                <span>Duration</span>
                <input
                  type="range"
                  min="0.3"
                  max="10"
                  step="0.1"
                  value={animationDuration}
                  onChange={(event) => setAnimationDuration(Number(event.target.value))}
                />
                <output>{animationDuration.toFixed(1)}s</output>
              </label>
              <div className="selected-animation-presets" aria-label="Animation duration presets">
                {[0.6, 1.2, 2.5, 5].map((seconds) => (
                  <button
                    type="button"
                    key={seconds}
                    className={Math.abs(animationDuration - seconds) < 0.01 ? "active" : ""}
                    onClick={() => setAnimationDuration(seconds)}
                    aria-label={`Set animation duration to ${seconds} seconds`}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
              <button
                className="ui-button selected-animation-play"
                onClick={playSelectedAnimation}
                title="Play this animation now on the dashboard and overlay"
              >
                <Play size={13} /> Play animation
              </button>
            </section>
          )}

          <section className="selected-control-section selected-layer-protection">
            <header>
              <strong>Protection</strong>
              <span>Prevent accidental canvas edits</span>
            </header>
            <button
              className={`ui-button${selectedElement.locked ? " active" : ""}`}
              onClick={() =>
                onElementChange(selectedElement.id, {
                  locked: !selectedElement.locked,
                })
              }
            >
              {selectedElement.locked ? <Unlock size={13} /> : <Lock size={13} />}
              {selectedElement.locked ? "Unlock layer" : "Lock layer"}
            </button>
          </section>
        </div>
      )}
      {!selectedElement && elements.length > 0 && (
        <div className="layer-selection-hint">
          Select a layer to edit opacity, animations, locking, and effects.
        </div>
      )}
      <div className="layers-list">
        {slots.length === 0 && (
          <div
            style={{
              padding: 16,
              fontSize: 11,
              color: "var(--text-muted)",
              textAlign: "center",
              fontFamily: "Inter,sans-serif",
            }}
          >
            No layers yet. Use Add media, Text, Draw, or drag a file onto the workspace.
          </div>
        )}
        {slots.length > 0 && visibleSlots.length === 0 && (
          <div
            style={{ padding: 16, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}
          >
            No layers match “{layerSearch}”.
          </div>
        )}
        {visibleSlots.map(({ slot, originalIndex: slotIdx }) => {
          if (slot.kind === "element") {
            return renderRow(slot.el, slotIdx, false);
          }
          // Group block
          const groupSelected = slot.members.some((m) => selectedIds.has(m.id));
          const allVisible = slot.members.every((m) => m.visible);
          const isTop = slotIdx === 0;
          const isBottom = slotIdx === slots.length - 1;
          return (
            <div
              key={slot.groupId}
              style={{
                margin: "4px 0",
                border: "1px solid rgba(var(--accent-rgb),0.45)",
                borderRadius: 5,
                background: "rgba(var(--accent-rgb),0.04)",
                overflow: "hidden",
              }}
            >
              {/* Group header row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "4px 6px",
                  background: groupSelected
                    ? "rgba(var(--accent-rgb),0.14)"
                    : "rgba(var(--accent-rgb),0.07)",
                  borderBottom: "1px solid rgba(var(--accent-rgb),0.2)",
                }}
              >
                <GroupIcon size={12} color="var(--accent-text)" />
                <span
                  style={{
                    fontSize: 11,
                    flex: 1,
                    color: "var(--accent-text)",
                    fontFamily: "Inter,sans-serif",
                    fontWeight: 600,
                  }}
                >
                  {slot.members[0]?.groupName || "Group"}{" "}
                  <span style={{ color: "var(--text-muted)", fontWeight: 500, fontSize: 11 }}>
                    ({slot.members.length})
                  </span>
                </span>
                <button
                  className="ui-icon-button ui-button--compact"
                  title="Rename this group"
                  aria-label="Rename group"
                  onClick={(event) => {
                    event.stopPropagation();
                    const value = window
                      .prompt("Group name", slot.members[0]?.groupName || "Group")
                      ?.trim();
                    if (!value) return;
                    slot.members.forEach((member) =>
                      onElementChange(member.id, {
                        groupName: value.slice(0, 80),
                      }),
                    );
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    padding: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    background: "var(--bg-raised)",
                    border: "1px solid var(--line)",
                    color: "var(--accent-text)",
                    cursor: "pointer",
                  }}
                >
                  <Pencil size={11} />
                </button>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    flexShrink: 0,
                  }}
                >
                  {arrowBtn(isTop, "up", () => moveSlot(slotIdx, "up"))}
                  {arrowBtn(isBottom, "down", () => moveSlot(slotIdx, "down"))}
                </div>
                {/* Toggle visibility for all group members */}
                <button
                  className="ui-icon-button ui-button--compact"
                  onClick={(e) => {
                    e.stopPropagation();
                    const target = !allVisible;
                    slot.members.forEach((m) => onElementChange(m.id, { visible: target }));
                  }}
                  title={allVisible ? "Hide group" : "Show group"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "0 2px",
                    color: allVisible ? "var(--accent-text)" : "#555",
                    flexShrink: 0,
                    display: "flex",
                  }}
                >
                  {allVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </div>
              {/* Member rows */}
              {slot.members.map((m, mIdx) =>
                renderRow(m, slotIdx, true, mIdx, slot.groupId, slot.members.length),
              )}
            </div>
          );
        })}
      </div>
      {footer}
      {/* OVER HERE SHOULD BE FINE I THINK */}
    </div>
  );
}
