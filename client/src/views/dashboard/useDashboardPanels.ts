import { useState, useCallback } from "react";
import { usePresence } from "../../hooks/usePresence";
import { SERVER_URL } from "../../config/server";
import { authHeaders } from "../../hooks/useAuth";
import type { DashboardProps } from "./types";
import { isOnboardingHidden } from "./useOnboarding";
import type { useDashboardSocket } from "./useDashboardSocket";
import type { useDashboardServices } from "./useDashboardServices";

/** Which panels, menus and previews are open, and the DVD corner sound upload. */
export function useDashboardPanels(
  props: DashboardProps,
  deps: Pick<
    ReturnType<typeof useDashboardSocket>,
    "dvdCelebrationSettings" | "setDvdCelebrationSettings"
  > &
    Pick<ReturnType<typeof useDashboardServices>, "toast">,
) {
  const { user } = props;
  const { dvdCelebrationSettings, setDvdCelebrationSettings, toast } = deps;
  const [showWhitelist, setShowWhitelist] = useState(false);
  // The setup guide opens first on every visit, until the tour's "don't show again" is ticked.
  const [showSetup, setShowSetup] = useState(() => !isOnboardingHidden(user.login));
  const [showMirror, setShowMirror] = useState(() => {
    try {
      return localStorage.getItem("overlay_mirror") === "on";
    } catch {
      return false;
    }
  });
  const toggleMirror = useCallback(() => {
    setShowMirror((visible) => {
      try {
        localStorage.setItem("overlay_mirror", visible ? "off" : "on");
      } catch {
        // The preference is a convenience; the toggle still works without storage.
      }
      return !visible;
    });
  }, []);
  const [showTwitchEmbed, setShowTwitchEmbed] = useState(true);
  const [twitchInteraction, setTwitchInteraction] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [dvdSoundUploading, setDvdSoundUploading] = useState(false);
  const [activityMenuOpen, setActivityMenuOpen] = useState(false);
  const [presenceMenuOpen, setPresenceMenuOpen] = useState(false);
  const profilePresence = usePresence(profileMenuOpen);
  const activityPresence = usePresence(activityMenuOpen);
  const connectionPresence = usePresence(presenceMenuOpen);
  const mirrorPresence = usePresence(showMirror);
  const [showStudio, setShowStudio] = useState(true);
  const handleDvdSoundUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setDvdSoundUploading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch(`${SERVER_URL}/upload`, {
          method: "POST",
          body,
          credentials: "include",
          headers: authHeaders(),
        });
        if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
        const { url } = await response.json();
        setDvdCelebrationSettings({
          ...dvdCelebrationSettings,
          soundUrl: `${SERVER_URL}${url}?name=${encodeURIComponent(file.name)}`,
        });
        toast.success(`${file.name} is now the DVD corner sound`);
      } catch (error) {
        console.error("DVD celebration sound upload failed", error);
        toast.error("DVD sound upload failed. Use an MP3, WAV, OGG, or WebM audio file.");
      } finally {
        setDvdSoundUploading(false);
        event.target.value = "";
      }
    },
    [dvdCelebrationSettings, setDvdCelebrationSettings, toast],
  );
  const isAdmin = user.isOwner || user.isAdmin;

  return {
    showWhitelist,
    setShowWhitelist,
    showSetup,
    setShowSetup,
    showMirror,
    setShowMirror,
    toggleMirror,
    showTwitchEmbed,
    setShowTwitchEmbed,
    twitchInteraction,
    setTwitchInteraction,
    profileMenuOpen,
    setProfileMenuOpen,
    dvdSoundUploading,
    setDvdSoundUploading,
    activityMenuOpen,
    setActivityMenuOpen,
    presenceMenuOpen,
    setPresenceMenuOpen,
    profilePresence,
    activityPresence,
    connectionPresence,
    mirrorPresence,
    showStudio,
    setShowStudio,
    handleDvdSoundUpload,
    isAdmin,
  };
}
