import { useRef, useState } from "react";
import {
  AudioLines,
  Headphones,
  MessageCircle,
  Play,
  Pencil,
  Plus,
  Radio,
  Save,
  Square,
  Trash2,
  X,
  BellRing,
  Layers,
  AlertTriangle,
  ArrowRight,
  Link2,
  Search,
} from "lucide-react";
import type {
  CanvasElement,
  OverlayTrigger,
  StudioState,
  TriggerPlacement,
  FlyDirection,
  ChatPermission,
  TriggerStep,
  TriggerEventType,
  ChatEmoteSettings,
  ChatEmoteSpawn,
  TtsPlaybackState,
  FeatureFlags,
} from "../types";
import { randomUUID } from "../utils";
import { getFileLabel } from "../canvas/config";
import { authHeaders } from "../hooks/useAuth";
import { useToast } from "./ToastProvider";
import { ChatEmoteLayer } from "./ChatEmoteLayer";
import previewEmote from "../assets/vicksyW.png";
import { Segmented } from "./Segmented";
import { SliderField } from "./SliderField";
import { useTwitchEvents } from "../hooks/useTwitchEvents";
import { useConfirm } from "./ConfirmProvider";
import { ActionScopeBadge } from "./ActionScopeBadge";

import { TtsPanel } from "./TtsPanel";
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

type Tab =
  | "scenes"
  | "presets"
  | "sounds"
  | "triggers"
  | "emotes"
  | "tts";

interface StudioPanelProps {
  studio: StudioState;
  elements: CanvasElement[];
  selectedIds: Set<string>;
  isOwner: boolean;
  overlayConnected: boolean;
  ttsPlayback: TtsPlaybackState;
  featureFlags: FeatureFlags;
  onClose: () => void;
  onSaveScene: (id: string, name: string) => void;
  onLoadScene: (id: string) => void;
  onDeleteScene: (id: string) => void;
  onSavePreset: (id: string, name: string, elementIds: string[]) => void;
  onLoadPreset: (id: string) => void;
  onDeletePreset: (id: string) => void;
  onSaveSound: (item: {
    id: string;
    name: string;
    url: string;
    volume: number;
  }) => void;
  onDeleteSound: (id: string) => void;
  onPreviewSound: (id: string) => void;
  previewingSoundIds: string[];
  onStopPreviewSound: (id: string) => void;
  onPlaySound: (id: string) => void;
  onStopSound: (id: string) => void;
  onSaveTrigger: (trigger: OverlayTrigger) => void;
  onDeleteTrigger: (id: string) => void;
  onPreviewFly: (
    id: string,
    direction: FlyDirection,
    durationSeconds: number,
    onDone?: () => void,
  ) => (() => void) | null;
  chatEmoteSettings: ChatEmoteSettings;
  onChatEmoteSettingsChange: (settings: ChatEmoteSettings) => void;
}

const tabs: Array<[Tab, string, typeof Save]> = [
  ["sounds", "Sounds", AudioLines],
  ["tts", "TTS", Headphones],
  ["triggers", "Automations", Radio],
  ["scenes", "Scenes", Layers],
  ["emotes", "Emotes", MessageCircle],
];

// Colour, border and radius come from the shared `.studio-panel` field rules.
const fieldStyle = {
  width: "100%",
  height: 34,
  boxSizing: "border-box" as const,
  padding: "0 12px",
  fontSize: 13,
};

const triggerActionOptions: Array<{
  value: OverlayTrigger["action"];
  label: string;
}> = [
  { value: "show-element", label: "Show element" },
  { value: "show-temporary", label: "Show image temporarily" },
  { value: "fly-across", label: "Fly across stream" },
  { value: "hide-element", label: "Hide element" },
  { value: "toggle-element", label: "Toggle element visibility" },
  { value: "play-media", label: "Play video/audio layer, then hide" },
  { value: "play-sound", label: "Play Soundboard clip" },
  { value: "enable-dvd", label: "Start DVD movement" },
  { value: "refresh-overlay", label: "Refresh overlay" },
  { value: "send-chat", label: "Send Twitch chat message" },
  { value: "tts", label: "Generate / replay TTS" },
];

const TRIGGER_EVENT_LABELS: Partial<Record<OverlayTrigger["event"], string>> = {
  follow: "New follow",
  subscribe: "Subscription",
  "gift-subscribe": "Gift subs",
  raid: "Raid",
  bits: "Bits",
  "channel-points": "Channel points",
  ban: "Ban",
  timeout: "Timeout",
};

const triggerActionLabel = (action: OverlayTrigger["action"]) =>
  triggerActionOptions.find((option) => option.value === action)?.label ??
  action;
const triggerTimingLabel = (step: TriggerStep, index: number) => {
  if (index === 0 || !step.timing || step.timing === "immediate")
    return "same time";
  if (step.timing === "after-previous") return "after previous";
  return `after ${step.delaySeconds ?? 1}s`;
};

export function StudioPanel(props: StudioPanelProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [selectedTab, setTab] = useState<Tab>("sounds");
  const ttsEnabled = props.featureFlags.tts;
  const scenesEnabled = props.featureFlags.scenes;
  const visibleTabs = tabs.filter(([id]) => (id !== "tts" || ttsEnabled) && (id !== "scenes" || scenesEnabled));
  // The owner can switch TTS off while this tab is open.
  const tab: Tab = visibleTabs.some(([id]) => id === selectedTab) ? selectedTab : "sounds";
  const [name, setName] = useState("");
  const [soundUrl, setSoundUrl] = useState("");
  const [triggerAction, setTriggerAction] =
    useState<OverlayTrigger["action"]>("show-element");
  const [triggerMatch, setTriggerMatch] = useState("");
  const [triggerEvent, setTriggerEvent] =
    useState<Exclude<TriggerEventType, "chat-command">>("follow");
  const [triggerMinimum, setTriggerMinimum] = useState(1);
  const [triggerChannel, setTriggerChannel] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [ttsErrorMessage, setTtsErrorMessage] = useState("");
  const [targetId, setTargetId] = useState("");
  const [cooldown, setCooldown] = useState(5);
  const [triggerPlacement, setTriggerPlacement] =
    useState<TriggerPlacement>("current");
  const [flyDirection, setFlyDirection] = useState<FlyDirection>(
    "left-to-right-bottom",
  );
  const [duration, setDuration] = useState(5);
  const [permission, setPermission] = useState<ChatPermission>("everyone");
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [chainedSteps, setChainedSteps] = useState<TriggerStep[]>([]);
  const [editingChainIndex, setEditingChainIndex] = useState<number | null>(
    null,
  );
  const [stepTiming, setStepTiming] =
    useState<NonNullable<TriggerStep["timing"]>>("immediate");
  const [stepDelay, setStepDelay] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [emotePreview, setEmotePreview] = useState<ChatEmoteSpawn | null>(null);
  const [emoteRunning, setEmoteRunning] = useState(false);
  const [emoteClear, setEmoteClear] = useState(0);
  const [flyRunning, setFlyRunning] = useState(false);
  const flyStopRef = useRef<(() => void) | null>(null);
  const [blacklistName, setBlacklistName] = useState("");
  const [blockedEmoteName, setBlockedEmoteName] = useState("");
  const [additionalEmoteName, setAdditionalEmoteName] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  // What the builder is creating or editing, independent of the list filter.
  const [kind, setKind] = useState<"chat" | "event">("chat");
  const [filter, setFilter] = useState<"all" | "chat" | "event">("all");
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const isEvent = kind === "event";
  const pendingStepBeforeChainEdit = useRef<TriggerStep | null>(null);
  const twitchEvents = useTwitchEvents(tab === "triggers");
  const eventStatus = twitchEvents.status;
  const chatbotHasWriteAccess = !!(
    eventStatus?.chatbot?.connected &&
    eventStatus.chatbot.scopes.includes("user:write:chat")
  );
  const unavailableChatChannels =
    eventStatus?.channels.filter((channel) => !channel.connected) ?? [];
  const chatConnectionWarning = !!eventStatus && (
    !eventStatus.configured ||
    !chatbotHasWriteAccess ||
    unavailableChatChannels.length > 0
  );

  // The builder stays out of the way once commands exist: the saved list comes
  // first, and the form opens on demand, while editing, or on first use.
  const hasTriggersForTab = props.studio.triggers.length > 0;
  const isChatTrigger = (item: OverlayTrigger) => item.event === "chat-command";
  const chatCount = props.studio.triggers.filter(isChatTrigger).length;
  const eventCount = props.studio.triggers.length - chatCount;
  const visibleTriggers = props.studio.triggers.filter(
    (item) =>
      (filter === "all" || (filter === "chat") === isChatTrigger(item)) &&
      [item.name, item.match ?? "", item.event].some((value) =>
        value.toLowerCase().includes(listSearch.trim().toLowerCase()),
      ),
  );
  const builderVisible = builderOpen || !!editingTriggerId || !hasTriggersForTab;

  const currentTriggerStep = (): TriggerStep => ({
    action: triggerAction,
    targetId: targetId || undefined,
    placement: ["play-media", "show-temporary"].includes(triggerAction)
      ? triggerPlacement
      : undefined,
    durationSeconds: ["show-temporary", "fly-across"].includes(triggerAction)
      ? duration
      : undefined,
    flyDirection: triggerAction === "fly-across" ? flyDirection : undefined,
    timing: stepTiming,
    delaySeconds: stepTiming === "delay" ? stepDelay : undefined,
    chatMessage: ["send-chat", "tts"].includes(triggerAction) ? chatMessage.trim() : undefined,
    ttsErrorMessage: triggerAction === "tts" && ttsErrorMessage.trim() ? ttsErrorMessage.trim() : undefined,
  });

  const resetTriggerStep = () => {
    setTriggerAction("show-element");
    setTargetId("");
    setTriggerPlacement("current");
    setFlyDirection("left-to-right-bottom");
    setDuration(5);
    setStepTiming("immediate");
    setStepDelay(1);
    setChatMessage("");
    setTtsErrorMessage("");
    setEditingChainIndex(null);
  };

  const loadTriggerStep = (step: TriggerStep) => {
    setTriggerAction(step.action);
    setTargetId(step.targetId ?? "");
    setTriggerPlacement(step.placement ?? "current");
    setFlyDirection(step.flyDirection ?? "left-to-right-bottom");
    setDuration(step.durationSeconds ?? 5);
    setStepTiming(step.timing ?? "immediate");
    setStepDelay(step.delaySeconds ?? 1);
    setChatMessage(step.chatMessage ?? "");
    setTtsErrorMessage(step.ttsErrorMessage ?? "");
  };

  const resetTriggerForm = () => {
    setName("");
    setTriggerMatch("");
    setCooldown(5);
    setPermission("everyone");
    setChainedSteps([]);
    setEditingTriggerId(null);
    pendingStepBeforeChainEdit.current = null;
    resetTriggerStep();
  };

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
  const createSound = async () => {
    if (soundUrl.trim()) {
      try {
        setUploading(true);
        const response = await fetch(`${SERVER_URL}/myinstants/resolve`, {
          method: "POST",
          credentials: "include",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ url: soundUrl.trim() }),
        });
        const data = (await response.json()) as {
          url?: string;
          title?: string;
          error?: string;
        };
        if (!response.ok || !data.url)
          throw new Error(data.error ?? "Could not resolve Myinstants link");
        const soundName = name.trim() || data.title || "Myinstants sound";
        props.onSaveSound({
          id: randomUUID(),
          name: soundName,
          url: data.url,
          volume: 0.25,
        });
        toast.success(`Sound “${soundName}” added`);
        setName("");
        setSoundUrl("");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not add Myinstants sound",
        );
      } finally {
        setUploading(false);
      }
    }
  };
  const uploadSound = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${SERVER_URL}/upload`, {
        method: "POST",
        body,
        headers: authHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          data.error ?? `Sound upload failed (${response.status})`,
        );
      }
      const data = (await response.json()) as { url: string };
      props.onSaveSound({
        id: randomUUID(),
        name: name.trim() || file.name.replace(/\.[^.]+$/, ""),
        url: `${SERVER_URL}${data.url}`,
        volume: 0.25,
      });
      setName("");
      setSoundUrl("");
      toast.success(`${file.name} added to the soundboard`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Sound upload failed",
      );
    } finally {
      setUploading(false);
    }
  };
  const createTrigger = () => {
    if (editingChainIndex !== null) {
      toast.error("Finish updating the command action first");
      return;
    }
    if (
      !name.trim() ||
      (!["refresh-overlay", "send-chat", "tts"].includes(triggerAction) &&
        !targetId) ||
      (["send-chat", "tts"].includes(triggerAction) && !chatMessage.trim())
    )
      return;
    const steps = [...chainedSteps, currentTriggerStep()];
    props.onSaveTrigger({
      id: editingTriggerId ?? randomUUID(),
      name: name.trim(),
      enabled: editingTriggerId
        ? (props.studio.triggers.find(
            (trigger) => trigger.id === editingTriggerId,
          )?.enabled ?? true)
        : true,
      event: isEvent ? triggerEvent : "chat-command",
      match:
        isEvent && triggerEvent !== "channel-points"
          ? undefined
          : triggerMatch.trim() || undefined,
      minimum:
        isEvent &&
        ["subscribe", "gift-subscribe", "raid", "bits"].includes(triggerEvent)
          ? triggerMinimum
          : undefined,
      channel: isEvent ? triggerChannel || undefined : undefined,
      ...steps[0],
      cooldownSeconds: cooldown,
      permission,
      steps: steps.length > 1 ? steps : undefined,
    });
    toast.success(
      editingTriggerId
        ? `${isEvent ? "Event trigger" : "Chat command"} updated`
        : `${isEvent ? "Event trigger" : "Chat command"} added`,
    );
    resetTriggerForm();
    setBuilderOpen(false);
  };

  const editTrigger = (trigger: OverlayTrigger) => {
    pendingStepBeforeChainEdit.current = null;
    setEditingChainIndex(null);
    setEditingTriggerId(trigger.id);
    setKind(trigger.event === "chat-command" ? "chat" : "event");
    setName(trigger.name);
    setTriggerMatch(trigger.match ?? "");
    if (trigger.event !== "chat-command") setTriggerEvent(trigger.event);
    setTriggerMinimum(trigger.minimum ?? 1);
    setTriggerChannel(trigger.channel ?? "");
    const steps = trigger.steps?.length ? trigger.steps : [trigger];
    const current = steps.at(-1)!;
    setChainedSteps(steps.slice(0, -1));
    loadTriggerStep(current);
    setCooldown(trigger.cooldownSeconds);
    setPermission(trigger.permission ?? "everyone");
  };

  const cancelTriggerEdit = () => {
    resetTriggerForm();
    setBuilderOpen(false);
    toast.info("Command editing cancelled");
  };

  const testTrigger = async (item: OverlayTrigger) => {
    const steps = item.steps?.length ? item.steps : [item];
    const sendsChat = steps.some((step) => step.action === "send-chat");
    const usesTts = steps.some((step) => step.action === "tts");
    if (sendsChat || usesTts) {
      const effects = [
        sendsChat && "post a message in Twitch chat",
        usesTts && "generate paid TTS audio",
      ].filter(Boolean).join(" and ");
      if (!await confirm({
        title: `Run “${item.name}” as a test?`,
        message: `This will really ${effects}. Cooldowns and permissions are ignored.`,
        confirmLabel: "Run test",
      })) return;
    }
    if (!props.overlayConnected) {
      toast.info("The overlay is offline, so nothing will show or play there.");
    }
    try {
      const response = await fetch(`${SERVER_URL}/triggers/${item.id}/test`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not run the test");
      toast.success(`Test of “${item.name}” started`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run the test");
    }
  };

  const closeBuilder = () => {
    resetTriggerForm();
    setBuilderOpen(false);
  };

  const addChainedStep = () => {
    if (
      (!["refresh-overlay", "send-chat", "tts"].includes(triggerAction) &&
        !targetId) ||
      (["send-chat", "tts"].includes(triggerAction) && !chatMessage.trim())
    ) {
      toast.error(
        ["send-chat", "tts"].includes(triggerAction)
          ? triggerAction === "tts"
            ? "Enter a TTS scene prompt or saved token before adding this action"
            : "Enter a chat message before adding this action"
          : "Choose a target before adding this action",
      );
      return;
    }
    if (chainedSteps.length >= 9 && editingChainIndex === null) {
      toast.error("A command can contain up to 10 actions");
      return;
    }
    if (editingChainIndex !== null) {
      setChainedSteps((steps) =>
        steps.map((step, index) =>
          index === editingChainIndex ? currentTriggerStep() : step,
        ),
      );
      toast.success("Command action updated");
      const pendingStep = pendingStepBeforeChainEdit.current;
      pendingStepBeforeChainEdit.current = null;
      if (pendingStep) loadTriggerStep(pendingStep);
      else resetTriggerStep();
      setEditingChainIndex(null);
    } else {
      setChainedSteps((steps) => [...steps, currentTriggerStep()]);
      toast.success("Action added to command chain");
      resetTriggerStep();
    }
  };

  const editChainedStep = (step: TriggerStep, index: number) => {
    if (editingChainIndex === null)
      pendingStepBeforeChainEdit.current = currentTriggerStep();
    setEditingChainIndex(index);
    loadTriggerStep(step);
  };

  const currentStepIsFirst =
    editingChainIndex === 0 ||
    (editingChainIndex === null && chainedSteps.length === 0);
  const selectedTargetElement = props.elements.find((element) => element.id === targetId);
  const selectedTargetSound = props.studio.sounds.find((sound) => sound.id === targetId);

  return (
    <aside className="studio-panel">
      <div className="studio-panel__header">
        <div>
          <strong>Studio</strong>
          <span>Production tools</span>
        </div>
        <button
          className="ui-icon-button"
          onClick={props.onClose}
          title="Close Studio panel"
        >
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
        {tab === "tts" && ttsEnabled && <TtsPanel overlayConnected={props.overlayConnected} livePlayback={props.ttsPlayback} />}
        {tab === "scenes" && (
          <Section
            title="Scenes"
            description="Save or restore the complete canvas and drawing."
          >
            <CreateRow
              name={name}
              setName={setName}
              placeholder="Scene name"
              onCreate={createScene}
              label="Save scene"
            />
            {props.studio.scenes.length === 0 && (
              <div className="studio-empty-state">
                <strong>No saved scenes yet</strong>
                <span>Arrange your layers, name the layout above and save it. Loading a scene replaces the current canvas, and Undo brings it back.</span>
              </div>
            )}
            {props.studio.scenes.map((item) => (
              <Item
                key={item.id}
                name={item.name}
                detail={new Date(item.updatedAt).toLocaleString()}
                onPrimary={async () => {
                  if (await confirm({
                    title: `Load “${item.name}”?`,
                    message: "This replaces the current canvas and drawing. You can restore the previous state with Undo.",
                    confirmLabel: "Load scene",
                  })) {
                    props.onLoadScene(item.id);
                    toast.success(`Scene “${item.name}” loaded`);
                  }
                }}
                primary="Load"
                onDelete={async () => {
                  if (await confirm({
                    title: `Delete “${item.name}”?`,
                    message: "This permanently removes the saved scene.",
                    confirmLabel: "Delete scene",
                    danger: true,
                  })) {
                    props.onDeleteScene(item.id);
                    toast.success(`Scene “${item.name}” deleted`);
                  }
                }}
              />
            ))}
          </Section>
        )}
        {tab === "presets" && (
          <Section
            title="Presets"
            description="Save the currently selected elements for reuse."
          >
            <CreateRow
              name={name}
              setName={setName}
              placeholder={
                props.selectedIds.size
                  ? `Preset from ${props.selectedIds.size} selected`
                  : "Select elements first"
              }
              onCreate={createPreset}
              label="Save preset"
              disabled={!props.selectedIds.size}
            />
            {props.studio.presets.map((item) => (
              <Item
                key={item.id}
                name={item.name}
                detail={`${item.elements.length} element${item.elements.length === 1 ? "" : "s"}`}
                onPrimary={() => {
                  props.onLoadPreset(item.id);
                  toast.success(`Preset “${item.name}” inserted`);
                }}
                primary="Insert"
                onDelete={() => {
                  props.onDeletePreset(item.id);
                  toast.success(`Preset “${item.name}” deleted`);
                }}
              />
            ))}
          </Section>
        )}
        {tab === "sounds" && (
          <Section
            title="Soundboard"
            description="Clips play on the overlay without a canvas layer. Preview stays in this browser; Play and Stop control the overlay."
          >
            <input
              style={fieldStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sound name (optional for Myinstants)"
              maxLength={60}
            />
            <input
              style={fieldStyle}
              value={soundUrl}
              onChange={(e) => setSoundUrl(e.target.value)}
              placeholder="Paste a Myinstants sound-page link"
              maxLength={2048}
              title="Paste the normal Myinstants button-page URL or a direct Myinstants MP3 link"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
              }}
            >
              <button
                className="ui-button studio-primary"
                onClick={() => void createSound()}
                disabled={uploading || !soundUrl.trim()}
              >
                <Plus size={14} /> Add Myinstants
              </button>
              <label
                className="ui-button"
                style={{ cursor: uploading ? "wait" : "pointer" }}
              >
                {uploading ? "Uploading…" : "Upload file"}
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.webm"
                  hidden
                  disabled={uploading}
                  onChange={(event) => {
                    void uploadSound(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            {props.studio.sounds.length > 0 && (
              <label className="studio-search">
                <Search size={13} aria-hidden="true" />
                <input
                  value={listSearch}
                  onChange={(event) => setListSearch(event.target.value)}
                  placeholder="Search sounds…"
                  aria-label="Search sounds"
                />
              </label>
            )}
            {props.studio.sounds.length === 0 && (
              <div className="studio-empty-state">
                <strong>No sounds yet</strong>
                <span>Add a Myinstants link or upload an audio file to create your Soundboard.</span>
              </div>
            )}
            {props.studio.sounds
              .filter((item) => item.name.toLowerCase().includes(listSearch.trim().toLowerCase()))
              .map((item) => (
              <div key={item.id} className="soundboard-item">
                <div className="soundboard-item__head">
                  <span className="soundboard-item__icon" aria-hidden="true">
                    <AudioLines size={15} />
                  </span>
                  <strong>{item.name}</strong>
                  <button
                    className="ui-icon-button ui-button--compact ui-icon-button--ghost"
                    onClick={async () => {
                      if (!await confirm({
                        title: `Delete “${item.name}”?`,
                        message: "Commands using this sound will keep a missing target until they are edited.",
                        confirmLabel: "Delete sound",
                        danger: true,
                      })) return;
                      props.onDeleteSound(item.id);
                      toast.success(`Sound “${item.name}” deleted`);
                    }}
                    title={`Delete ${item.name}`}
                    aria-label={`Delete ${item.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <label className="soundboard-item__volume">
                  <span>Volume</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={item.volume}
                    onChange={(event) =>
                      props.onSaveSound({
                        ...item,
                        volume: Number(event.target.value),
                      })
                    }
                  />
                  <output>{Math.round(item.volume * 100)}%</output>
                </label>
                <div className="soundboard-item__actions">
                  <button
                    className="ui-button ui-button--compact"
                    onClick={() =>
                      props.previewingSoundIds.includes(item.id)
                        ? props.onStopPreviewSound(item.id)
                        : props.onPreviewSound(item.id)
                    }
                  >
                    {props.previewingSoundIds.includes(item.id) ? (
                      <>
                        <Square size={11} fill="currentColor" />
                        Stop preview
                      </>
                    ) : (
                      <>
                        <Headphones size={13} />
                        Preview
                      </>
                    )}
                  </button>
                  <button
                    className="ui-button ui-button--compact soundboard-action--obs"
                    onClick={() => props.onPlaySound(item.id)}
                  >
                    <Play size={12} fill="currentColor" />
                    Play on overlay
                  </button>
                  <button
                    className="ui-button ui-button--compact"
                    onClick={() => props.onStopSound(item.id)}
                    title={`Immediately stop every instance of ${item.name} currently playing on the overlay`}
                  >
                    <Square size={11} fill="currentColor" />
                    Stop
                  </button>
                </div>
              </div>
            ))}
          </Section>
        )}
        {tab === "triggers" && (
          <Section
            title="Automations"
            description="Run media, sounds, chat messages and TTS when someone uses a chat command or a Twitch event happens."
          >
            <div className="connection-strip">
              <div className="connection-strip__pills">
                <span
                  className={`status-pill ${props.studio.twitchConnected ? "status-pill--ok" : "status-pill--bad"}`}
                  title="Anonymous Twitch chat listener, used for chat commands and emotes"
                >
                  <i aria-hidden="true" />
                  Chat listener
                </span>
                {(eventStatus?.channels ?? []).map((item) => (
                  <span
                    key={item.channel}
                    className={`status-pill ${item.connected ? "status-pill--ok" : "status-pill--bad"}`}
                    title={item.connected ? "Twitch events connected" : "Not connected. Twitch events from this channel will not arrive."}
                  >
                    <i aria-hidden="true" />
                    <span style={{ textTransform: "capitalize" }}>{item.channel}</span>
                  </span>
                ))}
                {eventStatus?.chatbot && (
                  <span
                    className={`status-pill ${chatbotHasWriteAccess ? "status-pill--ok" : "status-pill--bad"}`}
                    title="Sends automated chat messages"
                  >
                    <i aria-hidden="true" />
                    Chatbot
                  </span>
                )}
              </div>
              <button
                type="button"
                className="ui-button ui-button--compact"
                aria-expanded={connectionsOpen}
                onClick={() => setConnectionsOpen((open) => !open)}
              >
                <Link2 size={12} />{" "}
                {connectionsOpen ? "Hide" : chatConnectionWarning ? "Fix connections" : "Connections"}
              </button>
            </div>
            {chatConnectionWarning && !connectionsOpen && (
              <p className="connection-strip__hint">
                <AlertTriangle size={13} aria-hidden="true" /> Chat-message actions are not fully connected yet.
              </p>
            )}
            {connectionsOpen && (
              <div className="connection-panel">
                <p className="connection-panel__intro">
                  Broadcasters provide event access; the separate chatbot account sends automated messages.
                </p>
            {!eventStatus?.configured && (
              <div className="connection-card connection-card--error">
                Event storage is unavailable. Check the server database
                configuration.
              </div>
            )}
            {eventStatus?.configured && (
              <div className="connection-card">
                <div className="connection-card__head">
                  <span className="connection-card__name">
                    <strong>Chatbot</strong>
                    {eventStatus.chatbot?.connected && (
                      <small>as {eventStatus.chatbot.displayName}</small>
                    )}
                  </span>
                  <span className={`status-pill ${eventStatus.chatbot?.connected ? "status-pill--ok" : "status-pill--bad"}`}>
                    <i aria-hidden="true" />
                    {eventStatus.chatbot?.connected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <p className="connection-card__hint">
                  Outgoing automation messages are sent by this account. Broadcaster tokens are never used to write chat.
                </p>
                <div className="connection-card__actions">
                  <button
                    className={`ui-button ui-button--compact${eventStatus.chatbot?.connected ? "" : " studio-primary"}`}
                    disabled={!props.isOwner}
                    onClick={() => void twitchEvents.connectChatbot()}
                    title={props.isOwner ? `Authorize ${eventStatus.chatbot?.login ?? "the chatbot"} to send automated messages` : "Only the overlay owner can manage the chatbot connection"}
                  >
                    <Link2 size={13} /> {eventStatus.chatbot?.connected ? "Reconnect" : "Connect chatbot"}
                  </button>
                  {eventStatus.chatbot?.connected && props.isOwner && (
                    <button
                      className="ui-button ui-button--compact ui-button--quiet-danger"
                      onClick={() => void twitchEvents.disconnectChatbot()}
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            )}
            {(eventStatus?.channels ?? []).map((status) => {
              const channel = status.channel;
              const hasLegacyChatAccess = status.scopes.includes("user:write:chat");
              const hasBanAccess = status.scopes.includes("channel:moderate");
              return (
                <div key={channel} className="connection-card">
                  <div className="connection-card__head">
                    <span className="connection-card__name">
                      <strong style={{ textTransform: "capitalize" }}>{channel}</strong>
                      {status?.connected &&
                        status.displayName &&
                        status.displayName.toLowerCase() !== channel.toLowerCase() && (
                          <small>as {status.displayName}</small>
                        )}
                    </span>
                    <span className={`status-pill ${status?.connected ? "status-pill--ok" : "status-pill--bad"}`}>
                      <i aria-hidden="true" />
                      {status?.connected ? "Connected" : "Not connected"}
                    </span>
                  </div>
                  <p className="connection-card__hint">
                    Event access for follows, subscriptions, Bits, channel
                    points, Hype Trains, bans, and timeouts.
                  </p>
                  {status.connected && hasLegacyChatAccess && (
                    <p className="connection-card__note">
                      This connection still has the old chat-writing permission.
                      Reconnect it to replace that token with event-only access.
                    </p>
                  )}
                  {status.connected && !hasBanAccess && (
                    <p className="connection-card__note">
                      Reconnect this broadcaster once to enable ban and timeout events.
                    </p>
                  )}
                  <div className="connection-card__actions">
                    <button
                      className={`ui-button ui-button--compact${status?.connected ? "" : " studio-primary"}`}
                      onClick={() => void twitchEvents.connect(channel)}
                    >
                      <Link2 size={13} />{" "}
                      {status?.connected ? "Reconnect" : "Connect"}
                    </button>
                    {status?.connected && (
                      <button
                        className="ui-button ui-button--compact ui-button--quiet-danger"
                        onClick={() => void twitchEvents.disconnect(channel)}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                  <details className="connection-card__tests">
                    <summary>Send a test event</summary>
                    <div className="connection-card__chips">
                      {(
                        [
                          "follow",
                          "subscribe",
                          "gift-subscribe",
                          "bits",
                          "raid",
                          "channel-points",
                          "ban",
                          "timeout",
                        ] as const
                      ).map((type) => (
                        <button
                          key={type}
                          className="ui-button ui-button--compact"
                          disabled={!status?.connected}
                          title={`Run a local simulated ${type} event`}
                          onClick={() => void twitchEvents.test(channel, type)}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              );
            })}
              </div>
            )}
            {!builderVisible && (
              <button
                type="button"
                className="ui-button studio-new-button"
                onClick={() => {
                  setKind(filter === "event" ? "event" : "chat");
                  setBuilderOpen(true);
                }}
              >
                <Plus size={14} />
                New automation
              </button>
            )}
            {builderVisible && (
            <div className="command-builder">
            <div className="command-builder__bar">
              <strong>
                {editingTriggerId ? "Edit automation" : "New automation"}
              </strong>
              {hasTriggersForTab && (
                <button
                  type="button"
                  className="ui-icon-button ui-button--compact ui-icon-button--ghost"
                  onClick={closeBuilder}
                  title="Close the builder and discard this draft"
                  aria-label="Close builder"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <p className="command-builder__summary" aria-label="Automation workflow">
              <b>When</b>{" "}
              {isEvent
                ? "a Twitch event"
                : triggerMatch.trim() || "a chat command"}
              {" "}<ArrowRight size={12} aria-hidden="true" /> <b>do</b>{" "}
              {triggerActionLabel(triggerAction).toLowerCase()}
              {chainedSteps.length > 0 && ` + ${chainedSteps.length} more`}
            </p>
            <div className="command-builder-card">
              <header>
                <b>1</b>
                <span>
                  <strong>When this happens</strong>
                  <small>
                    {isEvent
                      ? "Choose the Twitch event that starts the workflow."
                      : "Choose the public chat command that starts the workflow."}
                  </small>
                </span>
              </header>
            <Segmented
              label="What starts this automation"
              value={kind}
              onChange={setKind}
              options={[
                { value: "chat", label: "Chat command" },
                { value: "event", label: "Twitch event" },
              ]}
            />
            <input
              style={fieldStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                isEvent ? "Event action name" : "Command name"
              }
              maxLength={60}
            />
            {isEvent && (
              <>
                <select
                  style={fieldStyle}
                  value={triggerEvent}
                  onChange={(e) =>
                    setTriggerEvent(
                      e.target.value as Exclude<
                        TriggerEventType,
                        "chat-command"
                      >,
                    )
                  }
                >
                  <option value="follow">New follow</option>
                  <option value="subscribe">
                    Subscription or resubscription
                  </option>
                  <option value="gift-subscribe">Gift subscriptions</option>
                  <option value="raid">Incoming raid</option>
                  <option value="bits">Bits cheered</option>
                  <option value="channel-points">
                    Channel point redemption
                  </option>
                  <option value="ban">Permanent ban</option>
                  <option value="timeout">Timeout</option>
                </select>
                <select
                  style={fieldStyle}
                  value={triggerChannel}
                  onChange={(e) => setTriggerChannel(e.target.value)}
                  title="Limit this trigger to one connected broadcaster"
                >
                  <option value="">Any connected channel</option>
                  {(eventStatus?.channels ?? []).map((item) => (
                    <option key={item.channel} value={item.channel}>
                      {item.displayName ?? item.channel}
                    </option>
                  ))}
                </select>
                {triggerEvent === "channel-points" && (
                  <input
                    style={fieldStyle}
                    value={triggerMatch}
                    onChange={(e) => setTriggerMatch(e.target.value)}
                    placeholder="Reward title (leave empty for any reward)"
                  />
                )}
                {["subscribe", "gift-subscribe", "raid", "bits"].includes(
                  triggerEvent,
                ) && (
                  <label className="command-timing">
                    <span>
                      {triggerEvent === "subscribe"
                        ? "Minimum months"
                        : triggerEvent === "gift-subscribe"
                          ? "Minimum gifts"
                          : triggerEvent === "raid"
                            ? "Minimum raiders"
                            : "Minimum Bits"}
                    </span>
                    <input
                      style={fieldStyle}
                      type="number"
                      min="1"
                      value={triggerMinimum}
                      onChange={(e) =>
                        setTriggerMinimum(Math.max(1, Number(e.target.value)))
                      }
                    />
                  </label>
                )}
              </>
            )}
            {!isEvent && (
              <input
                style={fieldStyle}
                value={triggerMatch}
                onChange={(e) => setTriggerMatch(e.target.value)}
                placeholder="Chat command, for example <fox"
              />
            )}
            </div>
            <div className="command-builder-connector" aria-hidden="true">
              <span />
              <ArrowRight size={12} />
            </div>
            <div className="command-builder-card">
              <header>
                <b>2</b>
                <span>
                  <strong>Do this</strong>
                  <small>Choose one action, then optionally chain more.</small>
                </span>
              </header>
            <select
              style={fieldStyle}
              value={triggerAction}
              onChange={(e) => {
                setTriggerAction(e.target.value as OverlayTrigger["action"]);
                setTargetId("");
              }}
            >
              {triggerActionOptions
                .filter((option) => ttsEnabled || option.value !== "tts" || triggerAction === "tts")
                .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {!["refresh-overlay", "send-chat", "tts"].includes(triggerAction) && (
              <select
                style={fieldStyle}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">Choose target…</option>
                {(triggerAction === "play-sound"
                  ? props.studio.sounds
                  : triggerAction === "play-media"
                    ? props.elements.filter(
                        (element) =>
                          element.type === "video" || element.type === "audio",
                      )
                    : ["show-temporary", "fly-across"].includes(triggerAction)
                      ? props.elements.filter((element) =>
                          ["image", "gif", "video"].includes(element.type),
                        )
                      : props.elements
                ).map((item) => (
                  <option key={item.id} value={item.id}>
                    {"name" in item
                      ? item.name
                      : item.type === "text"
                        ? `Text · ${item.id.slice(0, 6)}`
                        : `${item.displayName || getFileLabel(item.src) || item.type} · ${item.type}`}
                  </option>
                ))}
              </select>
            )}
            {targetId && (selectedTargetElement || selectedTargetSound) && (
              <div className="trigger-target-summary">
                {selectedTargetElement && ["image", "gif"].includes(selectedTargetElement.type) ? (
                  <img src={selectedTargetElement.src} alt="" />
                ) : (
                  <span className="trigger-target-summary__icon">
                    {selectedTargetSound ? <AudioLines size={15} /> : <Play size={15} />}
                  </span>
                )}
                <div>
                  <strong>
                    {selectedTargetSound?.name || selectedTargetElement?.displayName ||
                      (selectedTargetElement ? getFileLabel(selectedTargetElement.src) : "Selected target")}
                  </strong>
                  <span>
                    {selectedTargetSound
                      ? "Soundboard clip"
                      : `${selectedTargetElement?.type} layer · ${selectedTargetElement?.visible ? "visible" : "hidden on overlay"}`}
                  </span>
                </div>
              </div>
            )}
            {["send-chat", "tts"].includes(triggerAction) && (
              <div className="chat-message-editor">
                <label>
                  <span>{triggerAction === "tts" ? "TTS prompt or token · {message} inserts viewer input" : "Chat message"}</span>
                  <textarea
                    style={{
                      ...fieldStyle,
                      height: 72,
                      paddingTop: 8,
                      resize: "vertical",
                    }}
                    maxLength={triggerAction === "tts" ? 6000 : 500}
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder={triggerAction === "tts" ? '((a warm voice says "{message}" with echo;6s))' : "Thanks {user} for the {bits} Bits!"}
                    title="Message sent by the connected chatbot account. Event variables in braces are replaced automatically."
                  />
                </label>
                <div
                  className="chat-variable-guide"
                  aria-label="Available chat message variables"
                >
                  <strong>Variables</strong>
                  {triggerAction === "tts" && <code title="Viewer text after the chat command">{"{message}"}</code>}
                  <code title="Viewer or broadcaster who caused the event">
                    {"{user}"}
                  </code>
                  <code title="Total subscription months">{"{months}"}</code>
                  <code title="Number of incoming raid viewers">
                    {"{viewers}"}
                  </code>
                  <code title="Number of Bits cheered">{"{bits}"}</code>
                  <code title="Channel point reward title">{"{reward}"}</code>
                  <code title="Channel receiving the event">{"{channel}"}</code>
                  <code title="Moderator who issued the ban or timeout">{"{moderator}"}</code>
                  <code title="Moderation reason">{"{reason}"}</code>
                  <code title="Permanent or timeout duration">{"{duration}"}</code>
                  <code title="Either ban or timeout">{"{banType}"}</code>
                </div>
                {triggerAction === "tts" && (
                  <>
                    <label>
                      <span>Chat message if TTS fails (optional)</span>
                      <textarea
                        style={{ ...fieldStyle, height: 58, paddingTop: 8, resize: "vertical" }}
                        maxLength={500}
                        value={ttsErrorMessage}
                        onChange={(event) => setTtsErrorMessage(event.target.value)}
                        placeholder="Sorry {user}, that TTS could not be played."
                      />
                    </label>
                    <p className="command-cost-warning">
                      New prompts spend OpenAI and ElevenLabs credits. Saved (TTS:…) tokens replay without generation cost; restrict dynamic chat TTS to trusted roles and a meaningful cooldown. Failed TTS can notify chat through the connected chatbot.
                    </p>
                  </>
                )}
              </div>
            )}
            {["play-media", "show-temporary"].includes(triggerAction) && (
              <label
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 190px",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                }}
              >
                Position while active
                <select
                  style={fieldStyle}
                  value={triggerPlacement}
                  onChange={(event) =>
                    setTriggerPlacement(event.target.value as TriggerPlacement)
                  }
                >
                  <option value="current">Keep position</option>
                  <option value="random">Random position</option>
                  <option value="fit">Fit inside stream</option>
                  <option value="fill">Fill stream</option>
                  <option value="top-left">Top left</option>
                  <option value="top-center">Top center</option>
                  <option value="top-right">Top right</option>
                  <option value="center-left">Center left</option>
                  <option value="center">Center</option>
                  <option value="center-right">Center right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-center">Bottom center</option>
                  <option value="bottom-right">Bottom right</option>
                </select>
              </label>
            )}
            {triggerAction === "fly-across" && (
              <label
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 190px",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                }}
              >
                Flight path
                <select
                  style={fieldStyle}
                  value={flyDirection}
                  onChange={(event) =>
                    setFlyDirection(event.target.value as FlyDirection)
                  }
                >
                  <option value="left-to-right-top">Left → right · top</option>
                  <option value="left-to-right-center">
                    Left → right · center
                  </option>
                  <option value="left-to-right-bottom">
                    Left → right · bottom
                  </option>
                  <option value="right-to-left-top">Right → left · top</option>
                  <option value="right-to-left-center">
                    Right → left · center
                  </option>
                  <option value="right-to-left-bottom">
                    Right → left · bottom
                  </option>
                  <option value="top-to-bottom-left">
                    Top → bottom · left
                  </option>
                  <option value="top-to-bottom-center">
                    Top → bottom · center
                  </option>
                  <option value="top-to-bottom-right">
                    Top → bottom · right
                  </option>
                  <option value="bottom-to-top-left">
                    Bottom → top · left
                  </option>
                  <option value="bottom-to-top-center">
                    Bottom → top · center
                  </option>
                  <option value="bottom-to-top-right">
                    Bottom → top · right
                  </option>
                </select>
              </label>
            )}
            {["show-temporary", "fly-across"].includes(triggerAction) && (
              <label
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 90px",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                }}
              >
                {triggerAction === "fly-across"
                  ? "Flight duration (seconds)"
                  : "Visible duration (seconds)"}
                <input
                  style={fieldStyle}
                  type="number"
                  min="1"
                  max="3600"
                  value={duration}
                  onChange={(event) =>
                    setDuration(
                      Math.min(3600, Math.max(1, Number(event.target.value))),
                    )
                  }
                />
              </label>
            )}
            {triggerAction === "fly-across" && (
              <button
                type="button"
                className="ui-button ui-button--compact"
                disabled={!targetId && !flyRunning}
                onClick={() => {
                  if (flyRunning) {
                    // Do not wait for the browser's cancel event; the button should flip right away.
                    const stopFlight = flyStopRef.current;
                    flyStopRef.current = null;
                    setFlyRunning(false);
                    stopFlight?.();
                    return;
                  }
                  const stop = targetId
                    ? props.onPreviewFly(targetId, flyDirection, duration, () => {
                        if (flyStopRef.current !== stop) return;
                        flyStopRef.current = null;
                        setFlyRunning(false);
                      })
                    : null;
                  if (!stop) {
                    toast.error("Choose an available media element to preview");
                    return;
                  }
                  flyStopRef.current = stop;
                  setFlyRunning(true);
                  toast.info("Playing dashboard-only flight preview");
                }}
                style={{
                  width: "100%",
                  border: "1px solid var(--line-strong)",
                  background: "var(--bg-control)",
                  color: "var(--text-primary)",
                  cursor: targetId ? "pointer" : "not-allowed",
                }}
              >
                {flyRunning ? <Square size={11} fill="currentColor" /> : <Play size={12} />}
                {flyRunning ? "Stop preview" : "Preview flight"}
                <ActionScopeBadge scope="dashboard" />
              </button>
            )}
            {!currentStepIsFirst && (
              <label className="command-timing">
                <span>Start this action</span>
                <select
                  style={fieldStyle}
                  value={stepTiming}
                  onChange={(event) =>
                    setStepTiming(
                      event.target.value as NonNullable<TriggerStep["timing"]>,
                    )
                  }
                >
                  <option value="immediate">At the same time</option>
                  <option value="delay">After a delay</option>
                  <option value="after-previous">
                    After previous finishes
                  </option>
                </select>
              </label>
            )}
            {!currentStepIsFirst && stepTiming === "delay" && (
              <label className="command-timing">
                <span>Delay (seconds)</span>
                <input
                  style={fieldStyle}
                  type="number"
                  min="0"
                  max="3600"
                  step="0.5"
                  value={stepDelay}
                  onChange={(event) =>
                    setStepDelay(
                      Math.min(3600, Math.max(0, Number(event.target.value))),
                    )
                  }
                />
              </label>
            )}
            {chainedSteps.length > 0 && (
              <div className="command-chain" aria-label="Command action chain">
                <strong>Action chain</strong>
                {chainedSteps.map((step, index) => (
                  <div
                    className="command-chain__step"
                    key={`${index}-${step.action}`}
                  >
                    <span className="command-chain__description">
                      <b>{index + 1}</b>
                      <span>
                        <strong>{triggerActionLabel(step.action)}</strong>
                        <small>
                          {triggerTimingLabel(step, index)}
                          {step.targetId
                            ? ` · ${props.studio.sounds.find((sound) => sound.id === step.targetId)?.name || props.elements.find((element) => element.id === step.targetId)?.displayName || "media target"}`
                            : ""}
                        </small>
                      </span>
                    </span>
                    <div className="command-chain__actions">
                      <button
                        type="button"
                        className="ui-icon-button"
                        onClick={() => editChainedStep(step, index)}
                        title={`Edit action ${index + 1}`}
                        aria-label={`Edit action ${index + 1}`}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="ui-icon-button command-chain__delete"
                        onClick={() => {
                          setChainedSteps((steps) =>
                            steps.filter((_, stepIndex) => stepIndex !== index),
                          );
                          if (editingChainIndex === index) {
                            const pendingStep =
                              pendingStepBeforeChainEdit.current;
                            pendingStepBeforeChainEdit.current = null;
                            if (pendingStep) loadTriggerStep(pendingStep);
                            else resetTriggerStep();
                            setEditingChainIndex(null);
                          } else if (
                            editingChainIndex !== null &&
                            editingChainIndex > index
                          )
                            setEditingChainIndex(editingChainIndex - 1);
                          toast.success("Action removed from command chain");
                        }}
                        title={`Remove action ${index + 1} from this command`}
                        aria-label={`Remove action ${index + 1}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                <span className="command-chain__pending">
                  {editingChainIndex !== null
                    ? `Editing action ${editingChainIndex + 1}`
                    : `${chainedSteps.length + 1}. ${triggerActionLabel(triggerAction)} (current)`}
                </span>
              </div>
            )}
            <button
              type="button"
              className="ui-button ui-button--compact command-chain__add"
              onClick={addChainedStep}
              disabled={
                (chainedSteps.length >= 9 && editingChainIndex === null) ||
                (!["refresh-overlay", "send-chat", "tts"].includes(triggerAction) &&
                  !targetId) ||
                (["send-chat", "tts"].includes(triggerAction) && !chatMessage.trim())
              }
            >
              {editingChainIndex !== null ? (
                <Save size={13} />
              ) : (
                <Plus size={13} />
              )}
              {editingChainIndex !== null
                ? "Update action"
                : "Add another action"}
            </button>
            </div>
            <div className="command-builder-connector" aria-hidden="true">
              <span />
              <ArrowRight size={12} />
            </div>
            <div className="command-builder-card">
              <header>
                <b>3</b>
                <span>
                  <strong>Control & save</strong>
                  <small>
                    Set access and cooldown, then make the workflow available.
                  </small>
                </span>
              </header>
            {!isEvent && (
              <label
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 190px",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                }}
              >
                Who can use it
                <select
                  style={fieldStyle}
                  value={permission}
                  onChange={(event) =>
                    setPermission(event.target.value as ChatPermission)
                  }
                >
                  <option value="everyone">Everyone</option>
                  <option value="vip">VIPs, moderators & streamer</option>
                  <option value="moderator">Moderators & streamer</option>
                  <option value="streamer">Streamer only</option>
                </select>
              </label>
            )}
            {!isEvent &&
              permission === "everyone" &&
              (triggerAction === "tts" || chainedSteps.some((step) => step.action === "tts")) && (
                <p className="command-cost-warning">
                  Everyone can run this paid TTS action. Prefer a saved (TTS:…) token, or restrict access and add a cooldown before saving.
                </p>
              )}
            <label
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px",
                alignItems: "center",
                gap: 8,
                color: "var(--text-secondary)",
                fontSize: 11,
              }}
            >
              Cooldown (seconds)
              <input
                style={fieldStyle}
                type="number"
                min="0"
                max="86400"
                value={cooldown}
                onChange={(e) =>
                  setCooldown(Math.max(0, Number(e.target.value)))
                }
              />
            </label>
            <button
              className="ui-button studio-primary"
              onClick={createTrigger}
              disabled={
                !name.trim() ||
                editingChainIndex !== null ||
                (!["refresh-overlay", "send-chat", "tts"].includes(triggerAction) &&
                  !targetId) ||
                (["send-chat", "tts"].includes(triggerAction) && !chatMessage.trim())
              }
            >
              {editingTriggerId ? <Save size={14} /> : <Plus size={14} />}{" "}
              {editingTriggerId
                ? "Save changes"
                : isEvent
                  ? "Add event action"
                  : "Add command"}
            </button>
            {editingTriggerId && (
              <button className="ui-button" onClick={cancelTriggerEdit}>
                <X size={14} /> Cancel editing
              </button>
            )}
            </div>
            </div>
            )}
            {hasTriggersForTab && (
              <Segmented
                label="Filter automations"
                value={filter}
                onChange={setFilter}
                options={([["all", "All", props.studio.triggers.length], ["chat", "Chat", chatCount], ["event", "Twitch", eventCount]] as const).map(
                  ([value, label, count]) => ({
                    value,
                    label: <>{label} <span className="segmented__count">{count}</span></>,
                  }),
                )}
              />
            )}
            {hasTriggersForTab && (
              <label className="studio-search">
                <Search size={13} aria-hidden="true" />
                <input
                  value={listSearch}
                  onChange={(event) => setListSearch(event.target.value)}
                  placeholder="Search automations…"
                  aria-label="Search automations"
                />
              </label>
            )}
            {!hasTriggersForTab && (
              <div className="studio-empty-state">
                <strong>No automations yet</strong>
                <span>Choose what starts it, what it should do, then add it.</span>
              </div>
            )}
            {hasTriggersForTab && visibleTriggers.length === 0 && (
              <div className="studio-empty-state">
                <strong>No matching automations</strong>
                <span>Try another filter or search term.</span>
              </div>
            )}
            {visibleTriggers.map((item) => (
                <Item
                  key={item.id}
                  name={item.name}
                  leading={isChatTrigger(item) ? <MessageCircle size={15} /> : <BellRing size={15} />}
                  detail={`${isChatTrigger(item) ? (item.match ?? "chat command") : (TRIGGER_EVENT_LABELS[item.event] ?? item.event)} → ${item.steps?.length ? `${item.steps.length} actions` : triggerActionLabel(item.action)}${item.minimum ? ` · min ${item.minimum}` : ""}`}
                  onEdit={() => editTrigger(item)}
                  onTest={() => void testTrigger(item)}
                  onPrimary={() => {
                    props.onSaveTrigger({ ...item, enabled: !item.enabled });
                    toast.success(
                      `Automation “${item.name}” ${item.enabled ? "disabled" : "enabled"}`,
                    );
                  }}
                  primary={item.enabled ? "Active" : "Disabled"}
                  active={item.enabled}
                  onDelete={async () => {
                    if (!await confirm({
                      title: `Delete “${item.name}”?`,
                      message: "This permanently removes the saved command or event action.",
                      confirmLabel: "Delete automation",
                      danger: true,
                    })) return;
                    props.onDeleteTrigger(item.id);
                    toast.success(`Automation “${item.name}” deleted`);
                  }}
                />
              ))}
          </Section>
        )}
        {tab === "emotes" && (
          <Section
            title="Chat emotes"
            description="Animate 7TV and Twitch emotes on the overlay without adding them to Layers or storing their images."
          >
            <div className="switch-card">
              <span>
                <strong>Chat emotes</strong>
                <small>
                  {props.chatEmoteSettings.enabled
                    ? "Emotes from chat are animating on the overlay."
                    : "Turned off. No chat emotes appear on the overlay."}
                </small>
              </span>
              <button
                type="button"
                className="ui-switch"
                role="switch"
                aria-checked={props.chatEmoteSettings.enabled}
                aria-label="Chat emotes"
                onClick={() => {
                  const enabled = !props.chatEmoteSettings.enabled;
                  props.onChatEmoteSettingsChange({
                    ...props.chatEmoteSettings,
                    enabled,
                  });
                  toast.success(
                    `Chat emotes ${enabled ? "enabled" : "disabled"}`,
                  );
                }}
                title="Enable or disable automatic 7TV and Twitch emotes from the currently monitored chat"
              />
            </div>
            <div className="chat-emote-preview">
              <ChatEmoteLayer
                preview
                spawn={emotePreview}
                settings={props.chatEmoteSettings}
                onActiveChange={setEmoteRunning}
                clearSignal={emoteClear}
              />
              <span>Dashboard-only preview</span>
            </div>
            <button
              type="button"
              className="ui-button"
              onClick={() => {
                if (emoteRunning) {
                  setEmoteClear((count) => count + 1);
                  setEmoteRunning(false);
                  return;
                }
                setEmoteRunning(true);
                setEmotePreview({
                  id: randomUUID(),
                  emoteId: "preview",
                  name: "Preview",
                  imageUrl: previewEmote,
                  sender: "Vicksy viewer",
                  senderColor: "#fb923c",
                });
                toast.info("Playing a dashboard-only emote preview");
              }}
            >
              {emoteRunning ? <Square size={12} fill="currentColor" /> : <Play size={13} />}
              {emoteRunning ? "Stop preview" : "Preview movement (dashboard only)"}
            </button>
            <div className="chat-emote-card">
              <strong className="chat-emote-card__title">Behavior</strong>
              <label className="chat-emote-setting">
                <span>Show sender names</span>
                <input
                  type="checkbox"
                  checked={props.chatEmoteSettings.showNames}
                  onChange={(event) => {
                    props.onChatEmoteSettingsChange({
                      ...props.chatEmoteSettings,
                      showNames: event.target.checked,
                    });
                    toast.success(
                      `Sender names ${event.target.checked ? "shown" : "hidden"}`,
                    );
                  }}
                />
              </label>
              {props.chatEmoteSettings.showNames && (
                <label className="chat-emote-setting">
                  <span>Name background</span>
                  <input
                    type="checkbox"
                    checked={props.chatEmoteSettings.nameBackgroundEnabled}
                    onChange={(event) => {
                      props.onChatEmoteSettingsChange({
                        ...props.chatEmoteSettings,
                        nameBackgroundEnabled: event.target.checked,
                      });
                      toast.success(
                        `Name backgrounds ${event.target.checked ? "shown" : "hidden"}`,
                      );
                    }}
                  />
                </label>
              )}
              {props.chatEmoteSettings.showNames &&
                props.chatEmoteSettings.nameBackgroundEnabled && (
                  <label className="chat-emote-setting">
                    <span>Background color</span>
                    <input
                      type="color"
                      value={props.chatEmoteSettings.nameBackgroundColor}
                      onChange={(event) =>
                        props.onChatEmoteSettingsChange({
                          ...props.chatEmoteSettings,
                          nameBackgroundColor: event.target.value,
                        })
                      }
                    />
                  </label>
                )}
              {props.chatEmoteSettings.showNames && (
                <SliderField
                  label="Name text size"
                  value={props.chatEmoteSettings.nameFontSize}
                  min={9}
                  max={32}
                  step={1}
                  unit="px"
                  onChange={(nameFontSize) =>
                    props.onChatEmoteSettingsChange({ ...props.chatEmoteSettings, nameFontSize })
                  }
                />
              )}
              <label className="chat-emote-setting chat-emote-setting--motion">
                <span>Movement</span>
                <select
                  style={{ ...fieldStyle, width: 132, maxWidth: "65%", minWidth: 0 }}
                  value={props.chatEmoteSettings.motion}
                  onChange={(event) => {
                    const motion = event.target.value as ChatEmoteSettings["motion"];
                    props.onChatEmoteSettingsChange({ ...props.chatEmoteSettings, motion });
                    toast.success(
                      motion === "parade" ? "Using the bottom parade"
                        : motion === "corners" ? "Emotes will travel around the corners"
                          : motion === "floor" ? "Using floor bounce physics"
                            : "Using wall-to-wall bounce",
                    );
                  }}
                >
                  <option value="parade">Bottom parade</option>
                  <option value="corners">Corner route</option>
                  <option value="floor">Floor bounce</option>
                  <option value="walls">Wall bounce</option>
                </select>
              </label>
              {(props.chatEmoteSettings.motion === "parade" || props.chatEmoteSettings.motion === "corners") && (
                <label className="chat-emote-setting chat-emote-setting--motion">
                  <span>Direction</span>
                  <select
                    style={{ ...fieldStyle, width: 132, maxWidth: "65%", minWidth: 0 }}
                    value={props.chatEmoteSettings.direction}
                    onChange={(event) => {
                      const direction = event.target.value as ChatEmoteSettings["direction"];
                      props.onChatEmoteSettingsChange({ ...props.chatEmoteSettings, direction });
                      toast.success(`Emotes will travel ${direction}`);
                    }}
                    title={props.chatEmoteSettings.motion === "parade"
                      ? "Choose whether the parade travels left or right"
                      : "Start left: bottom-left → top-left → top-right → bottom-right. Start right mirrors that route."}
                  >
                    <option value="left">
                      {props.chatEmoteSettings.motion === "corners" ? "Start right" : "Right to left"}
                    </option>
                    <option value="right">
                      {props.chatEmoteSettings.motion === "corners" ? "Start left" : "Left to right"}
                    </option>
                  </select>
                </label>
              )}
            </div>
            <div className="chat-emote-card">
              <strong className="chat-emote-card__title">
                Motion & limits
              </strong>
              {(
                [
                  ["Emote size", "size", 24, 100, 2, "px"],
                  ["Movement speed", "speed", 40, 600, 10, " px/s"],
                  ["Gravity", "gravity", 100, 2400, 50, " px/s²"],
                  ["Lifetime", "lifetimeSeconds", 2, 120, 1, "s"],
                  ["Maximum visible", "maxVisible", 1, 100, 1, ""],
                ] as const
              )
                .filter(
                  ([, key]) =>
                    key !== "gravity" ||
                    props.chatEmoteSettings.motion === "floor",
                )
                .map(([label, key, min, max, step, suffix]) => (
                  <SliderField
                    key={key}
                    label={label}
                    value={props.chatEmoteSettings[key]}
                    min={min}
                    max={max}
                    step={step}
                    unit={suffix.trim()}
                    onChange={(next) =>
                      props.onChatEmoteSettingsChange({ ...props.chatEmoteSettings, [key]: next })
                    }
                  />
                ))}
            </div>
            <div className="chat-emote-card">
              <strong className="chat-emote-card__title">
                Additional emotes
              </strong>
              <span className="chat-emote-card__description">
                The first emote in a message always appears. Later emotes only
                appear when their exact 7TV name is listed here.
              </span>
              <div className="chat-emote-blacklist__add">
                <input
                  style={fieldStyle}
                  value={additionalEmoteName}
                  onChange={(event) => setAdditionalEmoteName(event.target.value.trim())}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    event.currentTarget.nextElementSibling instanceof HTMLButtonElement &&
                      event.currentTarget.nextElementSibling.click();
                  }}
                  placeholder="PianoTime"
                  maxLength={64}
                  title="Enter the exact case-insensitive Twitch or 7TV emote name"
                />
                <button
                  type="button"
                  className="ui-button ui-button--compact"
                  disabled={
                    !/^[a-z0-9_]{1,64}$/i.test(additionalEmoteName) ||
                    props.chatEmoteSettings.additionalEmotes.some(
                      (name) => name.toLowerCase() === additionalEmoteName.toLowerCase(),
                    )
                  }
                  onClick={() => {
                    if (!/^[a-z0-9_]{1,64}$/i.test(additionalEmoteName)) {
                      toast.error("Enter a valid 7TV emote name");
                      return;
                    }
                    props.onChatEmoteSettingsChange({
                      ...props.chatEmoteSettings,
                      additionalEmotes: [...props.chatEmoteSettings.additionalEmotes, additionalEmoteName],
                    });
                    toast.success(`${additionalEmoteName} can now appear after the first emote`);
                    setAdditionalEmoteName("");
                  }}
                >
                  <Plus size={13} /> Allow
                </button>
              </div>
              {props.chatEmoteSettings.additionalEmotes.length ? (
                <div className="chat-emote-blacklist">
                  {props.chatEmoteSettings.additionalEmotes.map((emoteName) => (
                    <span key={emoteName.toLowerCase()}>
                      {emoteName}
                      <button
                        type="button"
                        onClick={() => {
                          props.onChatEmoteSettingsChange({
                            ...props.chatEmoteSettings,
                            additionalEmotes: props.chatEmoteSettings.additionalEmotes.filter(
                              (name) => name.toLowerCase() !== emoteName.toLowerCase(),
                            ),
                          });
                          toast.success(`${emoteName} removed from additional emotes`);
                        }}
                        title={`Stop allowing ${emoteName} after the first emote`}
                        aria-label={`Remove ${emoteName} from additional emotes`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="chat-emote-blacklist__empty">No additional emotes allowed</span>
              )}
            </div>
            <div className="chat-emote-card">
              <strong className="chat-emote-card__title">
                Blocked emotes
              </strong>
              <span className="chat-emote-card__description">
                Block Twitch subscriber/global or 7TV emotes by name. Case-insensitive; overrides additional emotes. Applies to new messages.
              </span>
              <form className="chat-emote-blacklist__add" onSubmit={(event) => {
                event.preventDefault();
                const name = blockedEmoteName.trim();
                const current = props.chatEmoteSettings.blockedEmotes ?? [];
                if (!/^\S{1,64}$/.test(name) || current.length >= 100 || current.some((item) => item.toLowerCase() === name.toLowerCase())) return;
                props.onChatEmoteSettingsChange({ ...props.chatEmoteSettings, blockedEmotes: [...current, name] });
                setBlockedEmoteName("");
                toast.success(`${name} blocked from chat emotes`);
              }}>
                <input style={fieldStyle} value={blockedEmoteName} onChange={(event) => setBlockedEmoteName(event.target.value)} maxLength={64} placeholder="Exact emote name" aria-label="Emote name to block" title="Enter a Twitch or 7TV emote name, including its channel prefix if present" />
                <button type="submit" className="ui-button ui-button--compact" disabled={!/^\S{1,64}$/.test(blockedEmoteName.trim()) || (props.chatEmoteSettings.blockedEmotes ?? []).length >= 100 || (props.chatEmoteSettings.blockedEmotes ?? []).some((name) => name.toLowerCase() === blockedEmoteName.trim().toLowerCase())}>
                  <Plus size={13} /> Block
                </button>
              </form>
              <div className="chat-emote-blacklist">
                {(props.chatEmoteSettings.blockedEmotes ?? []).map((name) => (
                  <span key={name}>{name}<button type="button" aria-label={`Unblock ${name}`} title={`Allow ${name} again`} onClick={() => {
                    props.onChatEmoteSettingsChange({ ...props.chatEmoteSettings, blockedEmotes: props.chatEmoteSettings.blockedEmotes.filter((item) => item !== name) });
                    toast.success(`${name} unblocked`);
                  }}><X size={11} /></button></span>
                ))}
                {!(props.chatEmoteSettings.blockedEmotes ?? []).length && <span className="chat-emote-blacklist__empty">No blocked emotes</span>}
              </div>
            </div>
            <div className="chat-emote-card">
              <strong className="chat-emote-card__title">
                Blocked chatters
              </strong>
              <span className="chat-emote-card__description">
                These Twitch usernames cannot spawn chat emotes. Commands are
                unaffected.
              </span>
              <div className="chat-emote-blacklist__add">
                <input
                  style={fieldStyle}
                  value={blacklistName}
                  onChange={(event) =>
                    setBlacklistName(
                      event.target.value.replace(/^@/, "").toLowerCase(),
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    event.currentTarget.nextElementSibling instanceof
                      HTMLButtonElement &&
                      event.currentTarget.nextElementSibling.click();
                  }}
                  placeholder="username"
                  maxLength={25}
                  title="Enter a Twitch username to prevent their emotes from appearing"
                />
                <button
                  type="button"
                  className="ui-button ui-button--compact"
                  disabled={
                    !/^[a-z0-9_]{1,25}$/.test(blacklistName) ||
                    props.chatEmoteSettings.blacklist.includes(blacklistName)
                  }
                  onClick={() => {
                    if (!/^[a-z0-9_]{1,25}$/.test(blacklistName)) {
                      toast.error("Enter a valid Twitch username");
                      return;
                    }
                    props.onChatEmoteSettingsChange({
                      ...props.chatEmoteSettings,
                      blacklist: [
                        ...props.chatEmoteSettings.blacklist,
                        blacklistName,
                      ],
                    });
                    toast.success(`@${blacklistName} blocked from chat emotes`);
                    setBlacklistName("");
                  }}
                >
                  <Plus size={13} /> Block
                </button>
              </div>
              {props.chatEmoteSettings.blacklist.length ? (
                <div className="chat-emote-blacklist">
                  {props.chatEmoteSettings.blacklist.map((username) => (
                    <span key={username}>
                      @{username}
                      <button
                        type="button"
                        onClick={() => {
                          props.onChatEmoteSettingsChange({
                            ...props.chatEmoteSettings,
                            blacklist: props.chatEmoteSettings.blacklist.filter(
                              (item) => item !== username,
                            ),
                          });
                          toast.success(
                            `@${username} removed from the blacklist`,
                          );
                        }}
                        title={`Allow @${username} to spawn chat emotes again`}
                        aria-label={`Remove ${username} from blacklist`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="chat-emote-blacklist__empty">
                  No blocked chatters
                </span>
              )}
            </div>
            <p className="chat-emote-note">
              Both channel 7TV sets follow the active preview. Native Vicksy and
              Wixels Twitch emotes are recognized from chat in either channel.
              Images remain on their providers’ CDNs.
            </p>
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="studio-section">
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </section>
  );
}
function CreateRow({
  name,
  setName,
  placeholder,
  onCreate,
  label,
  disabled,
}: {
  name: string;
  setName: (v: string) => void;
  placeholder: string;
  onCreate: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <>
      <input
        style={fieldStyle}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onCreate()}
        placeholder={placeholder}
        maxLength={60}
      />
      <button
        className="ui-button studio-primary"
        onClick={onCreate}
        disabled={disabled}
      >
        <Plus size={14} />
        {label}
      </button>
    </>
  );
}
function Item({
  name,
  detail,
  onPrimary,
  primary,
  onDelete,
  onEdit,
  onTest,
  leading,
  active,
}: {
  name: string;
  detail: string;
  onPrimary: () => void;
  primary: string;
  onDelete: () => void;
  onEdit?: () => void;
  onTest?: () => void;
  leading?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div className={`studio-item${active === false ? " studio-item--off" : ""}${leading ? " studio-item--icon" : ""}`}>
      {leading && (
        <span className="studio-item__icon" aria-hidden="true">
          {leading}
        </span>
      )}
      <div className="studio-item__body">
        <strong>{name}</strong>
        <small>{detail}</small>
      </div>
      <div className="studio-item__actions">
        {onTest && (
          <button
            className="ui-icon-button ui-button--compact ui-icon-button--ghost"
            onClick={onTest}
            title={`Run ${name} now as a test`}
            aria-label={`Run ${name} now as a test`}
          >
            <Play size={14} />
          </button>
        )}
        {onEdit && (
          <button
            className="ui-icon-button ui-button--compact ui-icon-button--ghost"
            onClick={onEdit}
            title={`Edit ${name}`}
            aria-label={`Edit ${name}`}
          >
            <Pencil size={14} />
          </button>
        )}
        {active === undefined ? (
          <button
            className="ui-button ui-button--compact"
            onClick={onPrimary}
            title={`${primary} ${name}`}
          >
            {primary === "Play" ? <Play size={12} /> : primary}
          </button>
        ) : (
          <button
            type="button"
            className="ui-switch"
            onClick={onPrimary}
            role="switch"
            aria-checked={active}
            aria-label={`${name} is ${active ? "enabled" : "disabled"}`}
            title={`${active ? "Disable" : "Enable"} ${name}`}
          />
        )}
        <button
          className="ui-icon-button ui-button--compact ui-icon-button--ghost ui-icon-button--danger"
          onClick={onDelete}
          title={`Delete ${name}`}
          aria-label={`Delete ${name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
