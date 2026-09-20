import { useRef, useCallback, useState, useEffect } from "react";
import type { CanvasStageProps } from "./types";

/** The embedded Twitch player: creating it, reconnecting it, and whether it takes the mouse. */
export function useTwitchEmbed(props: CanvasStageProps) {
  const { showTwitchEmbed = false, onTwitchInteractionChange, twitchChannel = "" } = props;
  const twitchEmbedRef = useRef<HTMLDivElement>(null);
  const interactionChangeRef = useRef(onTwitchInteractionChange);
  interactionChangeRef.current = onTwitchInteractionChange;
  const setTwitchInteractionEnabled = useCallback(
    (enabled: boolean) => interactionChangeRef.current?.(enabled),
    [],
  );
  const [twitchNeedsReconnect, setTwitchNeedsReconnect] = useState(false);
  const [twitchPlayerGeneration, setTwitchPlayerGeneration] = useState(0);
  const twitchInitedRef = useRef(false);
  const twitchPlayerRef = useRef<any>(null);
  const twitchHasPlayedRef = useRef(false);
  const twitchSessionRef = useRef(0);
  const twitchNeedsReconnectRef = useRef(false);
  useEffect(() => {
    twitchNeedsReconnectRef.current = twitchNeedsReconnect;
  }, [twitchNeedsReconnect]);
  const reconnectTwitchPlayer = useCallback(() => {
    if (!showTwitchEmbed || !twitchChannel) return;

    // Invalidate events from the old player before removing its iframe.
    twitchSessionRef.current += 1;
    setTwitchInteractionEnabled(false);
    twitchNeedsReconnectRef.current = false;
    setTwitchNeedsReconnect(false);
    twitchHasPlayedRef.current = false;
    twitchPlayerRef.current = null;
    twitchInitedRef.current = false;
    twitchEmbedRef.current?.querySelector("#twitch-player-container")?.replaceChildren();
    setTwitchPlayerGeneration((generation) => generation + 1);
  }, [showTwitchEmbed, twitchChannel]);
  // Twitch.Player — initialize once, then switch channels in the same player.
  useEffect(() => {
    const div = twitchEmbedRef.current;
    if (!div || !twitchChannel) return;

    if (!showTwitchEmbed) {
      div.style.display = "none";
      return;
    }

    div.style.display = "block";

    if (twitchInitedRef.current) {
      setTwitchInteractionEnabled(false);
      twitchPlayerRef.current?.setChannel(twitchChannel);
      return;
    }
    const Twitch = (window as any).Twitch;
    if (!Twitch?.Player) return;
    twitchInitedRef.current = true;
    const session = ++twitchSessionRef.current;

    const player = new Twitch.Player("twitch-player-container", {
      width: "100%",
      height: "100%",
      channel: twitchChannel,
      parent: [window.location.hostname],
      muted: true,
      autoplay: true,
    });
    twitchPlayerRef.current = player;
    player.addEventListener(Twitch.Player.PLAYING, () => {
      if (session !== twitchSessionRef.current) return;
      twitchHasPlayedRef.current = true;
      twitchNeedsReconnectRef.current = false;
      setTwitchNeedsReconnect(false);
      setTwitchInteractionEnabled(false);
    });
    player.addEventListener(Twitch.Player.PAUSE, () => {
      if (session !== twitchSessionRef.current) return;
      if (twitchHasPlayedRef.current) {
        twitchNeedsReconnectRef.current = true;
        setTwitchNeedsReconnect(true);
      }
    });
  }, [showTwitchEmbed, twitchChannel, twitchPlayerGeneration]);
  // Twitch may reject play() after a background-tab visibility pause. Rebuild
  // only its player when the tab returns instead of refreshing the dashboard.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && twitchNeedsReconnectRef.current)
        reconnectTwitchPlayer();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reconnectTwitchPlayer]);

  return {
    twitchEmbedRef,
    interactionChangeRef,
    setTwitchInteractionEnabled,
    twitchNeedsReconnect,
    setTwitchNeedsReconnect,
    twitchPlayerGeneration,
    setTwitchPlayerGeneration,
    twitchInitedRef,
    twitchPlayerRef,
    twitchHasPlayedRef,
    twitchSessionRef,
    twitchNeedsReconnectRef,
    reconnectTwitchPlayer,
  };
}
