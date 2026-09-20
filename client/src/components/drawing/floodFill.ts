export type Rgba = [number, number, number, number];

export function hexToRGBA(hex: string): Rgba {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function withOpacity(color: Rgba, opacity: number) {
  return [color[0], color[1], color[2], Math.round(255 * opacity)] as Rgba;
}

/**
 * Paint-bucket fill from a point. Returns whether the canvas changed. With `requireEnclosed`,
 * a fill that reaches the canvas edge (the open background) is rejected.
 */
export function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColor: Rgba,
  tolerance = 64,
  requireEnclosed = false,
): boolean {
  const canvas = ctx.canvas;
  startX = Math.round(startX);
  startY = Math.round(startY);
  if (startX < 0 || startX >= canvas.width || startY < 0 || startY >= canvas.height) return false;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  const si = (startY * w + startX) * 4;
  const tR = data[si],
    tG = data[si + 1],
    tB = data[si + 2],
    tA = data[si + 3];

  // Don't fill if target already matches fill color
  if (
    Math.abs(tR - fillColor[0]) <= tolerance &&
    Math.abs(tG - fillColor[1]) <= tolerance &&
    Math.abs(tB - fillColor[2]) <= tolerance &&
    Math.abs(tA - fillColor[3]) <= tolerance
  )
    return false;

  const matches = (i: number) =>
    Math.abs(data[i] - tR) <= tolerance &&
    Math.abs(data[i + 1] - tG) <= tolerance &&
    Math.abs(data[i + 2] - tB) <= tolerance &&
    Math.abs(data[i + 3] - tA) <= tolerance;

  const visited = new Uint8Array(w * h);
  const filled = new Uint8Array(w * h);
  const stack = [startY * w + startX];
  const MAX = 3_000_000;
  let count = 0;
  let touchesBoundary = false;

  while (stack.length && count < MAX) {
    const pos = stack.pop()!;
    if (visited[pos]) continue;
    visited[pos] = 1;
    const i4 = pos * 4;
    if (!matches(i4)) continue;
    data[i4] = fillColor[0];
    data[i4 + 1] = fillColor[1];
    data[i4 + 2] = fillColor[2];
    data[i4 + 3] = fillColor[3];
    filled[pos] = 1;
    count++;
    const x = pos % w,
      y = (pos / w) | 0;
    if (x === 0 || x === w - 1 || y === 0 || y === h - 1) touchesBoundary = true;
    if (x > 0) stack.push(pos - 1);
    if (x < w - 1) stack.push(pos + 1);
    if (y > 0) stack.push(pos - w);
    if (y < h - 1) stack.push(pos + w);
  }

  // Expand the fill beneath the anti-aliased inner edge of the brush. `visited`
  // also contains rejected boundary pixels, so use the separate `filled` mask;
  // otherwise the exact edge pixels are skipped and a hairline gap remains.
  for (let pos = 0; pos < w * h; pos++) {
    if (!filled[pos]) continue;
    const x = pos % w,
      y = (pos / w) | 0;
    const neighbors = [
      x > 0 ? pos - 1 : -1,
      x < w - 1 ? pos + 1 : -1,
      y > 0 ? pos - w : -1,
      y < h - 1 ? pos + w : -1,
    ];
    for (const n of neighbors) {
      if (n < 0 || filled[n]) continue;
      const i4 = n * 4;
      if (matches(i4)) continue; // skip open background pixels

      // Composite the fill behind the existing edge rather than replacing it.
      // This closes the transparent anti-alias seam while preserving the
      // brush's original color (including when outline and fill differ).
      const edgeAlpha = data[i4 + 3] / 255;
      const fillAlpha = fillColor[3] / 255;
      const outAlpha = edgeAlpha + fillAlpha * (1 - edgeAlpha);
      if (outAlpha === 0) continue;
      for (let channel = 0; channel < 3; channel++) {
        data[i4 + channel] = Math.round(
          (data[i4 + channel] * edgeAlpha + fillColor[channel] * fillAlpha * (1 - edgeAlpha)) /
            outAlpha,
        );
      }
      data[i4 + 3] = Math.round(outAlpha * 255);
    }
  }

  // A fill that reaches the canvas edge is the open workspace background, not
  // a shape. Discard the mutated ImageData before it ever reaches the canvas.
  // Hitting the safety cap is also treated as open/unsafe rather than applying
  // a partial multi-million-pixel fill.
  if (count === 0 || (requireEnclosed && (touchesBoundary || stack.length > 0))) return false;

  ctx.putImageData(imageData, 0, 0);
  return true;
}
