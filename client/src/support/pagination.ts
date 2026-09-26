/** Pure helpers for the numbered pages on the public clip list. */

/** How many pages a list of `total` items makes. An empty list is still one (empty) page. */
export const pageCount = (total: number, pageSize: number) =>
  Math.max(1, Math.ceil(total / pageSize));

/** A page number from the address bar: whole, and at least 1. Anything else is the first page. */
export function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/**
 * The buttons to show: always the first and last page, the current one with a neighbour either
 * side, and "…" for what is skipped. A gap of a single page shows that page instead of "…", and
 * near either end the run is a little longer so the bar keeps roughly the same width.
 */
export function pageWindow(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const shown = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) for (const page of [2, 3, 4]) shown.add(page);
  if (current >= total - 2) for (const page of [total - 3, total - 2, total - 1]) shown.add(page);
  const sorted = [...shown].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const items: Array<number | "…"> = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined) {
      if (page - previous === 2) items.push(previous + 1);
      else if (page - previous > 2) items.push("…");
    }
    items.push(page);
  });
  return items;
}
