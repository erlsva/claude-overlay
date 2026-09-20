import { Segmented } from "../Segmented";
import { Search, MessageCircle, BellRing } from "lucide-react";
import { Item } from "./shared";
import { TRIGGER_EVENT_LABELS, triggerActionLabel } from "./triggerOptions";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** The saved automations, with search and a chat/event filter. */
export function TriggerList({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<
    StudioContext,
    | "chatCount"
    | "confirm"
    | "editTrigger"
    | "eventCount"
    | "filter"
    | "hasTriggersForTab"
    | "isChatTrigger"
    | "listSearch"
    | "setFilter"
    | "setListSearch"
    | "testTrigger"
    | "toast"
    | "visibleTriggers"
  >;
}) {
  const {
    chatCount,
    confirm,
    editTrigger,
    eventCount,
    filter,
    hasTriggersForTab,
    isChatTrigger,
    listSearch,
    setFilter,
    setListSearch,
    testTrigger,
    toast,
    visibleTriggers,
  } = s;
  return (
    <>
      {hasTriggersForTab && (
        <Segmented
          label="Filter automations"
          value={filter}
          onChange={setFilter}
          options={(
            [
              ["all", "All", props.studio.triggers.length],
              ["chat", "Chat", chatCount],
              ["event", "Twitch", eventCount],
            ] as const
          ).map(([value, label, count]) => ({
            value,
            label: (
              <>
                {label} <span className="segmented__count">{count}</span>
              </>
            ),
          }))}
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
            toast.success(`Automation “${item.name}” ${item.enabled ? "disabled" : "enabled"}`);
          }}
          primary={item.enabled ? "Active" : "Disabled"}
          active={item.enabled}
          onDelete={async () => {
            if (
              !(await confirm({
                title: `Delete “${item.name}”?`,
                message: "This permanently removes the saved command or event action.",
                confirmLabel: "Delete automation",
                danger: true,
              }))
            )
              return;
            props.onDeleteTrigger(item.id);
            toast.success(`Automation “${item.name}” deleted`);
          }}
        />
      ))}
    </>
  );
}
