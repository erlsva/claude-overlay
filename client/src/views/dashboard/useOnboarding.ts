import { useCallback, useEffect, useState } from "react";
import { ONBOARDING_VERSION } from "./constants";
import type { DashboardProps } from "./types";

const storageKey = (login: string) =>
  `overlay_onboarding_${ONBOARDING_VERSION}_${login.toLowerCase()}`;

/** Whether this person ticked "don't show this again" on the welcome tour. */
export function isOnboardingHidden(login: string): boolean {
  try {
    return localStorage.getItem(storageKey(login)) === "hidden";
  } catch {
    return false;
  }
}

function storeOnboardingHidden(login: string, hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(storageKey(login), "hidden");
    else localStorage.removeItem(storageKey(login));
  } catch {
    // The choice is a convenience; the checkbox still works for this visit without storage.
  }
}

/**
 * On every visit the setup guide opens first and the welcome tour follows once it is closed,
 * until the person ticks "don't show this again". Both stay reachable from the help menu.
 */
export function useOnboarding(user: DashboardProps["user"], panels: { showSetup: boolean }) {
  const { login } = user;
  const [hidden, setHidden] = useState(() => isOnboardingHidden(login));
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [tourQueued, setTourQueued] = useState(() => !isOnboardingHidden(login));

  useEffect(() => {
    if (!tourQueued || panels.showSetup) return;
    setTourQueued(false);
    setShowOnboarding(true);
  }, [tourQueued, panels.showSetup]);

  const closeOnboarding = useCallback(() => setShowOnboarding(false), []);
  const skipQueuedTour = useCallback(() => setTourQueued(false), []);
  const setDontShowOnboardingAgain = useCallback(
    (value: boolean) => {
      setHidden(value);
      storeOnboardingHidden(login, value);
    },
    [login],
  );

  return {
    showOnboarding,
    setShowOnboarding,
    closeOnboarding,
    skipQueuedTour,
    dontShowOnboardingAgain: hidden,
    setDontShowOnboardingAgain,
  };
}
