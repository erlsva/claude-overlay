import { Save, AudioLines, Headphones, Radio, Layers, MessageCircle, X } from "lucide-react";
import { ScenesTab } from "./ScenesTab";
import { PresetsTab } from "./PresetsTab";
import { SoundsTab } from "./SoundsTab";
import { TriggersTab } from "./TriggersTab";
import { EmotesTab } from "./EmotesTab";
import { useToast } from "../ToastProvider";
import { useConfirm } from "../ConfirmProvider";
import { useState } from "react";
import { randomUUID } from "../../utils";
import { TtsPanel } from "../TtsPanel";
import { type StudioPanelProps, type Tab } from "./types";
import { useTriggerBuilder } from "./useTriggerBuilder";
import { useSoundForm } from "./useSoundForm";
import { useEmotePreview } from "./useEmotePreview";
import type { StudioContext } from "./context";

const tabs: Array<[Tab, string, typeof Save]> = [
  ["sounds", "Sounds", AudioLines],
  ["tts", "TTS", Headphones],
  ["triggers", "Automations", Radio],
  ["scenes", "Scenes", Layers],
  ["emotes", "Emotes", MessageCircle],
];

export function StudioPanel(props: StudioPanelProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [selectedTab, setTab] = useState<Tab>("sounds");
  const ttsEnabled = props.featureFlags.tts;
  const scenesEnabled = props.featureFlags.scenes;
  const visibleTabs = tabs.filter(
    ([id]) => (id !== "tts" || ttsEnabled) && (id !== "scenes" || scenesEnabled),
  );
  // The owner can switch TTS off while this tab is open.
  const tab: Tab = visibleTabs.some(([id]) => id === selectedTab) ? selectedTab : "sounds";
  const [name, setName] = useState("");
  const [listSearch, setListSearch] = useState("");
  const createScene = () => {
    if (name.trim()) {
      props.onSaveScene(randomUUID(), name.trim());
      toast.success(`Scene “${name.trim()}” saved`);
      setName("");
    }
  };
  const createPreset = () => {
    if (name.trim() && props.selectedIds.size) {
      props.onSavePreset(randomUUID(), name.trim(), [...props.selectedIds]);
      toast.success(`Preset “${name.trim()}” saved`);
      setName("");
    }
  };
  const shell = { toast, confirm, tab, ttsEnabled, name, setName, listSearch, setListSearch };
  const triggers = useTriggerBuilder(props, shell);
  const sounds = useSoundForm(props, shell);
  const emotes = useEmotePreview();
  const s: StudioContext = {
    ...shell,
    ...triggers,
    ...sounds,
    ...emotes,
    createScene,
    createPreset,
  };

  return (
    <aside className="studio-panel">
      <div className="studio-panel__header">
        <div>
          <strong>Studio</strong>
          <span>Production tools</span>
        </div>
        <button className="ui-icon-button" onClick={props.onClose} title="Close Studio panel">
          <X size={16} />
        </button>
      </div>
      <div
        className="studio-tabs"
        style={{ "--tab-count": visibleTabs.length } as React.CSSProperties}
      >
        {visibleTabs.map(([id, label, Icon]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setListSearch("");
            }}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
        <span
          className="studio-tab-indicator"
          style={{
            transform: `translateX(${visibleTabs.findIndex(([id]) => id === tab) * 100}%)`,
          }}
          aria-hidden="true"
        />
      </div>
      <div className="studio-panel__body">
        {tab === "tts" && ttsEnabled && (
          <TtsPanel overlayConnected={props.overlayConnected} livePlayback={props.ttsPlayback} />
        )}
        {tab === "scenes" && <ScenesTab props={props} s={s} />}
        {tab === "presets" && <PresetsTab props={props} s={s} />}
        {tab === "sounds" && <SoundsTab props={props} s={s} />}
        {tab === "triggers" && <TriggersTab props={props} s={s} />}
        {tab === "emotes" && <EmotesTab props={props} s={s} />}
      </div>
    </aside>
  );
}
