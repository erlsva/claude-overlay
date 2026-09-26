import { useEffect } from "react";
import vicksyW from "../assets/vicksyW.png";
import vicksyWLIVE from "../assets/vicksyWLIVE.png";
import { tabTitle } from "../support/liveStatus";
import { useLiveStatus } from "./useLiveStatus";

/**
 * What the browser tab shows: the page's title and the site icon, and while any of `channels` is
 * live a "(LIVE)" prefix and the live version of the icon. Every page uses this, so the tab looks
 * the same wherever you are. The check runs in the background and never holds a page up.
 */
export function useTabIdentity(title: string, channels: readonly string[]) {
  const status = useLiveStatus(channels);

  useEffect(() => {
    document.title = tabTitle(title, status.live);
    let icon = document.getElementById("favicon") as HTMLLinkElement | null;
    if (!icon) {
      icon = document.createElement("link");
      icon.id = "favicon";
      icon.rel = "icon";
      document.head.append(icon);
    }
    icon.href = status.live ? vicksyWLIVE : vicksyW;
  }, [title, status.live]);

  return status;
}
