import { useState, useCallback, useEffect } from "react";
import {
  type DashboardTheme,
  loadStoredTheme,
  loadStoredAccent,
  THEME_STORAGE_KEY,
  CUSTOM_ACCENT_STORAGE_KEY,
} from "../../theme";
import { type DashboardUiScale, loadDashboardUiScale, UI_SCALE_STORAGE_KEY } from "./constants";
import { SERVER_URL } from "../../config/server";
import { authHeaders } from "../../hooks/useAuth";
import type { useDashboardServices } from "./useDashboardServices";

/** Theme, accent colour, UI scale and feature switches. */
export function useAppearance(deps: Pick<ReturnType<typeof useDashboardServices>, "toast">) {
  const { toast } = deps;
  const [theme, setTheme] = useState<DashboardTheme>(loadStoredTheme);
  const [customAccent, setCustomAccent] = useState(loadStoredAccent);
  const [uiScale, setUiScale] = useState<DashboardUiScale>(loadDashboardUiScale);
  const [featureSaving, setFeatureSaving] = useState(false);
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem(CUSTOM_ACCENT_STORAGE_KEY, customAccent);
  }, [customAccent]);
  useEffect(() => {
    localStorage.setItem(UI_SCALE_STORAGE_KEY, String(uiScale));
  }, [uiScale]);
  const setFeatureEnabled = useCallback(
    async (key: "tts" | "scenes", enabled: boolean) => {
      setFeatureSaving(true);
      try {
        const response = await fetch(`${SERVER_URL}/features`, {
          method: "PUT",
          credentials: "include",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          // Send only the flag being changed so the server never resets another one.
          body: JSON.stringify({ [key]: enabled }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Could not update feature flags");
        toast.success(
          `${key === "tts" ? "TTS Studio" : "Scenes"} ${enabled ? "enabled" : "disabled"}`,
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update feature flags");
      } finally {
        setFeatureSaving(false);
      }
    },
    [toast],
  );

  return {
    theme,
    setTheme,
    customAccent,
    setCustomAccent,
    uiScale,
    setUiScale,
    featureSaving,
    setFeatureSaving,
    setFeatureEnabled,
  };
}
