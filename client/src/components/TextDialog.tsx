import { useEffect, useMemo, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Type, X } from "lucide-react";
import {
  DEFAULT_TEXT_CONFIG,
  parseTextSrc,
  type TextAlignment,
  type TextConfig,
} from "../canvas/config";

export type { TextConfig } from "../canvas/config";
export { encodeTextSrc } from "../canvas/config";

const FONTS = ["Inter", "Arial", "Verdana", "Trebuchet MS", "Georgia", "Times New Roman", "Impact", "Courier New", "Comic Sans MS"];
const SIZE_PRESETS = [32, 48, 64, 96];

interface TextDialogProps {
  initial?: TextConfig;
  onConfirm: (config: TextConfig) => void;
  onClose: () => void;
}

export function estimateTextElementSize(config: TextConfig) {
  const lines = config.text.split("\n");
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const characterWidth = config.fontSize * (config.fontFamily === "Courier New" ? 0.62 : 0.55);
  const width = Math.min(1100, Math.max(180, longest * characterWidth + 36));
  const wrappedLines = lines.reduce(
    (total, line) => total + Math.max(1, Math.ceil((line.length * characterWidth) / Math.max(1, width - 36))),
    0,
  );
  const height = Math.min(800, Math.max(70, wrappedLines * config.fontSize * config.lineHeight + 28));
  return { width: Math.round(width), height: Math.round(height) };
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-editor-field">
      <span>{label}</span>
      <span className="text-editor-color">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} picker`} />
        <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={7} aria-label={`${label} hex value`} />
      </span>
    </label>
  );
}

export function TextDialog({ initial, onConfirm, onClose }: TextDialogProps) {
  const [config, setConfig] = useState<TextConfig>(() => ({ ...DEFAULT_TEXT_CONFIG, ...initial }));
  const update = <K extends keyof TextConfig>(key: K, value: TextConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));
  const valid = config.text.trim().length > 0;
  const previewSize = useMemo(() => Math.min(config.fontSize, 72), [config.fontSize]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && valid) onConfirm(config);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [config, onClose, onConfirm, valid]);

  return (
    <div className="text-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="text-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="text-editor-title">
        <header className="text-editor-header">
          <span className="text-editor-heading-icon"><Type size={17} /></span>
          <span><strong id="text-editor-title">{initial ? "Edit text" : "Add text"}</strong><small>Style a text layer for the dashboard and OBS overlay</small></span>
          <button className="ui-icon-button" type="button" onClick={onClose} aria-label="Close text editor" title="Close text editor"><X size={16} /></button>
        </header>

        <div className="text-editor-preview" style={{
          color: config.color,
          fontFamily: `${config.fontFamily}, sans-serif`,
          fontSize: previewSize,
          fontWeight: config.fontWeight,
          textAlign: config.textAlign,
          lineHeight: config.lineHeight,
          letterSpacing: `${config.letterSpacing}px`,
          WebkitTextStroke: config.strokeWidth ? `${Math.min(config.strokeWidth, 4)}px ${config.strokeColor}` : undefined,
          textShadow: config.shadowEnabled ? `1px 2px 5px ${config.shadowColor}` : "none",
          backgroundColor: config.backgroundEnabled ? config.backgroundColor : undefined,
        }}>{config.text || "Your text will appear here"}</div>

        <label className="text-editor-field text-editor-field--wide">
          <span>Text</span>
          <textarea value={config.text} onChange={(event) => update("text", event.target.value.slice(0, 9_500))} placeholder="Type something for the stream…" rows={3} autoFocus />
          <small>{config.text.length.toLocaleString()} / 9,500</small>
        </label>

        <div className="text-editor-grid">
          <label className="text-editor-field text-editor-field--font"><span>Font</span><select value={config.fontFamily} onChange={(event) => update("fontFamily", event.target.value)}>{FONTS.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
          <label className="text-editor-field"><span>Weight</span><select value={config.fontWeight} onChange={(event) => update("fontWeight", Number(event.target.value))}><option value={400}>Regular</option><option value={500}>Medium</option><option value={600}>Semibold</option><option value={700}>Bold</option><option value={800}>Extra bold</option><option value={900}>Black</option></select></label>
          <label className="text-editor-field"><span>Alignment</span><span className="text-editor-segmented">{(["left", "center", "right"] as TextAlignment[]).map((alignment) => { const Icon = alignment === "left" ? AlignLeft : alignment === "right" ? AlignRight : AlignCenter; return <button type="button" key={alignment} className={config.textAlign === alignment ? "active" : ""} onClick={() => update("textAlign", alignment)} aria-label={`Align ${alignment}`} title={`Align text ${alignment}`}><Icon size={14} /></button>; })}</span></label>
          <ColorControl label="Text color" value={config.color} onChange={(value) => update("color", value)} />
        </div>

        <div className="text-editor-range-card">
          <label><span>Size</span><input type="range" min="8" max="400" value={config.fontSize} onChange={(event) => update("fontSize", Number(event.target.value))} /><input type="number" min="8" max="400" value={config.fontSize} onChange={(event) => update("fontSize", Math.min(400, Math.max(8, Number(event.target.value))))} /><output>px</output></label>
          <div className="text-editor-presets">{SIZE_PRESETS.map((size) => <button type="button" key={size} className={config.fontSize === size ? "active" : ""} onClick={() => update("fontSize", size)}>{size}</button>)}</div>
          <label><span>Line height</span><input type="range" min="0.8" max="2.5" step="0.05" value={config.lineHeight} onChange={(event) => update("lineHeight", Number(event.target.value))} /><output>{config.lineHeight.toFixed(2)}</output></label>
          <label><span>Letter spacing</span><input type="range" min="-5" max="30" step="0.5" value={config.letterSpacing} onChange={(event) => update("letterSpacing", Number(event.target.value))} /><output>{config.letterSpacing}px</output></label>
        </div>

        <div className="text-editor-effects">
          <div className="text-editor-effect-row"><label className="text-editor-toggle"><input type="checkbox" checked={config.strokeWidth > 0} onChange={(event) => update("strokeWidth", event.target.checked ? 2 : 0)} /><span>Outline</span></label>{config.strokeWidth > 0 && <><input type="range" min="1" max="12" value={config.strokeWidth} onChange={(event) => update("strokeWidth", Number(event.target.value))} aria-label="Outline width" /><output>{config.strokeWidth}px</output><input type="color" value={config.strokeColor} onChange={(event) => update("strokeColor", event.target.value)} aria-label="Outline color" /></>}</div>
          <div className="text-editor-effect-row"><label className="text-editor-toggle"><input type="checkbox" checked={config.shadowEnabled} onChange={(event) => update("shadowEnabled", event.target.checked)} /><span>Shadow</span></label>{config.shadowEnabled && <input type="color" value={config.shadowColor} onChange={(event) => update("shadowColor", event.target.value)} aria-label="Shadow color" />}</div>
          <div className="text-editor-effect-row"><label className="text-editor-toggle"><input type="checkbox" checked={config.backgroundEnabled} onChange={(event) => update("backgroundEnabled", event.target.checked)} /><span>Background</span></label>{config.backgroundEnabled && <input type="color" value={config.backgroundColor} onChange={(event) => update("backgroundColor", event.target.value)} aria-label="Background color" />}</div>
        </div>

        <footer className="text-editor-actions"><span>Esc to close · Ctrl+Enter to save</span><button className="ui-button" type="button" onClick={onClose}>Cancel</button><button className="ui-button studio-primary" type="button" disabled={!valid} onClick={() => valid && onConfirm(config)}>{initial ? "Save changes" : "Add to overlay"}</button></footer>
      </section>
    </div>
  );
}

export function decodeTextSrc(src: string): TextConfig {
  return parseTextSrc(src);
}
