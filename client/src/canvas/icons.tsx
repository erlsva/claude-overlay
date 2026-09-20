/** Icons for the hand-built DOM nodes of the canvas. */

import { type LucideIcon } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

/** Renders a Lucide icon to an SVG string for use in imperatively-built DOM nodes. */
export function iconHTML(Icon: LucideIcon, size = 14): string {
  return renderToStaticMarkup(<Icon size={size} strokeWidth={2} />);
}
