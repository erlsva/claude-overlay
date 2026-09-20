/** Asking OpenAI to plan a prompt as scenes, with a safe local plan whenever it cannot. */

import { z } from "zod";
import type { AccountVoice } from "../casting.js";
import { parsePrompt } from "../shared/scene.js";
import { blockCount, decodePlan } from "./decode.js";
import { plannerInstructions } from "./prompt.js";
import { planFormat } from "./schema.js";

type Plan = ReturnType<typeof decodePlan>;

/** The conservative local parser's plan, with a warning saying why the AI plan was not used. */
function localPlan(prompt: string, warning: string): Plan {
  const fallback = parsePrompt(prompt);
  return { ...fallback, warnings: [...fallback.warnings, warning] };
}

/** The response format, pinned to exactly one scene per ((...)) block when the prompt has them. */
function responseFormat(expectedCount: number | undefined) {
  const format = structuredClone(planFormat);
  if (expectedCount !== undefined)
    Object.assign(format.schema.properties.scenes, {
      minItems: expectedCount,
      maxItems: expectedCount,
    });
  return format;
}

function requestBody(prompt: string, voices: AccountVoice[], expectedCount: number | undefined) {
  return JSON.stringify({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    store: false,
    instructions: plannerInstructions(expectedCount),
    input: JSON.stringify({
      sceneDescription: prompt,
      availableVoices: voices.slice(0, 80).map((v) => ({
        id: v.voice_id,
        name: String(v.name || "").slice(0, 100),
        description: String(v.description || "").slice(0, 500),
        category: v.category,
        labels: v.labels,
      })),
    }),
    text: { format: responseFormat(expectedCount) },
    max_output_tokens: 6500,
  });
}

const RETRYABLE_STATUSES = [400, 408, 409, 429];

/** Turns a failed OpenAI response into a plain-language error the user can act on. */
function failureMessage(status: number): string {
  if (status === 401) return "OpenAI rejected the API key. Check OPENAI_API_KEY in .env.";
  if (status === 403)
    return "OpenAI denied access. Check Model capabilities Request and Responses Write permissions.";
  return `OpenAI request failed (${status}). Check model access and try again.`;
}

export async function interpretPrompt(
  prompt: string,
  key: string,
  voices: AccountVoice[],
  fetcher: typeof fetch = fetch,
): Promise<Plan> {
  if (!key.trim())
    throw new Error(
      "Add OPENAI_API_KEY to the local .env file and restart Scene Lab to enable the expressive interpreter.",
    );
  z.string().trim().min(1).max(6000).parse(prompt);
  const expectedCount = blockCount(prompt);
  const unavailable = (reason: string) => {
    console.warn(`TTS interpreter fallback: ${reason}`);
    return localPlan(
      prompt,
      `AI interpretation was unavailable (${reason}). A safe local interpretation was used instead.`,
    );
  };

  let response: Response;
  try {
    response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: requestBody(prompt, voices, expectedCount),
      signal: AbortSignal.timeout(90000),
    });
  } catch {
    return unavailable("OpenAI could not be reached or timed out");
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: { code?: string; type?: string };
    } | null;
    const outOfCredit =
      detail?.error?.type === "insufficient_quota" ||
      ["insufficient_quota", "credit_balance_exhausted"].includes(detail?.error?.code || "");
    if (response.status === 429 && outOfCredit)
      throw new Error(
        "OpenAI API credits are unavailable for this project. Add API credits or check the project budget in OpenAI Platform billing, then preview again.",
      );
    if (RETRYABLE_STATUSES.includes(response.status) || response.status >= 500)
      return unavailable(`OpenAI returned HTTP ${response.status}`);
    throw new Error(failureMessage(response.status));
  }

  try {
    return decodePlan(await response.json(), voices, expectedCount, prompt);
  } catch (error) {
    // Structured-output providers can occasionally return a completed response whose JSON is
    // truncated or misses a required field. Paid Twitch events should still play in the authored
    // order, so use the conservative local parser instead of spending another model request or
    // failing outright.
    return localPlan(
      prompt,
      `The AI performance plan could not be validated (${error instanceof Error ? error.message : "invalid response"}). A safe local interpretation was used instead.`,
    );
  }
}
