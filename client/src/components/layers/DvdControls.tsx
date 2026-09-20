import { Disc } from "lucide-react";
import { DvdCelebrationControls } from "../DvdCelebrationControls";
import type { LayersContext } from "./context";
import type { ElementPanelProps } from "./types";

/** Speed and corner sound for a bouncing (DVD) layer. */
export function DvdControls({
  props,
  s,
}: {
  props: ElementPanelProps;
  s: Pick<LayersContext, "dvdSpeed" | "setDvdSpeed">;
}) {
  const { dvdCelebrationSettings, dvdSoundUploading, onDvdSettingsChange, onDvdSoundUpload } =
    props;
  const { dvdSpeed, setDvdSpeed } = s;
  return (
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
  );
}
