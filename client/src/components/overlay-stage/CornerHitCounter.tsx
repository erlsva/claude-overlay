import type { DvdCelebrationSettings } from "../../types";

/** The "CORNER HITS" badge shown while a bouncing element is on screen. */
export function CornerHitCounter({
  counterPosition,
  hitCount,
}: {
  counterPosition: DvdCelebrationSettings["counterPosition"];
  hitCount: number;
}) {
  const counterAtTop = counterPosition.startsWith("top");
  const counterAtCenter = counterPosition.endsWith("center");
  const counterAtLeft = counterPosition.endsWith("left");
  const counterLeft = counterAtCenter ? "50%" : counterAtLeft ? "28px" : "calc(100% - 28px)";
  const counterTop = counterAtTop ? "28px" : "calc(100% - 28px)";
  const counterTransform = `translate(${counterAtCenter ? "-50%" : counterAtLeft ? "0" : "-100%"}, ${counterAtTop ? "0" : "-100%"})`;
  return (
    <div
      style={{
        position: "absolute",
        top: counterTop,
        left: counterLeft,
        transform: counterTransform,
        transition:
          "top 480ms cubic-bezier(.22,1,.36,1), left 480ms cubic-bezier(.22,1,.36,1), transform 480ms cubic-bezier(.22,1,.36,1)",
        zIndex: 1900,
        display: "flex",
        alignItems: "center",
        width: "max-content",
        whiteSpace: "nowrap",
        gap: 10,
        padding: "10px 16px",
        borderRadius: 10,
        color: "#fff7ed",
        background: "rgba(24,18,15,.88)",
        border: "2px solid #f97316",
        boxShadow: "0 5px 18px rgba(0,0,0,.55), 0 0 16px rgba(249,115,22,.22)",
        font: "700 22px Inter,sans-serif",
        letterSpacing: "0.03em",
        pointerEvents: "none",
      }}
    >
      <span>CORNER HITS</span>
      <span
        style={{
          minWidth: 34,
          textAlign: "center",
          padding: "3px 8px",
          borderRadius: 7,
          background: "#f97316",
          color: "#fff",
          fontSize: 24,
        }}
      >
        {hitCount}
      </span>
    </div>
  );
}
