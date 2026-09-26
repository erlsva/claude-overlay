import { useEffect } from "react";

/**
 * Titles a standalone page and asks search engines to skip it. On a static host a missing page
 * still comes back as a normal page, so this is also what keeps a 404 out of search results.
 */
export function useNoIndex(title: string) {
  useEffect(() => {
    document.title = `${title} | Stream Overlay`;
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.append(robots);
    return () => robots.remove();
  }, [title]);
}
