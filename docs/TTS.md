# TTS Scene Studio

TTS Scene Studio turns a prompt into one or more ordered audio scenes. A scene
can contain speech, a generated sound effect, background sound, silence, or a
combination of speech and background sound. Finished clips can play through the
overlay and are saved with a reusable token.

A short, public version for viewers lives at `/tts` on the dashboard site (no login),
with a searchable list of saved clips at `/tts/clips`, and a page for each clip at
`/tts/clips/<id>` with a player (seek bar, volume, download), once the owner switches on
**Public clip list**. The cheat sheet's content is `shared/ttsGuide.ts`; keep it in
step with this guide when a feature is added, since a test checks that its examples
still work.

## Quick start

1. Write a prompt in **Scene prompt or saved token**.
2. (**Review plan**, which inspected voices, dialogue, effects, speed, and timing
   without spending ElevenLabs generation credits, is switched off for now.)
3. Select **Generate & save** to create and archive the clip, or **Play on overlay**
   to create, archive, and immediately play it.
4. Reuse the resulting `(TTS:<id>)` token to play exactly the same audio later
   without generating it again.

Dashboard previews play only in the dashboard browser. Overlay playback is sent to
the connected overlay browser source. The overlay volume defaults to 25% and can be
changed while a clip is playing.

## Pausing TTS and the queue

Requests (from chat, rewards or the dashboard) go through one queue with two tracks:
requests are **made** one at a time, ahead of time, and **played** in the order they came
in. **Pause TTS** at the top of the TTS panel holds the playing; it never refuses a request.

- While TTS is paused, requests are still accepted and are still made in the
  background, so they play the moment you resume. Nothing plays. A clip that is already
  playing finishes on its own.
- Making runs ahead of playing even when TTS is running, so the next clip is usually
  ready before the current one ends. At most **5** made clips wait for their turn; further
  requests wait un-made until there is room. That keeps a flood of requests while paused
  from spending credits on more than about five clips you might then remove.
- **Resume TTS** plays the waiting requests in order and lets new ones play as they
  come. **Play next** (shown while paused) plays exactly one waiting request and
  holds again.
- **Play on overlay** in the dashboard (for a typed prompt or a saved clip) is you asking
  for it by hand, so it ignores the silence and goes ahead of the requests waiting in the
  queue (which stay waiting), and a saved clip's replay is never held up by other clips
  being made. It still will not play while TTS is paused, the same as everything else —
  pausing holds it too, by hand or not — and it never cuts off a clip that is already
  playing. Its controls (Skip, Pause clip, From start) work like any other clip's.
- The **Waiting** list shows who asked for what, in order, and whether each is
  waiting, being made, or ready. Take one out with its X, or use **Clear all**. Removing
  a request that was already made deletes the clip that was made for it, so it does not
  stay in the saved clips or on the public clip page. Removing a replay of a saved
  `(TTS:…)` token never deletes that saved clip.
- **Silence between clips**: at least this many seconds pass between one clip ending
  and the next one starting (default 7, from 0 to 30). Play next and Play on overlay ignore it, and the
  first clip after a quiet spell plays at once.
- The controls are always visible. The dashboard's **top bar**, on every tab, shows the
  TTS status (green while running, amber while paused) with **Pause TTS / Resume TTS**,
  **Skip** and **From start**. The panel shows the same clip controls (and **Pause clip**),
  greyed out while nothing is playing.
- **Skip** cuts off the clip that is playing and moves on to the next request (after
  the silence). **Pause clip / Resume clip** pause and continue that one clip
  part-way through, which is separate from pausing TTS. **Play from start** plays the
  clip that is on the overlay again from the beginning, whether it is playing or paused
  part-way (for when you paused mid-sentence and want the whole thing). It also gives the
  clip its full time again, so it is not cut short.
- Up to 100 requests can be queued or being made at once; after that new requests
  fail with "The TTS queue is full".
- **The overlay** shows two optional things while TTS is on, each with a switch in the panel (both on
  by default, both saved): the **prompt card** at the bottom centre, with who asked and what
  was said, and a small **icon** at the bottom left. The icon is in colour while TTS is
  running and grey and dimmed while it is paused, and it moves with the audio: it bounces and
  shakes on loud parts (words, or a sound effect) and settles in the pauses. That movement
  is worked out from each clip's stored waveform and where its audio has got to, since the
  audio's own host does not let a page analyse it live. Hiding the prompt card does not hide
  the icon, and the other way round. The icon is the `vicksyW` picture for now; swap the one
  import in `client/src/components/tts-emote/TtsEmote.tsx` to change it.
- Whether TTS is paused, the silence, and the two overlay switches are saved, so a server
  restart keeps them.
  If the saved setting cannot be read at startup, TTS starts **paused** rather than
  guessing. The waiting requests themselves are held in memory, so a restart loses
  them (a clip that was already made stays saved, but is not played).
- The owner's **TTS Studio** switch in the account menu is different: it turns TTS
  off for everyone, refuses new requests, and clears the queue.

## Remote control (Stream Deck, or anything else)

The TTS panel's **Remote control** section (owner/admin only, near the top of the panel) issues
named tokens for controlling the dashboard from outside it — a Stream Deck button, or any other
tool that can send an HTTP request. It started as TTS-only (hence the URL below), and now also
reaches the chat emote overlay; a token is not limited to one area, so the same token covers both.

- **Create a token**, give it a name (which device or person it is for), and its full value is
  shown once. Copy it somewhere safe: it is never shown again, and only its hash is kept, so a
  copy of the database cannot be turned back into a working token. **Revoke** it at any time to
  stop it working at once; a Stream Deck button using it will then need a new one.
- Send it as `Authorization: Bearer <token>` (never in the URL) with `POST /tts/remote` and a
  JSON body `{"action": "…"}`. With the Elgato Stream Deck app, a plugin such as **"StreamDeck
  API Request"** does this in one button: set the method to POST, add that header, and paste
  the body. That particular plugin's "JSON Path" for reading a field back out of the response is
  a plain field name (e.g. `held`), **not** real JSONPath — it does not understand a leading `$.`.
- **TTS actions**: `pause-tts`, `resume-tts`, `toggle-tts` (the same as the dashboard's
  Pause/Resume TTS); `play-next`; `pause-clip`, `resume-clip`, `toggle-clip`, `skip`, `restart`
  (the same as the clip controls); `volume` (needs `"value"`, 0 to 1), `volume-up`,
  `volume-down` (±10%). Refused with a 503 while TTS is switched off entirely (the owner's TTS
  Studio switch), same as the dashboard.
- **Chat emote overlay actions**: `emotes-on`, `emotes-off`, `toggle-emotes` (the same as the
  Emotes tab's on/off switch); `toggle-emote-direction` (left ⇄ right); `emote-size-up`,
  `emote-size-down` (steps of 5, within the 24–100 range); `emote-style-next`,
  `emote-style-previous` (cycles through the motion styles — floor, parade, fireworks, rain,
  orbit, and so on — wrapping at either end). These are never blocked by the TTS switch.
- `status` changes nothing and just reads. Every response — including from an action that
  changes something — carries the *full* current state: TTS's own fields flat at the top level
  (`held`, `waiting`, `active`, `paused`, `volume`, `gapSeconds`, `changed`, …) and the chat
  emote overlay's under `emotes` (`emotes.enabled`, `emotes.direction`, `emotes.size`,
  `emotes.motion`), so the plugin's "set button image from a response field" can react to any of
  them directly, on any button, regardless of which action that particular button sends.
- `GET /tts/remote` (same token, same URL, no body) reads the same state as `status`, for a
  button's **"periodically poll a URL for status"** option — a plain POST button's icon only
  updates when it is pressed, so this is how the icon can instead follow what changed elsewhere
  (the dashboard, another button, or a viewer's chat message toggling nothing but still worth
  polling for) without needing a press of its own. Point the poll URL at the same `/tts/remote`,
  method GET, and match on whichever field that button's icon should follow, the same way as the
  main request.
- Requests to `/tts/remote` are rate-limited (shared across every action and the poll).
- A button press shows up right in the **Remote control** dropdown itself, below the tokens, in
  an **Activity log** styled like a server console — always there, not just something that pops
  up once a button is pressed — so you can see a button actually reached the server and what it
  did, live, while you're testing it, with no server-log access needed ("Office Stream Deck
  skipped the TTS clip", named after the token). A no-op still shows up, with why ("tried to
  skip, but nothing was playing"); a rejected request (unknown token, TTS switched off, …) does
  not, since it did not come from a token that is really yours, and `status`/the poll never do,
  since they change nothing. The same line also lands in the dashboard's general Activity feed
  (bottom-left), since it's the same underlying mechanism a Studio edit uses. Rejections are still
  logged to the
  server's own console, for deeper debugging.

## Prompt syntax

Plain text is spoken as ordinary dialogue:

```text
Welcome to the stream!
```

Use `((...))` to describe a directed scene. Text inside quotes is spoken;
unquoted text describes the character, performance, room, or sound effect.

```text
((angry pirate screaming: "VICKSY! I HAVE ARRIVED!" in a cave;8s))
```

An unquoted block is a generated sound effect:

```text
((gigantic fart in a cathedral;5s))
```

Plain speech and directed scenes can be combined. They play from left to right:

```text
This is a test. ((silence;1.5s)) ((man shouting: "NOW!")) ((lightning;3s))
```

Use at most ten ordered sections in one prompt.

## Duration and effects

Put a duration at the end of a directed scene, such as `;8s`. It describes the
complete scene, including the source audio and any echo or reverb decay. It is
not additional tail time. Without a room or echo to fill the rest with, a
duration longer than the line takes to say is not padded with silence — it
just plays at its natural length, the same as leaving the duration off.

```text
((thunder in a cave;6s))
```

Supported room/effect directions include:

- **Reverb** (a room): `in a cave`, `in a church`, `in a cathedral`, `indoors`,
  `in a small room` or just `reverb`. A cathedral or church is a long, wide, bright
  room with about a five-second decay, indoors is a small close room, and a cave
  and plain reverb are a general, darker room.
- **Echo**: `with echo` or just `echo`. Speech repeats its last word. A sound
  effect has no last word, and repeating the whole sound just sounds like it is
  layered on top of itself, so its echo is a long, smooth tail that fades away.
- **Both together**: say both, such as `Reverb Echo` or `in a cave with echo`. Speech
  gets the repeated last word inside the room; a sound effect gets a longer, fuller
  tail. Putting something `down a well` means both, in a narrow, hollow room.
- `through an intercom`, `telephone`, or `megaphone`
- A walkie-talkie, tin can or old radio is its own separate sound, not the
  same as an intercom — see
  [Funny voice and sound effects](#funny-voice-and-sound-effects)
- `distant` or `far away`

Effects can also be listed after a comma or semicolon, so these all work:

```text
((Loud long lasting fart,Reverb;6s))
((Huge fart,Echo;4s))
((Huge fart from down a well,Echo;4s))
((Multiple loud farts,Reverb Echo;6s))
((Extreme fart sound,Indoor;6s))
```

Words like `huge`, `gigantic` and `extreme` make the effect stronger. The room and
the echo are added by the overlay, never by the sound model, so wording about them
is removed from what is sent to ElevenLabs.

Speech is never cut merely to force it into an unrealistically short duration.
Automatic fitting to a written duration is capped at 1.25× (a speed you write
yourself, up to 2×, is always honoured). When the performance still needs longer,
the complete speech is retained and the job reports a useful duration warning.

## Speed

Speed is authored per scene and becomes part of the saved audio. It changes the
pace only, never the pitch (for a tape-at-the-wrong-speed sound that changes both,
see [slow motion and chipmunk](#funny-voice-and-sound-effects)). The range is
**0.5× (half speed) to 2× (double speed)**.

Natural directions work on a spoken line:

```text
((pirate slowly says "Wait for me";8s))
((pirate very quickly shouts "Run!";8s))
((pirate incredibly slowly says "Wait for me"))
((announcer at double speed says "Final round"))
```

| Wording                                                   | Speed |
| --------------------------------------------------------- | ----- |
| `incredibly slowly`, `painfully slowly`, `half speed`     | 0.5×  |
| `very slowly`, `much slower`                              | 0.75× |
| `slowly`, `slower`                                        | 0.9×  |
| `quickly`, `faster`, `fast`                               | 1.1×  |
| `very quickly`, `much faster`                             | 1.25× |
| `insanely fast`, `ridiculously quickly`, `extremely fast` | 1.75× |
| `double speed`                                            | 2×    |

For exact control, use `speed=<rate>x` (or `rate=`) between 0.5× and 2×. Anything
outside that range is rejected with a message, and no audio is generated:

```text
((pirate says "Wait for me";speed=0.8x;8s))
((announcer says "Final round";speed=1.15x))
((robot says "Please stand by";speed=0.5x))
((auctioneer shouts "Going once, going twice";speed=1.75x))
```

### Speed on sound effects

A sound effect takes the same `speed=` directive:

```text
((rumbling thunder in a cave;speed=0.5x;6s))
((a gunshot;speed=2x))
```

The sound is time-stretched after it is generated, so its pitch stays the same.
Everyday words are **not** read as a speed in a sound description, because there
they describe the sound (`a slowly creaking door` is sent to the sound model as
written); write `speed=` when you want the clip itself slowed or sped up.

- **With a duration** (`;6s`), the duration is still the length of the finished
  scene. The sound model is asked for the length that ends up there (half a
  second's worth per second at half speed), so `speed=0.5x;6s` is six seconds of
  slowed sound with room left for its echo or reverb.
- **Without a duration**, the clip simply comes out longer (slower) or shorter
  (faster) than it would at normal speed.
- The sound model cannot make more than 30 seconds, so a very fast sound with a
  long duration can end up shorter than written.
- In a scene that also has speech, the speed belongs to the speech and the
  background sound is left as it is.

## Shouting and screaming

Say it in the prompt and the scene is delivered that way:

```text
((man yelling in a cave: "I CAN'T HOLD IT IN"))
((pirate screams: "NARU WAKE THE FUCK UP"))
```

- **yell, shout, bellow, roar, loudly** give a shout.
- **scream, shriek, screech, top of his lungs** give a scream.

Only your own words decide this. The scene then gets one short audio tag
(`[shouts]` or `[screaming]`), capital letters, and ElevenLabs' most
expressive stability setting. Nothing else is added to your words.

A voice model on its own only sounds like someone politely raising their voice:
measured against a real scream, a tagged line is no rougher than plain speech, and
no wording of the text changes that. What a scream has is roughness, so a shouted
or screamed line is shaped for it:

- **Scream tone (on by default):** measured on a real recording of one person
  speaking and then screaming, the spectrum shifts consistently: chest and low-mid
  energy falls away, the 500-2000 Hz body comes forward, and almost nothing is left
  above 4-5 kHz. That is why a real scream sounds clear rather than bright. A
  shouted or screamed line is given that shape, cleanly, with no distortion (a
  yell and a scream alike). `TTS_SCREAM_TONE` scales it: `off` skips it, `1`
  is the default, `2` is double.
- **Strain (off by default):** the voice is pushed hard into a saturator and
  compressed. It matches a real scream on paper but sounds crunchy and harsh, and it
  cannot make a calm voice scream, so it is off. It is close to the sound of a
  scream through a walkie-talkie. Set `TTS_SCREAM_STRAIN=1` to enable it (`0.5`
  half, `2` double).
- **Scream layer (off by default):** a wordless scream or roar from the sound-effects
  model, mixed in only while the voice is speaking. It reads as a second person
  screaming behind the voice, so it is off. Set `TTS_SCREAM_LAYER=1` to try it; it
  costs one extra sound-effect request per shouted line.

**The voice matters more than anything else.** ElevenLabs audio tags only work
if the voice was trained for that range; a calm narrator will not scream, no
matter what the prompt says. Two things decide who screams:

1. A voice **created in your ElevenLabs account** is reserved for its own
   character. A request that mentions a pirate uses "Angry Pirate", a troll or
   ogre uses "Troll / Ogre". To add another character, create a voice named after
   it in ElevenLabs (for example "Grumpy Gnome"); no code change is needed.
2. Everyone else who shouts or screams is given the most intense-sounding voice
   in the account. Set `TTS_SHOUT_VOICES` (comma-separated names or IDs, for
   example `Harry, Angry Pirate`) to choose exactly which voices are used, and
   `TTS_DEFAULT_VOICE` for characters nothing else matches.

Your custom character voices are never used for anyone else, so plain speech or
a generic "man" is not voiced by the troll.

For a real scream, the strongest tool is a voice that can do it. In ElevenLabs,
Voice Design lets you describe one ("aggressive man screaming in terror"), and
you can also write a scream as a sound effect, which never needs a voice:

```text
((man screaming in terror;3s))
```

## Repeating a line

"over and over" gives four varied, escalating repetitions (three when the scene
is 10 seconds or shorter). Give a number to be exact:

```text
((schizo man saying "WHERE IS FORSEN?" three times))
```

If you do not write a duration the scene takes as long as its audio needs. A
duration is only ever the one you wrote.

## Sound effects

A block with no quoted words is a generated sound effect. Describe the source,
not the room or the length: those are applied by the overlay.

```text
((foxes screaming;10s))
```

- Length words ("for 10 seconds"), rooms ("echoing") and stray adjectives like
  "high-pitched" that you did not write are removed from what is sent to
  ElevenLabs, because the sound model follows its prompt literally.
- Animals it often gets wrong (foxes, wolves, cats, dogs, goats, crows, seagulls,
  pigs, monkeys, bears, big cats) get a short description of how they really
  sound. To fix another one, add a row to the table in `server/src/tts/sound.ts`.
- Generated effects are softened slightly in the sharp 3-8 kHz range, which is
  what makes shrieks and screams painful at volume. Sharp sounds (screams, shrieks,
  animal cries, whistles, alarms) are darkened and compressed much harder.
- A **comfort limiter** then pulls down any moment that jumps out of a clip's
  normal loudness: at most 3 LU above typical for sharp effects, 5 LU for other
  effects. It is measured the way ears hear it, so short stabbing spikes are
  caught even when the average level is fine.
- Oversized sounds (`gigantic`, `enormous`, `colossal`, `huge`, `massive`) are
  described that way to the sound model, slowed down so they are deeper and longer,
  and given a stronger effect.

## Accents and characters

Name the accent in the character and it is applied: `angry welshman`, `sad french man`,
`scottish pirate`, `posh british woman`. The engine adds a `[strong Welsh accent]` style tag to the
line itself (v3 understands these), and a voice whose ElevenLabs accent label already matches is
preferred. Accents work best on expressive voices; a very flat narrator voice only hints at them.

`welshman` and `frenchman` also tell the engine the speaker is male. A character that names no
gender still gets a sensible one: demons, devils, trolls, ogres and monsters get a male voice
(say `demon woman` for a female one).

## Behind a door

Say where the voice is and it sounds like it. `behind a door`, `through a wall`,
`from outside`, `from another room`, `from the other side of the door` or just
`muffled` take the highs out of the voice, leave a dull, boxy body, and make it a
little quieter than a voice in the room while keeping it clear enough to understand.

```text
((door knock)) ((man yells from outside: "OPEN THE DOOR")) ((door knock)) ((man yells from outside: "VICKSY! OPEN THE DOOR"))
```

It works on sound effects too (`((music from another room))`). The wording is applied
by the overlay and is never sent to ElevenLabs. `TTS_MUFFLE` sets how heavy it is:
`1` is the default (a thick door), `2` is heavier still, `0.6` a thin wall, and `off` skips it.

## Funny voice and sound effects

Say the word and the voice or sound gets a deliberate, funny transformation. Each
one works on both speech and a generated sound effect, and combines with a room or
channel: an underwater voice can still be in a cave.

```text
((chipmunk voice says "Where did everybody go?"))
((slow motion voice says "Nooooo"))
((robot voice says "Systems online"))
((voice played backwards says "Welcome to the stream"))
((underwater voice says "Can anybody hear me?"))
((gunshot over a walkie-talkie;3s))
```

- **Chipmunk / helium**: `chipmunk`, `helium`, `sucked helium`. Pitch and speed rise
  together, like a tape played too fast.
- **Slow motion**: `slow motion`, `slow-mo`, `slowed voice`, `wrong speed`. The
  opposite: pitch and speed both drop, like a record at the wrong speed. This is a
  different, deeper effect than just asking someone to talk `slowly`
  ([speech speed](#speech-speed) only changes pace, never pitch).
- **Robot / vocoder**: `robot`, `robotic`, `vocoder`, `cyborg`, `android`. A clean,
  metallic ring-modulated voice — the classic robot buzz, not distortion.
  `TTS_ROBOT_AMOUNT` scales it: `1` is the default, `2` is double, `off` skips it.
- **Reversed**: `reversed`, `backwards`, `played backward`. The whole clip plays
  end to end in reverse, including any room or echo tail, so the tail is heard
  first — deliberate backmasking.
- **Underwater**: `underwater`, `submerged`, `drowning`. A heavy, drifting low-pass
  with a slow wavering pitch. `TTS_UNDERWATER_AMOUNT` scales it the same way as
  `TTS_ROBOT_AMOUNT`.

Two of the room/channel words from the previous section are novelty transmissions
rather than a place: `over a walkie-talkie` narrows the band and adds a brief key
click before and after the line; `through a tin can` (or `string phone`) is a very
narrow, resonant honk; `on an old radio` (or `vintage radio`) is a warmer, wider
broadcast band. All are applied locally and never sent to ElevenLabs.

## Pauses

Pauses are generated locally and do not spend sound-effect credits. They can be
0.5–30 seconds long and default to one second when no duration is supplied.

```text
((silence))
((silence;2.5s))
((pause for 3 seconds))
((2 seconds of silence))
```

## Reusable clips

Every successful generation is stored as an MP3 attachment through the private
Discord webhook, while its metadata and Discord message ID are indexed in Neon.
Temporary WAV and mix files are deleted after the job completes.

Paste a saved token by itself to load or play that clip:

```text
(TTS:0123456789abcdef0123456789abcdef)
```

Replaying a token does not call OpenAI or ElevenLabs. The overlay attributes the
replay to the person who requested it, while the archived clip retains its
original creator metadata.

Deleting a saved clip removes both its database metadata and Discord webhook
message. A deleted token cannot be replayed.

Each clip also stores a waveform (60 loudness values, worked out from the finished MP3 when the
clip is made) that the public clip page draws as its seek bar. It is only decoration, so a
failure to work it out never loses the clip. Clips saved before this existed have none and show a
stand-in shape. To give them theirs, run this from `server/` (it needs ffmpeg and the same
`.env` as the server, and it writes into whichever database `DATABASE_URL` names):

```bash
npm run backfill:peaks -- --dry-run --limit=3   # try a few clips, storing nothing
npm run backfill:peaks                          # every clip that has none
```

It reads each MP3 back from Discord (inbound traffic, so it does not use Render's bandwidth),
only touches clips that have no waveform, and can safely be run again.

## Audio processing

- Every scene is balanced by how loud it sounds (ITU-R BS.1770 loudness), not by
  its peak, before the scenes are joined. Speech is set to -14 LUFS and a
  standalone effect to -19 LUFS (-21 for sharp effects), so a dense effect such as animal screams no
  longer drowns out speech.
- Background sound under speech is set to the speech level first, then scaled by
  the scene's background volume.
- The finished clip is normalized once more with true-peak protection.
- A voice created for a character is not pitch-shifted a second time.
- The overlay shows a now-playing card with the requester and full prompt.
- TTS can be paused (requests queue up), resumed, skipped, or disabled from Studio.

## Failures and billing

**Review plan** (currently switched off) used OpenAI but did not generate ElevenLabs
audio. Once speech
or sound generation has started, the provider may charge credits even if a
later scene fails. The server validates storage and prompt syntax before paid
generation, queues jobs, and avoids automatic paid retries.

Transient OpenAI planning failures fall back to the deterministic local parser.
Authentication, exhausted-credit, missing-permission, storage, and overlay playback
errors are shown in the job card and as dashboard notifications. Failed job
details can be copied with the job ID when reporting a problem.

Dynamic public TTS commands can spend provider credits. Restrict them to trusted
roles, add cooldowns, and prefer reusable tokens for frequently played clips.
