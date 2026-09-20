import assert from "node:assert/strict";
import test from "node:test";
import { blockCount, decodePlan, interpretPrompt } from "./index.js";
import { castScenes } from "../casting/index.js";

const voices = [
  { voice_id: "callum", name: "Callum" },
  { voice_id: "other", name: "Other" },
];
const scene = {
  dialogue: "[crying] I... cannot...",
  sound: "",
  character: "sad man",
  delivery: "sobbing throughout",
  voice: "voice1" as const,
  duration: 15,
  effect: "reverb" as const,
  backgroundVolume: 0.22,
  preferredVoiceId: "callum",
  stability: 0.5,
};
const response = (scenes: unknown[]) => ({
  status: "completed",
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify({ scenes, warnings: [] }) }],
    },
  ],
});

test("unquoted TTS sound blocks cannot acquire a narrator", () => {
  const plan = decodePlan(
    response([{ ...scene, dialogue: "Foxes barking!", sound: "Sharp fox barks" }]),
    voices,
    1,
    "((foxes barking in a cave;10s))",
  );
  assert.equal(plan.scenes[0].dialogue, "");
  assert.equal(plan.scenes[0].sound, "Sharp fox barks");
  assert.deepEqual(castScenes(plan.scenes, voices), []);
});

test("misclassified unquoted blocks are repaired instead of failing", () => {
  const plan = decodePlan(
    response([{ ...scene, dialogue: "Several foxes cheering", sound: "" }]),
    voices,
    1,
    "((several foxes cheering;5s))",
  );
  assert.equal(plan.scenes[0].dialogue, "");
  assert.equal(plan.scenes[0].sound, "several foxes cheering");
  assert.match(plan.warnings[0], /corrected from narration/);
});

test("multi-block TTS prompts cannot silently merge scenes", async () => {
  const prompt = '((man says "one";10s)) ((man says "two";10s))';
  assert.equal(blockCount(prompt), 2);
  assert.throws(
    () => decodePlan(response([scene]), voices, 2),
    /1 scenes for 2 ordered prompt sections/,
  );
  const fetcher: typeof fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.text.format.schema.properties.scenes.minItems, 2);
    return new Response(JSON.stringify(response([scene, scene])));
  };
  assert.equal((await interpretPrompt(prompt, "test-key", voices, fetcher)).scenes.length, 2);
});

test("mixed speech and directed blocks stay as separate ordered scenes", async () => {
  const prompt = "This is a test. How does this sound? ((fart in a cave;5s))";
  assert.equal(blockCount(prompt), 2);
  const spoken = { ...scene, dialogue: "This is a test. How does this sound?", sound: "" };
  const sound = { ...scene, dialogue: "Invented narration", sound: "A dry fart", character: "" };
  const plan = decodePlan(response([spoken, sound]), voices, 2, prompt);
  assert.equal(plan.scenes[0].dialogue, "This is a test. How does this sound?");
  assert.equal(plan.scenes[1].dialogue, "");
  assert.equal(plan.scenes[1].sound, "A dry fart");
});

test("authored cave and echo directions override a dry model plan", () => {
  const cavePlan = decodePlan(
    response([{ ...scene, dialogue: "Welcome home", effect: "none" }]),
    voices,
    1,
    '((man saying "Welcome home" in a cave;8s))',
  );
  assert.equal(cavePlan.scenes[0].effect, "reverb");

  const echoPlan = decodePlan(
    response([{ ...scene, dialogue: "Hello", effect: "none" }]),
    voices,
    1,
    '((man saying "Hello" with echo;8s))',
  );
  assert.equal(echoPlan.scenes[0].effect, "echo");
});

test("authored speech speed overrides an omitted planner value", () => {
  const plan = decodePlan(
    response([{ ...scene, dialogue: "Wait for me" }]),
    voices,
    1,
    '((pirate says "Wait for me";speed=0.8x;8s))',
  );
  assert.equal(plan.scenes[0].speechRate, 0.8);
});

test("pause blocks override model narration with exact custom silence", () => {
  const prompt = "First. ((pause;2.5s)) Second.";
  const plan = decodePlan(
    response([scene, { ...scene, dialogue: "Pause", sound: "" }, scene]),
    voices,
    3,
    prompt,
  );
  assert.equal(plan.scenes[1].dialogue, "");
  assert.equal(plan.scenes[1].sound, "__silence__");
  assert.equal(plan.scenes[1].duration, 2.5);
  assert.equal(plan.scenes[1].effect, "none");
  assert.throws(() => blockCount("((silence;31s))"), /between 0.5 and 30/);
});

test("neighboring sound cannot bleed into plain speech or change playback order", () => {
  const prompt =
    'You should krill your shell ((silence)) ((angry screaming: "NOW!")) ((loud lightning;3s))';
  const contaminatedNow = {
    ...scene,
    dialogue: "[screaming] NOW!",
    sound: "Lightning strike",
    duration: null,
  };
  const misplacedLightning = { ...scene, dialogue: "NOW!", sound: "", duration: null };
  const plan = decodePlan(
    response([scene, scene, contaminatedNow, misplacedLightning]),
    voices,
    4,
    prompt,
  );
  assert.equal(plan.scenes[2].dialogue, "[screaming] NOW!");
  assert.equal(plan.scenes[2].sound, "");
  assert.equal(plan.scenes[2].duration, null);
  assert.equal(plan.scenes[3].dialogue, "");
  assert.equal(plan.scenes[3].sound, "loud lightning");
  assert.equal(plan.scenes[3].duration, 3);
});

test("TTS interpretation uses strict, non-stored structured output", async () => {
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    return new Response(JSON.stringify(response([scene])));
  };
  assert.equal((await interpretPrompt("sad man", "test-key", voices, fetcher)).scenes.length, 1);
});

test("malformed completed model output falls back without a second request", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }],
      }),
    );
  };
  const plan = await interpretPrompt("Hello ((thunder;2s))", "test-key", voices, fetcher);
  assert.equal(calls, 1);
  assert.equal(plan.scenes.length, 2);
  assert.equal(plan.scenes[0].dialogue, "Hello");
  assert.equal(plan.scenes[1].sound, "thunder");
  assert.match(plan.warnings.at(-1)!, /safe local interpretation/);
});

test("transient OpenAI errors use safe local plans", async () => {
  for (const status of [400, 408, 429, 500, 503]) {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { code: "temporary" } }), { status });
    const plan = await interpretPrompt("Hello there", "test-key", voices, fetcher);
    assert.equal(plan.scenes[0].dialogue, "Hello there");
    assert.match(plan.warnings[0], new RegExp(String(status)));
  }
});

test("network timeouts use a safe local plan", async () => {
  const fetcher: typeof fetch = async () => {
    throw new DOMException("timed out", "TimeoutError");
  };
  const plan = await interpretPrompt("Still play this", "test-key", voices, fetcher);
  assert.equal(plan.scenes[0].dialogue, "Still play this");
  assert.match(plan.warnings[0], /timed out/);
});

test("authentication and exhausted-credit failures remain actionable", async () => {
  const unauthorized: typeof fetch = async () => new Response("{}", { status: 401 });
  await assert.rejects(
    () => interpretPrompt("test", "bad-key", voices, unauthorized),
    /rejected the API key/,
  );
  const exhausted: typeof fetch = async () =>
    new Response(JSON.stringify({ error: { type: "insufficient_quota" } }), { status: 429 });
  await assert.rejects(
    () => interpretPrompt("test", "key", voices, exhausted),
    /credits are unavailable/,
  );
});

test("code-fenced JSON and omitted scene defaults are repaired", () => {
  const sparse = { dialogue: "Hello", sound: "" };
  const payload = {
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: `\`\`\`json\n${JSON.stringify({ scenes: [sparse] })}\n\`\`\``,
          },
        ],
      },
    ],
  };
  const plan = decodePlan(payload, voices, 1, "Hello");
  assert.equal(plan.scenes[0].dialogue, "Hello");
  assert.equal(plan.scenes[0].voice, "voice1");
  assert.equal(plan.scenes[0].effect, "none");
  assert.equal(plan.scenes[0].backgroundVolume, 0.22);
});

test("refusals and wrong scene counts fall back while preserving authored order", async () => {
  const prompt = "First ((thunder;2s)) Last";
  const refusal: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
      }),
    );
  const refusedPlan = await interpretPrompt(prompt, "key", voices, refusal);
  assert.deepEqual(
    refusedPlan.scenes.map((item) => [item.dialogue, item.sound]),
    [
      ["First", ""],
      ["", "thunder"],
      ["Last", ""],
    ],
  );

  const merged: typeof fetch = async () => new Response(JSON.stringify(response([scene])));
  const mergedPlan = await interpretPrompt(prompt, "key", voices, merged);
  assert.deepEqual(
    mergedPlan.scenes.map((item) => [item.dialogue, item.sound]),
    [
      ["First", ""],
      ["", "thunder"],
      ["Last", ""],
    ],
  );
});

test("top-level output_text responses are accepted", () => {
  const payload = {
    status: "completed",
    output_text: JSON.stringify({ scenes: [scene], warnings: [] }),
  };
  assert.equal(decodePlan(payload, voices).scenes[0].dialogue, scene.dialogue);
});

test("a duration the user never wrote is discarded instead of squeezing the performance", () => {
  const invented = { ...scene, dialogue: "[screaming] I CAN'T HOLD IT IN!", duration: 3 };
  const plan = decodePlan(
    response([invented]),
    voices,
    1,
    '((man yelling in a cave: "I CAN\'T HOLD IT IN"))',
  );
  assert.equal(plan.scenes[0].duration, null);
  const sound = decodePlan(
    response([{ ...scene, dialogue: "", sound: "rain", duration: 12 }]),
    voices,
    1,
    "((rain))",
  );
  assert.equal(sound.scenes[0].duration, null);
});

test("shouting is decided by the user's words, not the planner's explanation", () => {
  const yelled = decodePlan(
    response([{ ...scene, intensity: "scream" }]),
    voices,
    1,
    '((man yelling: "NOW"))',
  );
  assert.equal(yelled.scenes[0].intensity, "shout");
  const screamed = decodePlan(
    response([{ ...scene, intensity: "normal" }]),
    voices,
    1,
    '((man screaming: "NOW"))',
  );
  assert.equal(screamed.scenes[0].intensity, "scream");
  const calm = decodePlan(
    response([{ ...scene, intensity: "normal" }]),
    voices,
    1,
    '((man saying: "hello"))',
  );
  assert.equal(calm.scenes[0].intensity, "normal");
  const plain = decodePlan(response([{ ...scene, intensity: "scream" }]), voices, 1, "hello there");
  assert.equal(plain.scenes[0].intensity, "normal");
});

test("planner wording that would spoil a generated sound is removed", () => {
  const foxes = {
    ...scene,
    dialogue: "",
    sound:
      "varied frantic fox screams with high-pitched, intense tones for 10 seconds, overlapping and echoing nature calls",
  };
  const plan = decodePlan(response([foxes]), voices, 1, "((foxes screaming;10 seconds))");
  assert.doesNotMatch(plan.scenes[0].sound, /high-pitched|seconds|echo/i);
  assert.match(plan.scenes[0].sound, /fox screams/);
  assert.equal(plan.scenes[0].duration, 10);
  // Words the user chose themselves are kept.
  const chosen = decodePlan(
    response([{ ...foxes, sound: "a shrill high-pitched whistle" }]),
    voices,
    1,
    "((shrill whistle;3s))",
  );
  assert.match(chosen.scenes[0].sound, /shrill/);
});

test("the planner is told the new intensity field and no longer prefers one voice", async () => {
  let body: any;
  const fetcher: typeof fetch = async (_url, options) => {
    body = JSON.parse(String(options?.body));
    return new Response(JSON.stringify(response([scene])));
  };
  await interpretPrompt("sad man", "test-key", voices, fetcher);
  assert.deepEqual(body.text.format.schema.properties.scenes.items.properties.intensity.enum, [
    "normal",
    "shout",
    "scream",
  ]);
  assert.ok(body.text.format.schema.properties.scenes.items.required.includes("intensity"));
  assert.doesNotMatch(body.instructions, /Callum/);
  assert.match(body.instructions, /never invent one/i);
  assert.match(body.instructions, /Never invent whispering/);
});

test("the planner's effect for each requested combination is decided by the user's words", () => {
  const prompt =
    "((Multiple loud farts,Reverb Echo;6s)) ((Extreme fart sound,Indoor;6s)) ((Huge fart from down a well,Echo;4s))";
  const planned = (sound: string) => ({
    ...scene,
    dialogue: "",
    sound,
    effect: "none" as const,
    duration: null,
  });
  const plan = decodePlan(
    response([
      planned("multiple loud farts"),
      planned("extremely loud deep fart"),
      planned("one huge fart"),
    ]),
    voices,
    3,
    prompt,
  );
  assert.deepEqual(
    plan.scenes.map((item) => [item.effect, item.room ?? null]),
    [
      ["both", null],
      ["reverb", "indoor"],
      ["both", "well"],
    ],
  );
  assert.equal(plan.scenes[1].effectStrength, "extreme");
  assert.deepEqual(
    plan.scenes.map((item) => item.duration),
    [6, 6, 4],
  );
});

test("the planner may return both, and is told the rules for it", async () => {
  let body: any;
  const fetcher: typeof fetch = async (_url, options) => {
    body = JSON.parse(String(options?.body));
    return new Response(JSON.stringify(response([{ ...scene, effect: "both" }])));
  };
  await interpretPrompt("sad man", "test-key", voices, fetcher);
  assert.ok(
    body.text.format.schema.properties.scenes.items.properties.effect.enum.includes("both"),
  );
  assert.match(body.instructions, /effect is both/);
  // A directed block with no room words of its own keeps the planner's choice.
  const plan = decodePlan(
    response([{ ...scene, dialogue: "hi", effect: "both" }]),
    voices,
    1,
    '((man says "hi";5s))',
  );
  assert.equal(plan.scenes[0].effect, "both");
  // Plain undirected speech never gets an effect.
  assert.equal(
    decodePlan(response([{ ...scene, effect: "both" }]), voices, 1, "hello there").scenes[0].effect,
    "none",
  );
});
