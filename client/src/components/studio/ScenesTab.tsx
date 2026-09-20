import { Section, CreateRow, Item } from "./shared";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** Save and restore the whole canvas. */
export function ScenesTab({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<StudioContext, "confirm" | "createScene" | "name" | "setName" | "toast">;
}) {
  const { confirm, createScene, name, setName, toast } = s;
  return (
    <Section title="Scenes" description="Save or restore the complete canvas and drawing.">
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
          <span>
            Arrange your layers, name the layout above and save it. Loading a scene replaces the
            current canvas, and Undo brings it back.
          </span>
        </div>
      )}
      {props.studio.scenes.map((item) => (
        <Item
          key={item.id}
          name={item.name}
          detail={new Date(item.updatedAt).toLocaleString()}
          onPrimary={async () => {
            if (
              await confirm({
                title: `Load “${item.name}”?`,
                message:
                  "This replaces the current canvas and drawing. You can restore the previous state with Undo.",
                confirmLabel: "Load scene",
              })
            ) {
              props.onLoadScene(item.id);
              toast.success(`Scene “${item.name}” loaded`);
            }
          }}
          primary="Load"
          onDelete={async () => {
            if (
              await confirm({
                title: `Delete “${item.name}”?`,
                message: "This permanently removes the saved scene.",
                confirmLabel: "Delete scene",
                danger: true,
              })
            ) {
              props.onDeleteScene(item.id);
              toast.success(`Scene “${item.name}” deleted`);
            }
          }}
        />
      ))}
    </Section>
  );
}
