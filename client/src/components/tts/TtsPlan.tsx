import { WandSparkles } from "lucide-react";
import type { TtsContext } from "./context";

/** The reviewed plan: each scene, its voice and effects. */
export function TtsPlan({ s }: { s: Pick<TtsContext, "plan"> }) {
  const { plan } = s;
  if (!plan) return null;
  return (
    <div className="tts-plan">
      <div className="tts-subheading">
        <span>
          <WandSparkles size={14} />
          <strong>Performance plan</strong>
        </span>
        <small>Generation will reuse this reviewed plan for 15 minutes.</small>
      </div>
      {plan.warnings.map((warning) => (
        <p className="tts-inline-note" key={warning}>
          {warning}
        </p>
      ))}
      {plan.scenes.map((scene, index) => (
        <article key={`${index}-${scene.dialogue}-${scene.sound}`} className="tts-scene">
          <b>{index + 1}</b>
          <span>
            <strong>
              {scene.sound === "__silence__"
                ? "Pause"
                : scene.character || (scene.dialogue ? "Voice" : "Sound effect")}
            </strong>
            <small>
              {scene.sound === "__silence__"
                ? "Intentional silence"
                : scene.dialogue
                  ? `“${scene.dialogue}”`
                  : scene.sound}
            </small>
            <em>
              {[
                scene.sound && scene.dialogue ? `Background: ${scene.sound}` : "",
                scene.effect !== "none"
                  ? scene.effect === "both"
                    ? "echo + reverb"
                    : scene.effect
                  : "",
                scene.speechRate && scene.speechRate !== 1
                  ? `${scene.speechRate.toFixed(2)}× speech`
                  : "",
                scene.duration ? `${scene.duration}s` : "natural length",
              ]
                .filter(Boolean)
                .join(" · ")}
            </em>
          </span>
        </article>
      ))}
    </div>
  );
}
