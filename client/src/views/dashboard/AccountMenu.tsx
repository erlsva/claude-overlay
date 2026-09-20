import { Rocket, LogOut } from "lucide-react";
import { Segmented } from "../../components/Segmented";
import { UI_SCALE_OPTIONS } from "./constants";
import type { DashboardContext } from "./context";
import type { DashboardProps } from "./types";

/** The account menu: appearance, feature switches and sign out. */
export function AccountMenu({
  props,
  s,
}: {
  props: DashboardProps;
  s: Pick<
    DashboardContext,
    | "customAccent"
    | "featureFlags"
    | "featureSaving"
    | "profilePresence"
    | "setCustomAccent"
    | "setFeatureEnabled"
    | "setProfileMenuOpen"
    | "setShowCursorOnOverlay"
    | "setShowSetup"
    | "setTheme"
    | "setUiScale"
    | "showCursorOnOverlay"
    | "theme"
    | "toast"
    | "uiScale"
  >;
}) {
  const { onLogout, user } = props;
  const {
    customAccent,
    featureFlags,
    featureSaving,
    profilePresence,
    setCustomAccent,
    setFeatureEnabled,
    setProfileMenuOpen,
    setShowCursorOnOverlay,
    setShowSetup,
    setTheme,
    setUiScale,
    showCursorOnOverlay,
    theme,
    toast,
    uiScale,
  } = s;
  return (
    <div
      className="account-menu motion-popover"
      data-state={profilePresence.state}
      role="menu"
      aria-label="Account and settings"
    >
      <button
        type="button"
        className="account-menu__link"
        onClick={() => {
          setProfileMenuOpen(false);
          setShowSetup(true);
        }}
      >
        <Rocket size={16} />
        <span>
          Setup guide
          <small>Overlay URL, OBS settings, audio test</small>
        </span>
      </button>
      <section className="account-menu__group">
        <h4>Theme</h4>
        <Segmented
          label="Dashboard theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "fox", label: "Fox Orange" },
            { value: "custom", label: "Custom" },
          ]}
        />
        <label className="account-menu__row">
          <span>Custom accent</span>
          <input
            type="color"
            value={customAccent}
            onChange={(event) => {
              setCustomAccent(event.target.value);
              setTheme("custom");
            }}
            title="Choose a custom dashboard accent color"
            className="account-menu__color"
          />
        </label>
      </section>

      <section className="account-menu__group">
        <h4>
          Interface size <small>Dashboard only</small>
        </h4>
        <Segmented
          label="Dashboard interface size"
          value={uiScale}
          onChange={(option) => {
            setUiScale(option);
            toast.success(`Dashboard interface set to ${option}%`);
          }}
          options={UI_SCALE_OPTIONS.map((option) => ({
            value: option,
            label: `${option}%`,
          }))}
        />
        <p className="account-menu__hint">Canvas size and overlay coordinates stay unchanged.</p>
      </section>

      <section className="account-menu__group">
        <h4>Stream</h4>
        <div className="account-menu__row account-menu__row--switch">
          <span>
            <strong>Show my cursor</strong>
            <small>Visible on the overlay. Dashboard users always see it.</small>
          </span>
          <button
            type="button"
            className="ui-switch"
            role="switch"
            aria-checked={showCursorOnOverlay}
            aria-label="Show my cursor on the overlay"
            title="Choose whether your cursor is visible on the overlay; dashboard users always see it"
            onClick={() => {
              const visible = !showCursorOnOverlay;
              setShowCursorOnOverlay(visible);
              toast.success(
                visible
                  ? "Your cursor is now visible on overlay"
                  : "Your cursor is now hidden from overlay",
              );
            }}
          />
        </div>
      </section>

      {user.isOwner && (
        <section className="account-menu__group">
          <h4>
            Feature flags <small>Owner only</small>
          </h4>
          <div className="account-menu__row account-menu__row--switch">
            <span>
              <strong>TTS Studio</strong>
              <small>Tab, generation, replay and trigger actions</small>
            </span>
            <button
              type="button"
              className="ui-switch"
              role="switch"
              aria-checked={featureFlags.tts}
              aria-label="TTS Studio"
              disabled={featureSaving}
              title={
                featureFlags.tts
                  ? "Turn TTS Studio off for everyone"
                  : "Turn TTS Studio on for everyone"
              }
              onClick={() => void setFeatureEnabled("tts", !featureFlags.tts)}
            />
          </div>
          <div className="account-menu__row account-menu__row--switch">
            <span>
              <strong>Scenes</strong>
              <small>Save and restore whole layouts</small>
            </span>
            <button
              type="button"
              className="ui-switch"
              role="switch"
              aria-checked={featureFlags.scenes}
              aria-label="Scenes"
              disabled={featureSaving}
              title={
                featureFlags.scenes ? "Turn Scenes off for everyone" : "Turn Scenes on for everyone"
              }
              onClick={() => void setFeatureEnabled("scenes", !featureFlags.scenes)}
            />
          </div>
        </section>
      )}

      <button type="button" className="account-menu__logout" onClick={onLogout}>
        <LogOut size={14} /> Log out
      </button>
    </div>
  );
}
