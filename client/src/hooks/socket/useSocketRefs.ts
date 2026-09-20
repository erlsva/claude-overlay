import { useRef, useEffect } from "react";
import { type CanvasElement, type CursorPayload } from "../../types";
import type { UseSocketOptions } from "../useSocket";

/** Refs the connection keeps between renders: pending updates, timers and playing audio. */
export function useSocketRefs(props: UseSocketOptions) {
  const { onRoleUpdated, onMediaControl } = props;
  // Use refs for callbacks so the socket listener closure always has the latest version
  const onRoleUpdatedRef = useRef(onRoleUpdated);
  const onMediaControlRef = useRef(onMediaControl);
  useEffect(() => {
    onRoleUpdatedRef.current = onRoleUpdated;
  }, [onRoleUpdated]);
  useEffect(() => {
    onMediaControlRef.current = onMediaControl;
  }, [onMediaControl]);
  // Pending updates — batched per rAF frame so overlay gets one setState per frame
  const pendingUpdates = useRef<Map<string, Partial<CanvasElement>>>(new Map());
  const pendingCursors = useRef<Map<string, CursorPayload>>(new Map());
  const cursorExpiryTimers = useRef<Map<string, number>>(new Map());
  const rafRef = useRef(0);
  const connectedOnceRef = useRef(false);
  const lastConnectionToastRef = useRef(0);
  const activeSoundAudioRef = useRef<Set<HTMLAudioElement>>(new Set());
  const previewAudioBySoundRef = useRef<Map<string, Set<HTMLAudioElement>>>(new Map());
  const pendingAudioTests = useRef(
    new Map<string, (result: { ok: boolean; error?: string }) => void>(),
  );

  return {
    onRoleUpdatedRef,
    onMediaControlRef,
    pendingUpdates,
    pendingCursors,
    cursorExpiryTimers,
    rafRef,
    connectedOnceRef,
    lastConnectionToastRef,
    activeSoundAudioRef,
    previewAudioBySoundRef,
    pendingAudioTests,
  };
}
