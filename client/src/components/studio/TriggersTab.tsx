import { Section } from "./shared";
import { ConnectionsSection } from "./ConnectionsSection";
import { TriggerBuilder } from "./TriggerBuilder";
import { TriggerList } from "./TriggerList";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** Automations: commands and Twitch events that run actions. */
export function TriggersTab({ props, s }: { props: StudioPanelProps; s: StudioContext }) {
  return (
    <Section
      title="Automations"
      description="Run media, sounds, chat messages and TTS when someone uses a chat command or a Twitch event happens."
    >
      <ConnectionsSection props={props} s={s} />
      <TriggerBuilder props={props} s={s} />
      <TriggerList props={props} s={s} />
    </Section>
  );
}
