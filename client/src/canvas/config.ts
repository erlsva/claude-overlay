export const STREAM_W = 1920;
export const STREAM_H = 1080;
export const WORKSPACE_W = 4000;
export const WORKSPACE_H = 3000;

export const STREAM_OFFSET_X = Math.round((WORKSPACE_W - STREAM_W) / 2);
export const STREAM_OFFSET_Y = Math.round((WORKSPACE_H - STREAM_H) / 2);
export const SPAWN_X = STREAM_OFFSET_X - 800;
export const SPAWN_Y = STREAM_OFFSET_Y + 100;

export type TextAlignment = "left" | "center" | "right";

export interface TextConfig {
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  textAlign: TextAlignment;
  lineHeight: number;
  letterSpacing: number;
  strokeColor: string;
  strokeWidth: number;
  shadowEnabled: boolean;
  shadowColor: string;
  backgroundEnabled: boolean;
  backgroundColor: string;
}

export const DEFAULT_TEXT_CONFIG: TextConfig = {
  text: "", color: "#ffffff", fontSize: 48, fontFamily: "Inter", fontWeight: 700,
  textAlign: "center", lineHeight: 1.15, letterSpacing: 0, strokeColor: "#000000",
  strokeWidth: 0, shadowEnabled: true, shadowColor: "#000000",
  backgroundEnabled: false, backgroundColor: "#111111",
};

const TEXT_CONFIG_PREFIX = "text:v2:";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function finiteNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeTextConfig(value: Partial<TextConfig>): TextConfig {
  return {
    ...DEFAULT_TEXT_CONFIG,
    text: typeof value.text === "string" ? value.text.slice(0, 9_500) : "",
    color: typeof value.color === "string" && HEX_COLOR.test(value.color) ? value.color : DEFAULT_TEXT_CONFIG.color,
    fontSize: finiteNumber(value.fontSize, DEFAULT_TEXT_CONFIG.fontSize, 8, 400),
    fontFamily: typeof value.fontFamily === "string" && value.fontFamily.length <= 80 ? value.fontFamily : DEFAULT_TEXT_CONFIG.fontFamily,
    fontWeight: finiteNumber(value.fontWeight, DEFAULT_TEXT_CONFIG.fontWeight, 100, 900),
    textAlign: (["left", "center", "right"] as const).includes(value.textAlign as TextAlignment) ? value.textAlign as TextAlignment : DEFAULT_TEXT_CONFIG.textAlign,
    lineHeight: finiteNumber(value.lineHeight, DEFAULT_TEXT_CONFIG.lineHeight, 0.8, 2.5),
    letterSpacing: finiteNumber(value.letterSpacing, DEFAULT_TEXT_CONFIG.letterSpacing, -5, 30),
    strokeColor: typeof value.strokeColor === "string" && HEX_COLOR.test(value.strokeColor) ? value.strokeColor : DEFAULT_TEXT_CONFIG.strokeColor,
    strokeWidth: finiteNumber(value.strokeWidth, DEFAULT_TEXT_CONFIG.strokeWidth, 0, 12),
    shadowEnabled: typeof value.shadowEnabled === "boolean" ? value.shadowEnabled : DEFAULT_TEXT_CONFIG.shadowEnabled,
    shadowColor: typeof value.shadowColor === "string" && HEX_COLOR.test(value.shadowColor) ? value.shadowColor : DEFAULT_TEXT_CONFIG.shadowColor,
    backgroundEnabled: typeof value.backgroundEnabled === "boolean" ? value.backgroundEnabled : DEFAULT_TEXT_CONFIG.backgroundEnabled,
    backgroundColor: typeof value.backgroundColor === "string" && HEX_COLOR.test(value.backgroundColor) ? value.backgroundColor : DEFAULT_TEXT_CONFIG.backgroundColor,
  };
}

export function encodeTextSrc(config: TextConfig): string {
  return `${TEXT_CONFIG_PREFIX}${JSON.stringify(normalizeTextConfig(config))}`;
}

export function parseTextSrc(src: string): TextConfig {
  if (src.startsWith(TEXT_CONFIG_PREFIX)) {
    try {
      return normalizeTextConfig(JSON.parse(src.slice(TEXT_CONFIG_PREFIX.length)));
    } catch {
      return { ...DEFAULT_TEXT_CONFIG };
    }
  }

  // Backward compatibility for existing delimiter-based text layers.
  const [text = "", color = "#ffffff", fs = "48", fontFamily = "Inter"] = src.split("|||");
  return normalizeTextConfig({
    text,
    color,
    fontSize: Number.parseInt(fs, 10),
    fontFamily,
    fontWeight: 400,
    textAlign: "left",
    lineHeight: 1.2,
  });
}

export function getFileLabel(src: string): string {
  try {
    const queryName = new URL(src).searchParams.get("name");
    if (queryName) return queryName;
  } catch {
    // Non-URL sources fall through to their final path segment.
  }
  return src.split("/").pop()?.split("?")[0] ?? "";
}
