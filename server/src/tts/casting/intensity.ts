/** How hard a scene is delivered, and the one tag that asks for it. */

import { type Scene, type Intensity, detectIntensity } from "../scene/index.js";

/** The intensity of a scene. Planned scenes carry it explicitly; hand-written ones fall back to their short direction. */
export function sceneIntensity(scene: Scene): Intensity {
  if (scene.intensity) return scene.intensity;
  const direction = `${scene.character || ""} ${scene.delivery || ""}`;
  // A long delivery is a model's explanation, not the user's words.
  return (scene.delivery || "").length <= 160 ? detectIntensity(direction) : "normal";
}

// One short tag per intensity. ElevenLabs reads long, invented tags aloud or ignores them.
export const intensityTag: Record<Intensity, string> = {
  normal: "",
  shout: "shouts",
  scream: "screaming",
};
