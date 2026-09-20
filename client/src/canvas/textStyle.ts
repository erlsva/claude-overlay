import { parseTextSrc } from "./config";

export function applyTextStyles(span: HTMLSpanElement, src: string) {
  const config = parseTextSrc(src);
  span.textContent = config.text;
  span.style.color = config.color;
  span.style.fontSize = `${config.fontSize}px`;
  span.style.fontFamily = `${config.fontFamily}, sans-serif`;
  span.style.fontWeight = String(config.fontWeight);
  span.style.textAlign = config.textAlign;
  span.style.lineHeight = String(config.lineHeight);
  span.style.letterSpacing = `${config.letterSpacing}px`;
  span.style.webkitTextStroke = config.strokeWidth
    ? `${config.strokeWidth}px ${config.strokeColor}`
    : "0 transparent";
  span.style.textShadow = config.shadowEnabled ? `1px 2px 5px ${config.shadowColor}` : "none";
  span.style.background = config.backgroundEnabled ? config.backgroundColor : "transparent";
}
