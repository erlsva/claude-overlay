import type { ReactNode } from "react";
import { Emote } from "./Emote";
import type { EmoteName } from "./emotes";

/** A dashed card with an emote and a message: loading, empty, off, or a failure. */
export function State({ emote, children }: { emote: EmoteName; children: ReactNode }) {
  return (
    <div className="tts-public__state" role="status">
      <Emote name={emote} size={84} />
      <div>{children}</div>
    </div>
  );
}
