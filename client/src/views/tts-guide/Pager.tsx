import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow } from "../../support/pagination";

/** Numbered pages. They are real links, so a page can be opened in a new tab or shared. */
export function Pager({
  page,
  pages,
  hrefFor,
  busy,
  label,
  onGo,
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
  busy: boolean;
  label: string;
  onGo: (page: number) => void;
}) {
  if (pages <= 1) return null;
  const link = (target: number, content: ReactNode, name: string, current = false) => (
    <a
      key={name}
      className="tts-public__page-link"
      href={hrefFor(target)}
      aria-label={name}
      aria-current={current ? "page" : undefined}
      onClick={(event) => {
        // Let a new-tab or new-window click do its normal thing.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        onGo(target);
      }}
    >
      {content}
    </a>
  );
  const edge = (name: string, content: ReactNode) => (
    <span key={name} className="tts-public__page-link is-disabled" aria-hidden="true">
      {content}
    </span>
  );
  const previous = (
    <>
      <ChevronLeft size={17} aria-hidden="true" /> Prev
    </>
  );
  const next = (
    <>
      Next <ChevronRight size={17} aria-hidden="true" />
    </>
  );
  return (
    <nav className="tts-public__pager" aria-label={label} aria-busy={busy}>
      {page > 1 ? link(page - 1, previous, "Previous page") : edge("prev", previous)}
      {pageWindow(page, pages).map((item, index) =>
        item === "…" ? (
          <span key={`gap-${index}`} className="tts-public__page-gap" aria-hidden="true">
            …
          </span>
        ) : (
          link(item, item, `Page ${item}`, item === page)
        ),
      )}
      {page < pages ? link(page + 1, next, "Next page") : edge("next", next)}
    </nav>
  );
}
