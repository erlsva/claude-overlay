import { useEffect } from "react";

/**
 * Asks search engines to skip a standalone page. On a static host a missing page still comes back
 * as a normal page, so this is also what keeps a 404 out of search results.
 */
export function useNoIndex() {
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.append(robots);
    return () => robots.remove();
  }, []);
}
