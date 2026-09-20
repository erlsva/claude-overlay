import { useCallback } from "react";
import { type SoundboardItem } from "../../types";
import type { UseSocketOptions } from "../useSocket";
import type { useSocketRefs } from "./useSocketRefs";
import type { useSocketState } from "./useSocketState";
import type { useSocketServices } from "./useSocketServices";

/** Playing, previewing and stopping soundboard clips, and saving or deleting them. */
export function useSoundActions(
  props: UseSocketOptions,
  deps: Pick<ReturnType<typeof useSocketRefs>, "activeSoundAudioRef" | "previewAudioBySoundRef"> &
    Pick<
      ReturnType<typeof useSocketState>,
      "overlayConnected" | "setPreviewingSoundIds" | "socketRef" | "studio"
    > &
    Pick<ReturnType<typeof useSocketServices>, "toast">,
) {
  const { mode = "dashboard" } = props;
  const {
    activeSoundAudioRef,
    previewAudioBySoundRef,
    overlayConnected,
    setPreviewingSoundIds,
    socketRef,
    studio,
    toast,
  } = deps;
  const startSound = useCallback(
    (
      item: SoundboardItem & { playbackId?: string },
      mutedStart: boolean,
      reportError: boolean,
      previewSoundId?: string,
    ) => {
      const audio = new Audio(item.url);
      audio.dataset.soundId = item.id;
      activeSoundAudioRef.current.add(audio);
      if (previewSoundId) {
        const previews =
          previewAudioBySoundRef.current.get(previewSoundId) ?? new Set<HTMLAudioElement>();
        previews.add(audio);
        previewAudioBySoundRef.current.set(previewSoundId, previews);
        setPreviewingSoundIds((current) =>
          current.includes(previewSoundId) ? current : [...current, previewSoundId],
        );
      }
      audio.preload = "auto";
      audio.volume = item.volume;
      audio.muted = mutedStart;
      const cleanup = () => {
        activeSoundAudioRef.current.delete(audio);
        if (previewSoundId) {
          const previews = previewAudioBySoundRef.current.get(previewSoundId);
          previews?.delete(audio);
          if (!previews?.size) {
            previewAudioBySoundRef.current.delete(previewSoundId);
            setPreviewingSoundIds((current) => current.filter((id) => id !== previewSoundId));
          }
        }
      };
      let completionReported = false;
      const reportPlaybackEnded = (error?: string) => {
        if (completionReported || mode !== "overlay" || !item.playbackId) return;
        completionReported = true;
        socketRef.current?.emit("sound:ended", {
          playbackId: item.playbackId,
          ...(error ? { error } : {}),
        });
      };
      audio.addEventListener(
        "ended",
        () => {
          cleanup();
          reportPlaybackEnded();
        },
        { once: true },
      );
      audio.addEventListener(
        "error",
        () => {
          cleanup();
          reportPlaybackEnded("The overlay could not load the audio.");
          if (reportError)
            toast.error(`Could not load “${item.name}”. Check its URL or uploaded file.`);
        },
        { once: true },
      );
      audio
        .play()
        .then(() => {
          if (mutedStart) audio.muted = false;
        })
        .catch((error) => {
          cleanup();
          reportPlaybackEnded("The overlay browser blocked or could not play the audio.");
          console.error("Soundboard playback failed:", error);
          if (reportError)
            toast.error(`Could not play “${item.name}”. The browser may have blocked audio.`);
        });
    },
    [mode, toast],
  );
  const saveSound = useCallback((item: SoundboardItem) => {
    previewAudioBySoundRef.current.get(item.id)?.forEach((audio) => {
      audio.volume = item.volume;
    });
    socketRef.current?.emit("sound:save", item);
  }, []);
  const deleteSound = useCallback(
    (id: string) => socketRef.current?.emit("sound:delete", { id }),
    [],
  );
  const previewSound = useCallback(
    (id: string) => {
      const item = studio.sounds.find((sound) => sound.id === id);
      if (!item) {
        toast.error("That sound is no longer available.");
        return;
      }
      // Local-only safety preview, started synchronously from the click so the
      // browser recognizes the user gesture.
      startSound(item, false, true, item.id);
    },
    [studio.sounds, startSound, toast],
  );
  /** Stops this browser's own preview of a sound. Nothing on the overlay is touched. */
  const stopPreviewSound = useCallback((id: string) => {
    previewAudioBySoundRef.current.get(id)?.forEach((audio) => {
      audio.pause();
      // Reuse the normal completion path so the bookkeeping is cleared.
      audio.dispatchEvent(new Event("ended"));
    });
  }, []);
  const playSound = useCallback(
    (id: string) => {
      const item = studio.sounds.find((sound) => sound.id === id);
      if (!item) {
        toast.error("That sound is no longer available.");
        return;
      }
      if (!overlayConnected) {
        toast.error("The overlay is offline, so the sound was not played.");
        return;
      }
      socketRef.current?.emit("sound:play", { id });
      toast.success(`Playing “${item.name}” on overlay`);
    },
    [overlayConnected, studio.sounds, toast],
  );
  const stopSound = useCallback(
    (id: string) => {
      const item = studio.sounds.find((sound) => sound.id === id);
      if (!item) {
        toast.error("That sound is no longer available.");
        return;
      }
      if (!overlayConnected) {
        toast.error("The overlay is offline, so there is no sound to stop.");
        return;
      }
      socketRef.current?.emit("sound:stop", { id });
      toast.info(`Stopped “${item.name}” on overlay`);
    },
    [overlayConnected, studio.sounds, toast],
  );

  return {
    startSound,
    saveSound,
    deleteSound,
    previewSound,
    stopPreviewSound,
    playSound,
    stopSound,
  };
}
