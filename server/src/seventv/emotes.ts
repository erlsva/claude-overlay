interface SevenTvEmote {
  id?: string;
  name?: string;
  flags?: number | {
    zero_width?: boolean;
    zeroWidth?: boolean;
    default_zero_width?: boolean;
    defaultZeroWidth?: boolean;
  };
  data?: {
    id?: string;
    name?: string;
    flags?: number | {
      zero_width?: boolean;
      zeroWidth?: boolean;
      default_zero_width?: boolean;
      defaultZeroWidth?: boolean;
    };
  };
}

interface SevenTvUserResponse {
  emote_set?: { emotes?: SevenTvEmote[] };
}

interface SevenTvSetResponse {
  emotes?: SevenTvEmote[];
}

export interface ResolvedSevenTvEmote {
  id: string;
  name: string;
  imageUrl: string;
  isZeroWidth: boolean;
  position?: number;
}

interface CachedEmoteSet {
  expiresAt: number;
  emotes: Map<string, ResolvedSevenTvEmote>;
}

interface RetryState {
  failures: number;
  nextAttemptAt: number;
}

export function stackEmotes<T extends { isZeroWidth: boolean }>(items: T[]) {
  const stacks: Array<{ base: T; overlays: T[] }> = [];
  const leadingOverlays: T[] = [];

  for (const item of items) {
    if (item.isZeroWidth && stacks.length) {
      stacks.at(-1)!.overlays.push(item);
    } else if (item.isZeroWidth) {
      leadingOverlays.push(item);
    } else {
      // Chatters sometimes enter a modifier before its base. Associate an
      // initial modifier run with the first regular emote rather than letting
      // it take up its own horizontal space.
      stacks.push({ base: item, overlays: leadingOverlays.splice(0) });
    }
  }

  return { stacks, leadingOverlays };
}

const CACHE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 15 * 60_000;
const caches = new Map<string, CachedEmoteSet>();
const pendingLoads = new Map<string, Promise<Map<string, ResolvedSevenTvEmote>>>();
const retryStates = new Map<string, RetryState>();
let globalCache: CachedEmoteSet | undefined;
let pendingGlobalLoad: Promise<Map<string, ResolvedSevenTvEmote>> | undefined;
let globalRetryState: RetryState | undefined;

function retryDelay(failures: number) {
  const exponential = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, failures - 1), RETRY_MAX_MS);
  // Jitter prevents multiple Render instances or channel refreshes from
  // hammering 7TV again at exactly the same moment after an outage.
  return Math.round(exponential * (0.8 + Math.random() * 0.4));
}

function describeFailure(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function recordRetryFailure(scope: string, previous?: RetryState): RetryState {
  const failures = (previous?.failures ?? 0) + 1;
  const delay = retryDelay(failures);
  console.warn(`7TV ${scope} unavailable; keeping cached emotes and retrying in ${Math.ceil(delay / 1000)}s`);
  return { failures, nextAttemptAt: Date.now() + delay };
}

function mapEmotes(entries: SevenTvEmote[]) {
  const emotes = new Map<string, ResolvedSevenTvEmote>();
  for (const entry of entries) {
    const id = entry.id ?? entry.data?.id;
    const name = entry.name ?? entry.data?.name;
    if (!id || !name) continue;
    emotes.set(name, {
      id,
      name,
      imageUrl: `https://cdn.7tv.app/emote/${encodeURIComponent(id)}/2x.webp`,
      // V3 has represented this on both the active set entry and emote data
      // across API generations. Supporting both keeps cached channel sets
      // compatible while 7TV rolls out its newer schema.
      isZeroWidth:
        (typeof entry.flags === "number" &&
          ((entry.flags & 1) !== 0 || (entry.flags & 256) !== 0)) ||
        (typeof entry.data?.flags === "number" && (entry.data.flags & 256) !== 0) ||
        (typeof entry.flags === "object" &&
          !!(
            entry.flags.zero_width ??
            entry.flags.zeroWidth ??
            entry.flags.default_zero_width ??
            entry.flags.defaultZeroWidth
          )) ||
        (typeof entry.data?.flags === "object" &&
          !!(
            entry.data.flags.zero_width ??
            entry.data.flags.zeroWidth ??
            entry.data.flags.default_zero_width ??
            entry.data.flags.defaultZeroWidth
          )),
    });
  }
  return emotes;
}

async function loadGlobalEmoteSet() {
  if (globalCache && globalCache.expiresAt > Date.now()) return globalCache.emotes;
  if (pendingGlobalLoad) return globalCache?.emotes ?? pendingGlobalLoad;
  if (globalRetryState && globalRetryState.nextAttemptAt > Date.now()) {
    return globalCache?.emotes ?? new Map<string, ResolvedSevenTvEmote>();
  }

  const staleEmotes = globalCache?.emotes;
  pendingGlobalLoad = (async () => {
    try {
      const response = await fetch("https://7tv.io/v3/emote-sets/global", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`7TV globals returned ${response.status}`);
      const data = (await response.json()) as SevenTvSetResponse;
      const emotes = mapEmotes(data.emotes ?? []);
      globalCache = { expiresAt: Date.now() + CACHE_MS, emotes };
      globalRetryState = undefined;
      return emotes;
    } catch (error) {
      globalRetryState = recordRetryFailure(`global emote set (${describeFailure(error)})`, globalRetryState);
      return staleEmotes ?? new Map<string, ResolvedSevenTvEmote>();
    }
  })().finally(() => { pendingGlobalLoad = undefined; });

  // Stale-while-revalidate: chat rendering never waits on 7TV when a previous
  // successful copy is available.
  if (staleEmotes) {
    void pendingGlobalLoad;
    return staleEmotes;
  }
  return pendingGlobalLoad;
}

async function loadEmoteSet(twitchUserId: string) {
  const cached = caches.get(twitchUserId);
  if (cached && cached.expiresAt > Date.now()) return cached.emotes;

  const pending = pendingLoads.get(twitchUserId);
  if (pending) return cached?.emotes ?? pending;

  const retryState = retryStates.get(twitchUserId);
  if (retryState && retryState.nextAttemptAt > Date.now()) {
    return cached?.emotes ?? new Map<string, ResolvedSevenTvEmote>();
  }

  const request = (async () => {
    const [response, globalEmotes] = await Promise.all([
      fetch(`https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchUserId)}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
      loadGlobalEmoteSet(),
    ]);
    if (!response.ok) throw new Error(`7TV returned ${response.status}`);
    const data = (await response.json()) as SevenTvUserResponse;
    const emotes = new Map(globalEmotes);
    for (const [name, emote] of mapEmotes(data.emote_set?.emotes ?? [])) emotes.set(name, emote);
    caches.set(twitchUserId, { expiresAt: Date.now() + CACHE_MS, emotes });
    retryStates.delete(twitchUserId);
    return emotes;
  })()
    .catch((error) => {
      retryStates.set(
        twitchUserId,
        recordRetryFailure(`channel set ${twitchUserId} (${describeFailure(error)})`, retryStates.get(twitchUserId)),
      );
      return cached?.emotes ?? new Map<string, ResolvedSevenTvEmote>();
    })
    .finally(() => pendingLoads.delete(twitchUserId));

  pendingLoads.set(twitchUserId, request);
  if (cached) {
    void request;
    return cached.emotes;
  }
  return request;
}

export async function resolveSevenTvEmotes(twitchUserId: string, message: string) {
  if (!twitchUserId) return [];
  try {
    const emoteSet = await loadEmoteSet(twitchUserId);
    const matches: ResolvedSevenTvEmote[] = [];
    for (const match of message.matchAll(/\S+/g)) {
      const emote = emoteSet.get(match[0]);
      if (!emote) continue;
      matches.push({ ...emote, position: match.index });
      if (matches.length >= 20) break;
    }
    return matches;
  } catch (error) {
    // This is reserved for unexpected parsing/programming failures. Network
    // failures are handled and rate-limited by the loaders above.
    console.error("Could not resolve the 7TV emote set:", error);
    return [];
  }
}
