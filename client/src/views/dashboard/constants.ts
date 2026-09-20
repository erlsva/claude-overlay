/** Storage keys and choices for the dashboard's own settings. */

export const OVERLAY_CLIPBOARD_TYPE = "application/x-vicksy-overlay-elements";

export const ONBOARDING_VERSION = "v2";

export const APP_VERSION =
  import.meta.env.VITE_BUILD_ID ?? import.meta.env.VITE_APP_VERSION ?? "local";

export const UI_SCALE_STORAGE_KEY = "overlay_dashboard_ui_scale";

export const UI_SCALE_OPTIONS = [100, 110, 125] as const;

export type DashboardUiScale = (typeof UI_SCALE_OPTIONS)[number];

export function loadDashboardUiScale(): DashboardUiScale {
  const stored = Number(localStorage.getItem(UI_SCALE_STORAGE_KEY));
  return UI_SCALE_OPTIONS.includes(stored as DashboardUiScale) ? (stored as DashboardUiScale) : 100;
}
