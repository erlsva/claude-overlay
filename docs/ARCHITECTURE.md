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
| `auth/` | Twitch dashboard login, signed sessions, whitelist and roles |
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
- **A TTS voice rule**: `tts/casting/` (see `docs/TTS.md` for the tuning knobs).
