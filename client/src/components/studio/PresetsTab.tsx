import { Section, CreateRow, Item } from "./shared";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** Save selected elements for reuse. */
export function PresetsTab({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<StudioContext, "createPreset" | "name" | "setName" | "toast">;
}) {
  const { createPreset, name, setName, toast } = s;
  return (
    <Section title="Presets" description="Save the currently selected elements for reuse.">
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
  );
}
