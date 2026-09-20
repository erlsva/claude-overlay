import { useState, useRef } from "react";
import {
  type OverlayTrigger,
  type TriggerEventType,
  type TriggerPlacement,
  type FlyDirection,
  type ChatPermission,
  type TriggerStep,
} from "../../types";
import { useTwitchEvents } from "../../hooks/useTwitchEvents";
import { randomUUID } from "../../utils";
import { SERVER_URL } from "../../config/server";
import { authHeaders } from "../../hooks/useAuth";
import type { StudioPanelProps } from "./types";
import type { StudioShell } from "./types";

/** The automation builder: its form state, the list filter, Twitch connections, and saving, editing and testing triggers. */
export function useTriggerBuilder(
  props: StudioPanelProps,
  shell: Pick<StudioShell, "toast" | "confirm" | "tab" | "name" | "setName" | "listSearch">,
) {
  const { toast, confirm, tab, name, setName, listSearch } = shell;
  const [triggerAction, setTriggerAction] = useState<OverlayTrigger["action"]>("show-element");
  const [triggerMatch, setTriggerMatch] = useState("");
  const [triggerEvent, setTriggerEvent] =
    useState<Exclude<TriggerEventType, "chat-command">>("follow");
  const [triggerMinimum, setTriggerMinimum] = useState(1);
  const [triggerChannel, setTriggerChannel] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [ttsErrorMessage, setTtsErrorMessage] = useState("");
  const [targetId, setTargetId] = useState("");
  const [cooldown, setCooldown] = useState(5);
  const [triggerPlacement, setTriggerPlacement] = useState<TriggerPlacement>("current");
  const [flyDirection, setFlyDirection] = useState<FlyDirection>("left-to-right-bottom");
  const [duration, setDuration] = useState(5);
  const [permission, setPermission] = useState<ChatPermission>("everyone");
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [chainedSteps, setChainedSteps] = useState<TriggerStep[]>([]);
  const [editingChainIndex, setEditingChainIndex] = useState<number | null>(null);
  const [stepTiming, setStepTiming] = useState<NonNullable<TriggerStep["timing"]>>("immediate");
  const [stepDelay, setStepDelay] = useState(1);
  const [flyRunning, setFlyRunning] = useState(false);
  const flyStopRef = useRef<(() => void) | null>(null);
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
    eventStatus?.chatbot?.connected && eventStatus.chatbot.scopes.includes("user:write:chat")
  );
  const unavailableChatChannels =
    eventStatus?.channels.filter((channel) => !channel.connected) ?? [];
  const chatConnectionWarning =
    !!eventStatus &&
    (!eventStatus.configured || !chatbotHasWriteAccess || unavailableChatChannels.length > 0);
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
    ttsErrorMessage:
      triggerAction === "tts" && ttsErrorMessage.trim() ? ttsErrorMessage.trim() : undefined,
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
  const createTrigger = () => {
    if (editingChainIndex !== null) {
      toast.error("Finish updating the command action first");
      return;
    }
    if (
      !name.trim() ||
      (!["refresh-overlay", "send-chat", "tts"].includes(triggerAction) && !targetId) ||
      (["send-chat", "tts"].includes(triggerAction) && !chatMessage.trim())
    )
      return;
    const steps = [...chainedSteps, currentTriggerStep()];
    props.onSaveTrigger({
      id: editingTriggerId ?? randomUUID(),
      name: name.trim(),
      enabled: editingTriggerId
        ? (props.studio.triggers.find((trigger) => trigger.id === editingTriggerId)?.enabled ??
          true)
        : true,
      event: isEvent ? triggerEvent : "chat-command",
      match:
        isEvent && triggerEvent !== "channel-points" ? undefined : triggerMatch.trim() || undefined,
      minimum:
        isEvent && ["subscribe", "gift-subscribe", "raid", "bits"].includes(triggerEvent)
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
      ]
        .filter(Boolean)
        .join(" and ");
      if (
        !(await confirm({
          title: `Run “${item.name}” as a test?`,
          message: `This will really ${effects}. Cooldowns and permissions are ignored.`,
          confirmLabel: "Run test",
        }))
      )
        return;
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
      (!["refresh-overlay", "send-chat", "tts"].includes(triggerAction) && !targetId) ||
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
        steps.map((step, index) => (index === editingChainIndex ? currentTriggerStep() : step)),
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
    if (editingChainIndex === null) pendingStepBeforeChainEdit.current = currentTriggerStep();
    setEditingChainIndex(index);
    loadTriggerStep(step);
  };
  const currentStepIsFirst =
    editingChainIndex === 0 || (editingChainIndex === null && chainedSteps.length === 0);
  const selectedTargetElement = props.elements.find((element) => element.id === targetId);
  const selectedTargetSound = props.studio.sounds.find((sound) => sound.id === targetId);

  return {
    triggerAction,
    setTriggerAction,
    triggerMatch,
    setTriggerMatch,
    triggerEvent,
    setTriggerEvent,
    triggerMinimum,
    setTriggerMinimum,
    triggerChannel,
    setTriggerChannel,
    chatMessage,
    setChatMessage,
    ttsErrorMessage,
    setTtsErrorMessage,
    targetId,
    setTargetId,
    cooldown,
    setCooldown,
    triggerPlacement,
    setTriggerPlacement,
    flyDirection,
    setFlyDirection,
    duration,
    setDuration,
    permission,
    setPermission,
    editingTriggerId,
    setEditingTriggerId,
    chainedSteps,
    setChainedSteps,
    editingChainIndex,
    setEditingChainIndex,
    stepTiming,
    setStepTiming,
    stepDelay,
    setStepDelay,
    flyRunning,
    setFlyRunning,
    flyStopRef,
    builderOpen,
    setBuilderOpen,
    kind,
    setKind,
    filter,
    setFilter,
    connectionsOpen,
    setConnectionsOpen,
    isEvent,
    pendingStepBeforeChainEdit,
    twitchEvents,
    eventStatus,
    chatbotHasWriteAccess,
    unavailableChatChannels,
    chatConnectionWarning,
    hasTriggersForTab,
    isChatTrigger,
    chatCount,
    eventCount,
    visibleTriggers,
    builderVisible,
    currentTriggerStep,
    resetTriggerStep,
    loadTriggerStep,
    resetTriggerForm,
    createTrigger,
    editTrigger,
    cancelTriggerEdit,
    testTrigger,
    closeBuilder,
    addChainedStep,
    editChainedStep,
    currentStepIsFirst,
    selectedTargetElement,
    selectedTargetSound,
  };
}
