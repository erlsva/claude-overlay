/** The strict JSON schema the planner model must answer in. */

const properties = {
  dialogue: { type: "string", maxLength: 2000 },
  sound: { type: "string", maxLength: 1000 },
  character: { type: "string", maxLength: 500 },
  delivery: { type: "string", maxLength: 1000 },
  channel: { type: "string", enum: ["clean", "intercom"] },
  distant: { type: "boolean" },
  effectStrength: { type: "string", enum: ["normal", "extreme"] },
  intensity: { type: "string", enum: ["normal", "shout", "scream"] },
  voice: { type: "string", enum: ["voice1", "voice2"] },
  duration: {
    anyOf: [{ type: "number", minimum: 0.5, maximum: 30 }, { type: "null" }],
  },
  effect: { type: "string", enum: ["none", "echo", "reverb", "both"] },
  backgroundVolume: { type: "number", minimum: 0, maximum: 1 },
  preferredVoiceId: { type: "string", maxLength: 100 },
  stability: { type: "number", enum: [0, 0.5, 1] },
  soundDuration: { type: "number", minimum: 0.5, maximum: 30 },
};

export const planFormat = {
  type: "json_schema",
  name: "audio_scene_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["scenes", "warnings"],
    properties: {
      scenes: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          properties,
          required: Object.keys(properties),
        },
      },
      warnings: {
        type: "array",
        maxItems: 20,
        items: { type: "string", maxLength: 1000 },
      },
    },
  },
};
