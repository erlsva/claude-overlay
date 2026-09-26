# Vicksy Stream Overlay

A private, collaborative stream-overlay controller for Vicksy and Wixels. The
dashboard lets approved users arrange media and drawings on a 1920×1080 OBS
browser source, operate effects, and connect Twitch chat or broadcaster events
to chained overlay actions in real time.

The editor is DOM-based. Media elements are positioned and transformed with
HTML, CSS, and native pointer events; freehand drawings use an HTML canvas.
Konva is not used by the current application code.

## What it does

- Synchronizes the dashboard and OBS overlay through Socket.IO.
- Adds images, GIFs, video, audio, text, and drawings to a large pan-and-zoom
  workspace containing a 1920×1080 stream viewport.
- Supports dragging, resizing, rotation, snapping, fit/fill placement,
  horizontal and vertical flips, grouping, duplication, visibility, locking,
  opacity, and undo/redo.
- Opens a setup guide and then a short welcome tour on each visit (tick "Don't
  show this again" to stop), and includes a complete controls guide,
  stream-readiness checks, persistent session notification history, and
  privacy-safe copyable support diagnostics.
- Animates media with adjustable DVD movement, corner celebrations, sound, and
  a shared corner-hit counter.
- Provides a Soundboard and chained commands for showing, hiding, playing, or
  flying media across the stream, playing sounds, refreshing OBS, starting DVD
  movement, and sending Twitch chat messages.
- Builds expressive TTS and sound-effect scenes with OpenAI, ElevenLabs, and
  FFmpeg, with private dashboard previews, OBS playback, reusable clip tokens,
  deletion, job feedback, and trigger-chain support.
- Listens anonymously to public Vicksy or Wixels chat commands through `tmi.js`.
- Displays Twitch and 7TV chat emotes as an ordered bottom parade or with one of
  sixteen movements (parade, bounces, rain, snow, balloons, orbit, fireworks,
  pile-up, conga line and more), with configurable physics, sender labels,
  limits, and a chatter blacklist.
- Plays one-shot Pop, Pulse, Spin, Shake, and directional slide animations on
  selected media.
- Receives authenticated Twitch follows, subscriptions, gift subscriptions,
  Bits, raids, custom channel-point redemptions, bans, timeouts, and new predictions
  through EventSub webhooks.
- Shows a live, silent **overlay preview** in the dashboard (top bar → Overlay →
  monitor icon). It runs the real overlay at `/overlay?mirror=1`, including chat
  emotes and the TTS notice, is muted at the browser level, and is never counted
  as an overlay or able to acknowledge sounds and media. Drag its header to move
  it, drag the corner to resize it, and double-click the header to reset it.
- Keeps a small **shared media library** (toolbar → Library) of default videos,
  images and sounds that survive restarts. Any moderator can add, use and delete
  files. Ordinary uploads stay temporary; only library files are stored in Neon.
  Files are validated by type and content, limited to 25 MB each and 300 MB in
  total, and are served from `/library/files/<id>`. Without `DATABASE_URL` a
  development server falls back to a folder under `DATA_DIR`; production
  requires Neon.
- Offers optional features behind owner-only **feature flags** (account menu):
  TTS Studio (on by default) and **Scenes**, which saves and restores whole
  layouts (off by default).
- Restricts dashboard access with Twitch login, an owner account, and a
  database-backed whitelist/admin role system.

## Project layout

```text
.
├── client/                 React, Vite, TypeScript, Socket.IO client
│   └── src/
│       ├── views/          Pages: login, the OBS overlay, and the dashboard (views/dashboard/)
│       ├── components/     Screens and dialogs; big ones are folders (toolbar/, studio/, tts/, ...)
│       ├── canvas/         DOM-level canvas code: transforms, handles, dragging, DVD motion
│       ├── hooks/          Sockets (hooks/socket/), authentication, presence, Twitch state
│       └── styles/         All CSS as numbered files; load order matters
├── server/                 Node.js, Express, Socket.IO, PostgreSQL, tmi.js
│   └── src/
│       ├── auth/           Twitch login, signed sessions, and authorization
│       ├── socket/         Realtime handlers (one file per area) and input validation
│       ├── playback/       What the overlay plays: media, fly-across, sounds, TTS
│       ├── triggers/       Chat commands and Twitch events turned into actions
│       ├── twitch/         Chat listener, Event OAuth, and EventSub webhooks
│       ├── tts/            Planning, casting, audio rendering, and clip storage
│       ├── db/, state/     LowDB and PostgreSQL storage; in-memory canvas history
│       └── library/, uploads/   Media library and validated uploads
├── shared/                 Types and constants both sides use (copied by scripts/sync-shared.mjs)
└── docs/                   ARCHITECTURE.md and TTS.md
```

How the code is organised, how to add a feature, and the file-size rules are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Runtime model and persistence

The application intentionally uses more than one kind of state:

| Data                                                   | Storage                                                                     | Survives a Render restart?                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------- |
| Broadcaster OAuth tokens                               | Neon PostgreSQL, encrypted with AES-256-GCM                                 | Yes                                             |
| Dashboard whitelist and admin roles                    | Neon PostgreSQL when `DATABASE_URL` is set                                  | Yes                                             |
| Elements, drawings, cursor presence, history, playback | Server memory                                                               | No                                              |
| Chat emote settings, feature flags (TTS, Scenes)       | Neon PostgreSQL, `app_settings` table                                       | Yes                                             |
| Soundboard, commands, scenes, presets                  | `DATA_DIR/db.json` through LowDB                                            | Only with a persistent disk                     |
| Uploaded media                                         | `UPLOAD_DIR`                                                                | Only with a persistent disk/object storage      |
| Shared media library (defaults)                        | Neon PostgreSQL, `media_library` table (up to 25 MB per file, 300 MB total) | Yes                                             |
| Saved TTS metadata                                     | Neon PostgreSQL (local JSON fallback outside production)                    | Yes in production                               |
| Saved TTS MP3 audio                                    | Discord webhook message attachments                                         | Yes while the webhook message remains available |

On Render's free tier, the filesystem is ephemeral. Neon keeps authorization
and whitelist records, but uploaded files and LowDB studio configuration can be
lost when the service is replaced or restarted. Do not treat `/tmp` as durable
storage.

`server/data/db.json` is committed to this (public) repository and is what the
soundboard, commands, scenes and presets fall back to after a restart, so edit
it there to change those defaults. It lists the dashboard whitelist and command
names in the clear, and must never hold a token or secret.

Feature flags are read from Neon when the server starts. If Neon is still waking
up, the read is retried a few times; if it still cannot confirm what was saved,
TTS starts switched **off** rather than guessing, and the owner can switch it
back on from the account menu.

## Local development

Node.js 22 or newer is required.

### Server

```bash
cd server
npm install
copy .env.example .env
npm run dev
```

The server listens on `http://localhost:3001` by default.

### Client

Create `client/.env`:

```dotenv
VITE_SERVER_URL=http://localhost:3001
```

Then start Vite:

```bash
cd client
npm install
npm run dev
```

Open:

- Dashboard: `http://localhost:5173/`
- OBS overlay: `http://localhost:5173/overlay`
- Loading-screen preview: `http://localhost:5173/?preview=loading`

## Server configuration

Copy `server/.env.example` to `server/.env`. Never commit the populated file.

| Variable                       | Required            | Purpose                                                                                                                                                        |
| ------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                         | Render supplies it  | HTTP and Socket.IO port; local default is `3001`.                                                                                                              |
| `CLIENT_URL`                   | Yes                 | Exact frontend origin, without a trailing path. Used by CORS and OAuth redirects.                                                                              |
| `PUBLIC_SERVER_URL`            | Production          | Public server origin. Falls back to Render's `RENDER_EXTERNAL_URL`.                                                                                            |
| `NODE_ENV`                     | Production          | Set to `production` on Render.                                                                                                                                 |
| `SESSION_SECRET`               | Yes                 | Signs dashboard sessions and Twitch Event OAuth state. A deployed server (`NODE_ENV=production`, or any Render service) will not start without it.             |
| `OWNER_TWITCH_USERNAME`        | Yes                 | Twitch login with owner privileges.                                                                                                                            |
| `TWITCH_CLIENT_ID`             | Yes                 | Twitch Developer Console application ID.                                                                                                                       |
| `TWITCH_CLIENT_SECRET`         | Yes                 | Twitch Developer Console application secret.                                                                                                                   |
| `TWITCH_REDIRECT_URI`          | Recommended         | Dashboard-login callback, ending in `/auth/callback`.                                                                                                          |
| `TWITCH_EVENTS_REDIRECT_URI`   | Recommended         | Broadcaster callback, ending in `/auth/events/callback`.                                                                                                       |
| `EVENT_CHANNELS`               | Yes                 | Comma-separated broadcaster logins; currently `vicksy,wixels`.                                                                                                 |
| `STREAMER_LOGINS`              | Optional            | Accounts shown with the purple Streamer badge (label only, no permissions). Defaults to `vicksy,wixels`; channels in `EVENT_CHANNELS` are always included.     |
| `CHAT_BOT_USERNAME`            | For chat messages   | Dedicated Twitch account used to send automated messages; defaults to `dankchapbot`.                                                                           |
| `DATABASE_URL`                 | Production          | Neon pooled PostgreSQL connection URL with TLS enabled.                                                                                                        |
| `TWITCH_TOKEN_ENCRYPTION_KEY`  | Yes for Events      | Base64-encoded 32-byte key used to encrypt stored broadcaster tokens.                                                                                          |
| `TWITCH_EVENTSUB_CALLBACK_URL` | Yes for Events      | Public HTTPS webhook URL ending in `/twitch/eventsub`.                                                                                                         |
| `TWITCH_EVENTSUB_SECRET`       | Yes for Events      | Independent random secret used to verify Twitch webhook signatures.                                                                                            |
| `DATA_DIR`                     | Optional            | LowDB directory; defaults to `server/data` locally.                                                                                                            |
| `UPLOAD_DIR`                   | Optional            | Media directory; defaults to `/tmp/obs-uploads`.                                                                                                               |
| `OPENAI_API_KEY`               | For TTS generation  | Interprets free-form TTS scene prompts into structured scenes.                                                                                                 |
| `OPENAI_MODEL`                 | Optional            | Structured-output model used by TTS; defaults to `gpt-4.1-mini`.                                                                                               |
| `ELEVENLABS_API_KEY`           | For TTS generation  | Generates speech and sound-effect audio.                                                                                                                       |
| `TTS_SHOUT_VOICES`             | Optional            | Comma-separated ElevenLabs voice names or IDs used for shouting and screaming, e.g. `Harry, Angry Pirate`. Without it the most intense-sounding voice is used. |
| `TTS_MUFFLE`                   | Optional            | How heavily a voice "behind a door" or "from outside" is muffled: `1` is the default (a thick door), `2` heavier still, `0.6` a thin wall, `off` skips it.     |
| `TTS_SCREAM_TONE`              | Optional            | Clean spectral shaping that makes shouted and screamed speech sound like a scream: `off` skips it, `1` is the default, `2` is double.                          |
| `TTS_SCREAM_STRAIN`            | Optional            | Off by default. `1` pushes shouted and screamed speech into a saturator (crunchy, walkie-talkie-like); `0.5` half, `2` double.                                 |
| `TTS_SCREAM_LAYER`             | Optional            | Off by default. `1` mixes a generated wordless scream under shouted lines (one extra sound-effect request each); `2` is louder.                                |
| `TTS_DEFAULT_VOICE`            | Optional            | Voice name or ID for characters that nothing else matches.                                                                                                     |
| `TTS_ROBOT_AMOUNT`             | Optional            | Strength of the ring-modulated "robot voice" effect: `1` is the default, `2` is double, `off` skips it.                                                        |
| `TTS_UNDERWATER_AMOUNT`        | Optional            | Strength of the "underwater voice" low-pass and pitch wobble: `1` is the default, `2` is double, `off` skips it.                                               |
| `DISCORD_TTS_WEBHOOK_URL`      | For TTS save/replay | Private webhook whose message attachments hold saved MP3 clips.                                                                                                |
| `FFMPEG_PATH`                  | Optional            | Explicit FFmpeg executable; otherwise `ffmpeg` must be available on `PATH`.                                                                                    |

Generate independent secrets with Node.js:

```bash
# SESSION_SECRET or TWITCH_EVENTSUB_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# TWITCH_TOKEN_ENCRYPTION_KEY (must remain stable or stored tokens cannot decrypt)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Changing `TWITCH_TOKEN_ENCRYPTION_KEY` invalidates existing encrypted Twitch
authorizations. Each broadcaster must reconnect after that key changes.

## Twitch application setup

Register all callback URLs exactly in the same Twitch Developer Console
application used by the server:

```text
http://localhost:3001/auth/callback
http://localhost:3001/auth/events/callback
https://<server-host>/auth/callback
https://<server-host>/auth/events/callback
```

The production server variables must contain the exact same URLs. Twitch
rejects differences in protocol, hostname, port, path, or trailing slash.

### Dashboard login vs. broadcaster Events

These are separate OAuth flows:

1. **Dashboard login** identifies an approved controller. The owner always has
   access; everyone else must exist in the whitelist.
2. **Events connections** are completed once by the Vicksy and Wixels
   broadcaster accounts. They grant only the read permissions needed for
   broadcaster events. The broadcaster is asked for them as part of signing in:
   after a normal login, if the account is one of the configured event channels
   and has not granted every permission (or a new one was added since), she is
   sent straight to Twitch's permission screen once and then lands on the
   dashboard. Other accounts are never asked. **Studio → Automations →
   Connections** still works for reconnecting by hand.
3. **Chatbot connection** is completed once by the dedicated DankChapBot
   account. It grants `user:write:chat`; configured messages use this account as
   the sender and never use a broadcaster token to write chat.

All access and refresh tokens are encrypted before being stored in PostgreSQL
and are refreshed automatically.

### Roles

Roles are labels shown next to names; they do not add new permissions.

| Role            | Who                                                                        | Notes                                                                                                                  |
| --------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Owner           | `OWNER_TWITCH_USERNAME`                                                    | Also controls feature flags, the chatbot connection and who is a super moderator.                                      |
| Streamer        | Logins in `STREAMER_LOGINS` (default `vicksy,wixels`) and `EVENT_CHANNELS` | The channel accounts the overlay is for. Label only, so it is the same in development. Shown next to the access level. |
| Super moderator | Whitelisted user with the admin flag                                       | Can add and remove moderators. Only the owner can make or remove a super moderator.                                    |
| Moderator       | Any other whitelisted user                                                 | Full dashboard access except managing the whitelist.                                                                   |

A person can hold more than one label. A streamer is also a moderator, and the
owner can star them as a super moderator too, so they show both badges.

The **Setup guide** opens on its own at the start of each visit, followed by the
welcome tour (tick **Don't show this again** in the tour to stop both from
opening; they stay in the account menu and the help guide). It has separate "I'm
the streamer" and "I'm a moderator" tabs. The streamer tab shows the overlay URL,
the browser-source size, the OBS settings to use and a **Play test chime**
button; the Go-live check has the same test as **Test overlay audio**. It
confirms the overlay page produced sound; watch the source's meter in OBS to
confirm the audio reaches the stream.

## TTS Scene Studio

For prompt syntax, timing rules, speech-speed controls, storage, playback, and
failure behavior, see the complete [TTS Scene Studio guide](docs/TTS.md).

Studio → TTS turns expressive prompts into reusable overlay audio:

1. Plain text is spoken dialogue. Inside `((...))`, quoted text is speech and
   unquoted descriptions are generated as sound effects. Plain sections and
   directed blocks can be mixed, and every section plays in sequence.
   Use `((silence;2s))`, `((pause, 2 sec))`, or `((silent pause 2 seconds))`
   for an exact 0.5–30 second
   sound-effect pause. Without a duration, a pause defaults to one second and
   is created locally without spending sound-generation credits.
   Speed can be written naturally on a spoken line (`slowly`, `very quickly`,
   `half speed`) or set precisely with `speed=0.85x` inside a directed scene,
   for speech and for sound effects alike. Supported rates are 0.5×–2× (pitch is
   kept) and are baked into the saved clip.
2. **Review plan** shows the interpreted voices, sounds, effects, and timing
   before ElevenLabs credits are spent.
3. **Generate & save** stores a 128 kbps MP3 and returns a `(TTS:<id>)` token.
   The intermediate WAV and temporary mix files are deleted after each job.
4. Paste that token into Studio or a command/event action to replay the exact
   clip without running OpenAI or ElevenLabs again.
5. Dashboard preview audio stays local to the controller. **Play**, **Pause**,
   **Resume**, and **Stop OBS** affect the connected overlay browser source.
   The on/off control blocks new paid playback before generation begins. New
   TTS playback defaults to 25% volume.
6. Finished speech is loudness-normalized with true-peak protection. Standalone
   effects use a quieter target and additional peak headroom. OBS shows an
   animated now-playing/paused TTS notice while a clip is active.

If OpenAI times out, returns a transient HTTP error, or produces malformed
structured output, the server uses the deterministic local parser rather than
discarding the alert or automatically spending money on a second model call.
Invalid user syntax still fails with a precise message. TTS trigger actions can
optionally send a chatbot message to the viewer when generation or OBS playback
fails.

TTS metadata is indexed in Neon. The current compatibility storage adapter
keeps MP3s as attachments on private Discord webhook messages and resolves a
fresh signed attachment URL when OBS plays one. Deleting a clip removes both
the webhook message and its metadata. [Discord attachment URLs are signed and
expire](https://docs.discord.com/developers/reference#signed-attachment-cdn-urls),
so never save a returned CDN URL as the clip identity.

For a larger or public-facing clip library, replace the Discord adapter with
dedicated [S3-compatible object storage such as Cloudflare
R2](https://developers.cloudflare.com/r2/how-r2-works/). The `/tts/clips` API
and database metadata already provide a clean boundary for that migration.
Dynamic chat-command TTS can spend provider credits; restrict it to trusted
roles, use a cooldown, and prefer saved tokens for repeated effects.

Public chat commands and emotes do not require broadcaster authorization. The
anonymous listener follows the dashboard's active Vicksy/Wixels preview.

## OBS setup

Add a **Browser Source** in OBS with:

- URL: `https://<frontend-host>/overlay`
- Width: `1920`
- Height: `1080`
- Custom CSS: none required
- Control audio via OBS: enable if OBS should route/monitor overlay audio
- Refresh browser when scene becomes active: optional fallback
- Shutdown source when not visible: usually leave disabled if state and media
  should remain loaded between scene switches

The overlay URL is view-only but exposes whatever is currently being rendered.
Treat it as unlisted rather than as an administrative secret. Dashboard actions
remain protected by Twitch login and server-side authorization.

## Controls and shortcuts

The in-app **?** guide is the canonical quick reference. The current workspace
controls are:

| Input                               | Action                                                          |
| ----------------------------------- | --------------------------------------------------------------- |
| Left-drag an element                | Move it; selected grouped elements move together                |
| Alt + drag                          | Temporarily disable edge and center snapping                    |
| Drag a resize handle                | Resize from that edge or corner                                 |
| Drag the round handle               | Rotate around the element center; hold Shift for 15° increments |
| Shift/Ctrl/Cmd + click              | Add or remove an element from the selection                     |
| Drag empty background               | Marquee-select multiple elements                                |
| Middle-mouse drag                   | Pan the workspace, including over the Twitch preview            |
| Mouse wheel                         | Zoom toward or away from the pointer                            |
| Double-click text                   | Edit the text element                                           |
| Ctrl/Cmd + Enter in the text editor | Save the text layer                                             |
| Escape in the text editor           | Close without saving                                            |
| Delete / Backspace                  | Delete selected unlocked elements                               |
| Ctrl/Cmd + Z                        | Undo the latest shared canvas change                            |
| Ctrl/Cmd + Shift + Z                | Redo the latest undone change                                   |
| Ctrl/Cmd + Y                        | Redo on Windows                                                 |
| Ctrl/Cmd + C / V                    | Copy and paste selected elements                                |
| Shift while drawing a line/arrow    | Snap the shape to 45° angles                                    |
| Shift while drawing a box/oval      | Constrain it to a square/circle                                 |

Dashboard buttons use labels or icons with explanatory tooltips. Keep this
section and `HelpGuide.tsx` synchronized when adding a gesture or shortcut.

Before a stream, use **Go-live check** in the top bar to verify the realtime
server, connected OBS browser sources, selected chat listener, broadcaster
Events authorization, saved command targets, and visible layer placement. OBS
Browser Source dimensions cannot be detected remotely and still need to be
confirmed as 1920×1080 in OBS.

## Deploying on Render

### Server web service

```text
Root Directory: server
Build Command: npm install --include=dev && npm run build
Start Command: npm start
```

`--include=dev` is necessary because TypeScript and declaration packages are
development dependencies but are required during the production build.

Add all server environment variables in Render. Use the pooled Neon URL for
`DATABASE_URL`, retain its TLS options, and never expose database credentials or
Twitch secrets in client-side `VITE_*` variables.

### Client static site

```text
Root Directory: client
Build Command: npm install --include=dev && npm run build
Publish Directory: dist
```

Set:

```dotenv
VITE_SERVER_URL=https://<server-host>
```

Render invalidates the static-site CDN on successful deployments, and Vite
generates fingerprinted asset filenames. OBS can still be refreshed manually
from the dashboard if a long-running browser source remains on an old page.

## Verification

Before deploying:

```bash
cd client
npm run build
npm test
npm run check:size

cd ../server
npm test
npm run check:size
npm audit --omit=dev
```

After deploying:

1. Confirm the server starts and reports that PostgreSQL stores initialized.
2. Log into the dashboard with an approved Twitch account.
3. Open `/overlay` in OBS or a browser and verify the overlay status is online.
4. Connect Vicksy and Wixels in **Studio → Automations → Connections**.
5. Run a simulated event, then verify one real Twitch event.
6. Confirm an anonymous chat command follows the selected preview channel.
7. If TTS is configured, review a plan, generate a short clip, preview it on
   the dashboard, play/stop it in OBS, then replay its saved token.
8. Test uploaded media after a restart if durable file storage is configured.

## Security notes

- Dashboard mutations are authenticated and sensitive management routes enforce
  owner/admin permissions on the server. Sessions are re-checked against the
  whitelist on every request, so removing someone locks them out at once even
  though their signed token lasts 7 days.
- The session secret has no built-in fallback on a deployed server. Because this
  repository is public, a default value would let anyone forge an owner session.
- The sign-in token is returned in the URL fragment (`#token=`), which browsers
  never send to a server, and the dashboard removes it from the address bar.
- Twitch EventSub messages are checked with HMAC signatures, timestamp limits,
  and message-ID deduplication.
- Broadcaster tokens are encrypted at rest; encryption keys and OAuth secrets
  stay server-side.
- Uploaded files are size-limited and checked by allowed type and file
  signature. Do not weaken these checks to support arbitrary URLs.
- TTS generation is rate-limited and queued, but dynamic public chat-command
  prompts can still spend provider credits. Restrict them to trusted roles and
  use cooldowns; saved TTS tokens replay without generation cost.
- Myinstants page-link resolution is best-effort because Myinstants may reject
  requests from hosting-provider IPs. Downloading the MP3 and uploading it is
  the reliable fallback.
- Keep dependencies patched, rotate exposed secrets immediately, and avoid
  logging tokens, database URLs, session values, or deploy hooks.

## Known operational limitations

- This is a private Vicksy/Wixels overlay, not a general multi-tenant service.
- The overlay page needs no login, so anyone who knows its URL can open it. A
  stranger's browser tab would show as an "Overlay Online" connection, but it
  can never change anything on the canvas.
- The free Render filesystem does not provide durable media or LowDB storage.
- Canvas state is intentionally runtime state and resets when the server does.
- The Twitch embed is cross-origin and sensitive to pointer-blocking layers;
  editor interaction uses a shield only while dashboard gestures require it.
- Myinstants can return HTTP 403 to server-side resolution requests.
- Saved TTS audio currently depends on private Discord webhook messages. Keep
  the webhook secret, and move the storage adapter to dedicated object storage
  before treating the clip library as a large or public archive.

## License and content

No license is currently declared. Twitch emotes, 7TV emotes, uploaded media,
sound effects, and included character artwork remain subject to their respective
owners' permissions and terms.
