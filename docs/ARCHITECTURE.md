# Architecture

Where things live and how to change them. Read this before adding a feature.

The code is split so that **a folder answers one question** and **a file has one job**. If you
are looking for something, find the folder that matches what the user sees or what the server
does; you should not need to read a 500-line file to find it.

## Guardrails

| Rule | Enforced by |
| --- | --- |
| No source file over 450 lines (tests and the generated `types` copies excepted) | `npm run check:size` in `client/` and `server/` |
| Code the client and server both use is edited once in `shared/` and copied by `node scripts/sync-shared.mjs` | `--check` inside both `npm test` scripts |
| One formatter (Prettier, 100 columns, LF) | `npm run format:check` |
| Stylesheets keep their order: a later rule wins at equal specificity | numeric file names in `client/src/styles/` |

`check:size` lists every file above the limit. If you need to go past it, split the file
instead of raising the limit.

## Server (`server/src`)

`index.ts` only starts things, in order: persistence, TTS playback, routes, sockets, Twitch, listen.

| Folder | What it owns |
| --- | --- |
| `config/` | Environment variables (`env.ts`) and canvas geometry constants |
| `runtime.ts` | The single `app`, HTTP server, Socket.IO server and the live user/overlay registries |
| `app.ts` | Mounts middleware and routes, in the order that matters |
| `auth/` | Twitch dashboard login, signed sessions, whitelist and roles. `secret.ts` is the one place the session secret is read, and it refuses to start a deployed server without one |
| `middleware/` | Auth checks and rate limits shared by routes |
| `socket/` | One file per realtime area: `elements`, `drawing`, `history`, `presence`, `settings`, `studio`; `validation*.ts` checks every payload |
| `realtime/` | Connection lifecycle and the activity feed |
| `state/` | In-memory canvas history and studio data |
| `db/` | LowDB studio data and PostgreSQL storage |
| `playback/` | What the overlay plays: media, fly-across, sounds, TTS |
| `triggers/` | Chat commands and Twitch events turned into actions (`dispatch` decides, `execute` does) |
| `twitch/` | Chat listener, event OAuth, EventSub webhooks |
| `chat/`, `seventv/` | Chat emote parsing and the 7TV emote provider |
| `library/`, `uploads/` | The shared media library and validated uploads |
| `features/` | Runtime feature flags |
| `startup/` | Boot steps that need `await` |
| `tts/` | See below |

### TTS pipeline (`server/src/tts`)

A prompt goes down this list; each stage only knows about the one before it. See
[TTS.md](TTS.md) for behaviour and tuning.

```text
interpreter/  plan the scenes (OpenAI), decode and validate the plan
scene/        detect accents and directives, build the planner prompt
casting/      pick a voice, gender and intensity for each line
audio/        ElevenLabs calls, timing, sound effects, render to a clip
dsp/          filters, dynamics, loudness, rooms: pure functions on samples
```

`service.ts` is the entry point the rest of the server uses; `store.ts` holds saved clips.

The **queue** has two tracks in `service.ts`, each a promise chain in submission order: *making*
(one clip at a time, ahead of time, even while TTS is paused) and *playing*. `queue.ts` (a pure
gate with an injectable clock) only decides when a *made* clip may play: not while paused, and not
sooner than the set silence after the last clip ended. Pausing must never *refuse* a request,
because viewers who spent points expect it to play later. Making stops when `MAX_READY_AHEAD` (5)
made clips are waiting, which bounds the credits spent on requests that are then removed. A job
has a `stage` (making, ready, playing), `waiting` while held, and a `message` saying why. Removing
one sets it `cancelled`, wakes the gate, and deletes the clip *generated for it* (never a replayed
saved clip); those deletions run one at a time to stay inside Discord's webhook rate limit. Paused
state and the gap are saved as the `tts_queue` row in `app_settings` and loaded at startup in
`startup/persistence.ts`, which fails closed (comes up paused if the row cannot be read). The queue
itself is in memory. `generate.ts` holds the paid part (OpenAI, ElevenLabs, Discord), and
`setTtsGenerator` lets tests stand in for it. The
owner's `tts` feature flag is a separate, harder switch: it stops the clip and clears the queue.

**Play on overlay** from the dashboard (a typed prompt or a saved clip) is `submit({direct: true})`:
it skips the pause and the silence gate and does not wait behind `makeChain`, but still only one
clip plays at a time, via a `playerBusy` lock (`takePlayer`/`freePlayer` in `service.ts`) shared with
the queued track, so it never cuts off a clip that is already playing. Only chat/reward/trigger
requests go through the queue's pause and silence.

The overlay's **TTS icon** (`components/tts-emote/TtsEmote.tsx`) moves a single element every frame
with `requestAnimationFrame`, not through React state. Its movement comes from
`support/ttsLevel.ts` (pure and tested): `levelAt` reads the clip's stored `peaks` at the playing audio's
`currentTime`. The overlay gets `peaks` and `duration` with `sound:play`, and `useSoundActions`'s
`getTtsLevel` finds the audio element. Do not try to analyse the audio live with Web Audio: the
store sends no CORS headers, so the analyser would only ever hear silence. `showEmote` and
`showPrompt` are part of the playback state and of the saved `tts_queue` settings.

### Remote control (`server/src/tts/remote*.ts`)

Lets something outside the dashboard — a Stream Deck button — control the dashboard over plain
HTTP. Started as TTS-only, hence still living under `tts/` and still answering at `/tts/remote`
(the URL never moves, so a button already configured against it keeps working); it now also
reaches the chat emote overlay, and the intent is for anything controllable from the dashboard to
eventually be reachable this way.

A token is `vkremote.<id>.<secret>`: `id` is a public lookup key (its own primary key in
`tts_remote_tokens`, Postgres or a local JSON fallback outside production), `secret` is checked
with `timingSafeEqual` against a stored SHA-256 hash, so only the hash is ever kept.
`remoteTokensRouter` (owner/admin, a dashboard session) issues and revokes tokens; the raw token is
returned once, at creation. Tokens are not scoped by area — one token reaches everything this
endpoint can do.

`remoteControlRouter` (`POST /tts/remote`, the token itself as a bearer header, no dashboard
session, its own rate limit) maps an `action` onto the same functions the dashboard itself uses:
TTS actions call the same functions the `/playback` route does, and share `persistTtsQueueSettings()`
(`queueSettings.ts`) with it so pausing from a remote survives a restart exactly like pausing from
the dashboard does; chat-emote actions call into `chat-emotes/control.ts` (see below), the same
functions the `chat-emote:settings` socket handler uses, so a remote change is saved and broadcast
identically to a dashboard change. Only TTS actions are refused while the owner's TTS switch is
off (`TTS_ACTIONS` in `remote.ts`) — an emote action still works regardless, since it's unrelated.
`GET /tts/remote` (same token, no body) returns the same state read-only, for a Stream Deck's
polling option, whose icon otherwise only updates on that button's own presses. Both verbs share
one `authenticate()` (token only, now that the TTS gate is per-action) so they can never drift
apart. The response always carries both TTS's own flat fields and a nested `emotes` object, so one
poll can drive several buttons' icons.

Two separate places a request becomes visible, for two separate audiences: `console.log` (every
POST, plus every rejected request from either verb) is for watching Render's own logs while
debugging a button's setup — `authenticate()` logs a rejection itself, by the token's public `id`
alone, never its secret. `remoteActivity.ts` (`describeRemoteAction` + `recordRemoteActivity`) is
for the streamer, in the dashboard's own Activity feed, with no server-log access needed:
`describeRemoteAction` turns an action and its outcome into one plain sentence ("skipped the TTS
clip", or, for a no-op, why — "tried to skip, but nothing was playing"), reading the *resulting*
state rather than just `changed` for a toggle, since "changed" alone can't say which way it went;
`recordRemoteActivity` then calls the same `recordActivity`/`studioState` (`state/studio.ts`) a
Studio edit does, naming the token instead of a signed-in user, and tagging the item
`source: "remote"` (`ActivityItem.source`, `shared/types.ts`) so the client can tell it apart from
an edit a signed-in user made. Only an authenticated request ever reaches the feed — a rejected one
(unknown token, say) is console-only, so a stranger poking at the endpoint can't fill 50 slots of a
capped feed with noise; `status` and the poll are excluded too, since `describeRemoteAction`
returns `undefined` for anything that changes nothing. The client filters `studio.activity` by that
tag in `StudioPanel.tsx` and passes the result into `TtsPanel`/`TtsRemoteTokens.tsx`, which renders
it below the tokens as an "Activity log" styled like a server console (dark, monospace, a blinking
cursor) — always on screen, not conditionally rendered only once there is something to show, so
testing a button feels like watching a log tail rather than waiting for a toast. It lives right
inside the Remote control dropdown, not just the general Activity feed sidebar, since that's where
the streamer is actually looking while testing a button.

### Chat emote overlay control (`server/src/chat-emotes/control.ts`)

One place applies a `ChatEmoteSettings` change, updates `canvasStore.chatEmoteSettings`, broadcasts
`chat-emote:settings` to every dashboard and overlay, and saves it (debounced 300ms, so dragging a
slider in the dashboard's Emotes tab saves once) — whether the change came from the dashboard's own
socket event (a full, validated settings object) or from a remote-control action (one field at a
time: on/off, flip direction, step size within 24–100, cycle through `CHAT_EMOTE_MOTIONS`). `io` is
taken as a parameter rather than imported, so the socket handler's existing tests can keep
injecting their own fake `io` and observing what it broadcasts.

## Client (`client/src`)

| Folder | What it owns |
| --- | --- |
| `views/` | Whole pages: `LoginPage`, `Overlay` (the OBS page) and `dashboard/` |
| `views/dashboard/` | The dashboard: `Dashboard.tsx` wires hooks together; `CanvasArea`, `DashboardTopbar`, `AccountMenu`, ... draw it |
| `components/` | Screens and dialogs. Big ones are folders (below) |
| `canvas/` | DOM-level canvas code with no React: transforms, handles, dragging, DVD motion, effects |
| `canvas/sync/` | Keeps the dashboard's layer nodes in step with the element list |
| `hooks/` | `useSocket` (folder `hooks/socket/`), auth, presence, Twitch state |
| `styles/` | All CSS, as numbered files (see below) |
| `config/`, `support/`, `audio/` | Small shared helpers |
| `types/` | Generated copy of `shared/types.ts`; do not edit |

### How the big components are built

Every large component follows the same shape, so you learn it once:

```text
components/toolbar/
  Toolbar.tsx          composes the pieces; almost no logic
  types.ts             props and the shared context type
  context.ts           the bag of state and actions the parts use
  useSomething.ts      one hook per concern (state, effects, actions)
  SomePart.tsx         one file per visible section
```

A hook takes what it needs and returns what others need; the component's own body only
composes them. Folders using this shape: `toolbar/`, `studio/`, `tts/`, `layers/`,
`canvas-stage/`, `overlay-stage/`, `drawing/`, `hooks/socket/`, `views/dashboard/`.

Two of them have a twist worth knowing:

- **`canvas-stage/` and `overlay-stage/`** mix React with hand-managed DOM nodes and
  `requestAnimationFrame` loops for speed. The React side owns refs and effects; the DOM code
  lives in plain functions (`canvas/sync/`, `overlay-stage/syncOverlayElements.ts`).
- **`drawing/`** is the paint layer: `floodFill.ts` and `renderStroke.ts` are pure canvas
  code shared with the OBS overlay; `drawingInput.ts` turns the mouse into strokes.

### Styles (`client/src/styles`)

`index.css` imports the files in order. **Order is behaviour**: reordering files changes which
rule wins. Add new rules to the file for that feature, or add a new numbered file at the point
in the order where it should apply.

## Adding things

- **A socket event**: add its types in `shared/types.ts`, run `node scripts/sync-shared.mjs`,
  validate it in `server/src/socket/validation*.ts`, handle it in the matching `socket/*.ts`
  file, and send it from `hooks/socket/useSocketActions.ts`.
- **A Studio tab or panel section**: a new `components/studio/` file, wired in `StudioPanel`.
- **A trigger action or event**: `triggers/execute.ts` (what it does) and `triggers/dispatch.ts`
  (when it fires); the form lives in `components/studio/`.
- **A chat-emote movement**: add its name to `CHAT_EMOTE_MOTIONS` in `shared/types.ts`, write a
  `ModeImpl` (spawn + step) in `client/src/components/chat-emotes/` and register it in
  `modeRegistry.ts`, then add it to the dropdown in `motionOptions.ts`.
- **A TTS voice rule**: `tts/casting/` (see `docs/TTS.md` for the tuning knobs).
- **A new thing TTS can do**: also add an example to `shared/ttsGuide.ts` (the public `/tts`
  cheat sheet), then run `node scripts/sync-shared.mjs`. `tts/guide.test.ts` fails if an example
  stops parsing or stops doing what its section says. Keep it free of provider names and settings.
- **A new page (any address)**: add it to the table in `client/src/views/routes.ts`. It matches
  exactly (a trailing slash is ignored), and any address not in the table shows the 404 page
  instead of the dashboard; `client/tests/routes.test.ts` covers it.
- **The tab title and icon**: every page renders `<TabIdentity title="…" />` (or, on the
  dashboard and overlay, `TileController`), which calls `useTabIdentity`. It sets the title and
  icon and adds `(LIVE)` and the live icon while a stream is on, checked in the background by
  `useLiveStatus`. A new page should use it too. `index.html` points at the plain icon so the tab
  is right before any script runs. Keep exactly one `<link rel="icon">` (the `#favicon` one the
  hook changes): a second would let the browser pick it instead and the live icon would never
  show. `client/public/favicon.ico` (16, 32 and 48 px, made from the same picture) exists only
  for tools that ask for `/favicon.ico` by convention; without it they get the app's HTML.
- **A public page**: `App.tsx` routes by path before anything that logs in, so a page like
  `/tts` renders without waiting for the server (its only request is the background live check).
  Do not import `useAuth` or `useSocket` into one. The
  public pages that need the server for their content, `/tts/clips` and `/tts/clips/<id>`, use
  `GET /tts/public/clips` and `GET /tts/public/clips/:id` (`server/src/tts/publicClips.ts`): they
  must stay behind the `publicClips` flag, return only fields picked one by one in
  `toPublicClip`, and stay rate-limited. The list has no audio; a row links to the clip's page.
  That page's player (`hooks/useClipPlayer.ts`, `views/tts-guide/ClipPlayer.tsx`) plays from
  `GET /tts/clips/:id/audio`, and the download button links to the same address. That route only
  redirects to the store (Discord's CDN), so the audio never passes through this server. Render
  bills outbound traffic and the free allowance is small, so **do not add a proxy that streams
  the audio through the server**: it multiplies the bandwidth by every page view. Nothing is
  fetched until Play is pressed (`preload="none"`), and `play()` runs straight from the click,
  which Safari requires. A proxy is tempting only for the waveform, because the store sends no
  CORS headers, so a page can play, seek and download the audio but cannot read its bytes. So the
  waveform is worked out on the server instead, once, when a clip is made
  (`server/src/tts/audio/peaks.ts`: 60 whole numbers from 0 to 100, stored in the clip's metadata
  as `peaks`), and only `GET /tts/public/clips/:id` returns it; lists and searches strip it
  (`metadata - 'peaks'`). Clips from before it existed get theirs from `npm run backfill:peaks` in
  `server/` (`-- --dry-run --limit=3` tries it without writing); until then the page draws a
  stand-in shape (`fallbackPeaks`). The drawing maths is in `support/waveform.ts` (tested); the
  bars are a CSS `mask-image` under one gradient, so playing moves a single CSS variable per
  frame. The volume is kept in `localStorage` as `tts_public_volume`. Public pages use the `tts-public`
  CSS prefix, since `tts-guide` already belongs to the dashboard's "How TTS prompts work" box.
- **How the public pages look**: a warm fox palette defined as `--tp-*` tokens at the top of
  `26-tts-public.css` (dark by default, cream for `prefers-color-scheme: light`), with one colour
  per cheat-sheet section. The top bar is sticky and spans the window, while what is in it
  shares the page column's width through the `--tp-column` token (960px, of which the visible
  content is 896 after the side padding). Keep `.tts-public` at `overflow-x: clip`: `hidden` makes
  it a scroll container and the bar silently stops sticking. The background glow
  (`.tts-public__glow`) is `position: absolute`, so it is as tall as the page and scrolls with it,
  with the warm glows at the column's top corners and the cool one centred behind the campfire;
  a `fixed` one would sit behind the sticky bar for good. Type is Fredoka (headings) and Nunito (text), bundled through
  Fontsource in `views/tts-guide/fonts.ts`, so visitors make no third-party font request. The
  emotes come from `client/src/assets`: register one in `views/tts-guide/emotes.ts` (an animated
  one names a still one to show for people who prefer reduced motion), then draw it with
  `<Emote name="…" size={…} />`, which is decorative unless you pass a `label`. Emotes are used
  as hero art, in the warning, the campfire footer and the clip list's states (loading, off,
  empty, error). They are deliberately not used inside badges, avatars or shortcut chips: each
  emote means something, so a section number and a colour do that job instead. Each section's
  colour is in `views/tts-guide/sectionStyle.ts`, not in the shared content. `vicksyClassic.gif`,
  `vicksySteppies.gif`, `vicksyGaCard-4x.gif` and `vicksyPounce.gif` are not shown anywhere at the moment
  (`vicksyTomfoolery-4x.png` is only the still stand-in for the dancing fox).
