import { type ReactNode } from "react";
import type { DrawToolMode } from "../drawing/renderStroke";
import { BUTTON_HEIGHT, TOOLBAR_FONT_SIZE } from "./constants";
import type { ToolbarProps } from "./types";

/** Renders the toolbar's standard buttons and drawing tool buttons. */
export function useToolbarButtons(props: ToolbarProps) {
  const { toolMode, onToolModeChange } = props;
  const toolBtn = (label: ReactNode, mode: DrawToolMode, title: string) => (
    <button
      className="ui-button"
      onClick={() => onToolModeChange(mode)}
      title={title}
      style={{
        height: BUTTON_HEIGHT,
        padding: "0 11px",
        background: toolMode === mode ? "var(--accent-solid)" : "var(--bg-control)",
        border: `1px solid ${toolMode === mode ? "var(--accent-border)" : "var(--line-strong)"}`,
        borderRadius: 5,
        color: toolMode === mode ? "var(--accent-contrast)" : "var(--text-secondary)",
        fontSize: TOOLBAR_FONT_SIZE,
        cursor: "pointer",
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
      {label}
    </button>
  );
  const btn = (
    label: ReactNode,
    onClick: () => void,
    active = false,
    title?: string,
    variant: "default" | "primary" | "danger" = "default",
  ) => (
    <button
      className="ui-button"
      data-onboarding-action={title === "Add text" ? "add-text" : undefined}
      onClick={onClick}
      title={title}
      style={{
        height: BUTTON_HEIGHT,
        padding: "0 11px",
        background:
          variant === "danger"
            ? "#7f1d1d"
            : variant === "primary" || active
              ? "var(--accent-solid)"
              : "var(--bg-control)",
        border: `1px solid ${variant === "danger" ? "#ef4444" : variant === "primary" || active ? "var(--accent-border)" : "var(--line-strong)"}`,
        borderRadius: 5,
        color:
          variant === "danger"
            ? "#fee2e2"
            : variant === "primary" || active
              ? "var(--accent-contrast)"
              : "var(--text-secondary)",
        fontSize: TOOLBAR_FONT_SIZE,
        cursor: "pointer",
        fontFamily: "Inter, sans-serif",
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        boxSizing: "border-box",
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  );

  return { toolBtn, btn };
}
