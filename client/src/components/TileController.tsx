import { useEffect } from "react";
import { useTabIdentity } from "../hooks/useTabIdentity";
import { channelLabel } from "../support/liveStatus";
import { useToast } from "./ToastProvider";

/** The tab title and icon for the dashboard and the overlay: live when this channel is. */
export default function TileController({ channel }: { channel: string }) {
  const toast = useToast();
  const { failed } = useTabIdentity(`Stream Overlay | ${channelLabel(channel)}`, [channel]);

  useEffect(() => {
    if (failed) toast.error("Could not check whether the Twitch stream is live");
  }, [failed, toast]);

  return null;
}
