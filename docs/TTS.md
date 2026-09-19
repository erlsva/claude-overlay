# TTS Scene Studio

TTS Scene Studio turns a prompt into one or more ordered audio scenes. A scene
can contain speech, a generated sound effect, background sound, silence, or a
combination of speech and background sound. Finished clips can play through the
overlay and are saved with a reusable token.

## Quick start

1. Write a prompt in **Scene prompt or saved token**.
2. Select **Review plan** to inspect voices, dialogue, effects, speed, and
   timing without spending ElevenLabs generation credits.
3. Select **Generate & save** to create and archive the clip, or **Play on overlay**
   to create, archive, and immediately play it.
4. Reuse the resulting `(TTS:<id>)` token to play exactly the same audio later
   without generating it again.

Dashboard previews play only in the dashboard browser. Overlay playback is sent to
the connected overlay browser source. The overlay volume defaults to 25% and can be
changed while a clip is playing.

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
not additional tail time.

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
- `through an intercom`, `telephone`, `megaphone`, or `walkie-talkie`
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
Automatic fitting is capped at 1.25×. When the performance still needs longer,
the complete speech is retained and the job reports a useful duration warning.

## Speech speed

Speed is authored per speech scene and becomes part of the saved audio. Natural
directions work:

```text
((pirate slowly says "Wait for me";8s))
((pirate very quickly shouts "Run!";8s))
```

For exact control, use `speed=<rate>x` between 0.75× and 1.25×:

```text
((pirate says "Wait for me";speed=0.8x;8s))
((announcer says "Final round";speed=1.15x))
```

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
- TTS can be paused, resumed, stopped, or disabled from Studio.

## Failures and billing

**Review plan** uses OpenAI but does not generate ElevenLabs audio. Once speech
or sound generation has started, the provider may charge credits even if a
later scene fails. The server validates storage and prompt syntax before paid
generation, queues jobs, and avoids automatic paid retries.

Transient OpenAI planning failures fall back to the deterministic local parser.
Authentication, exhausted-credit, missing-permission, storage, and overlay playback
errors are shown in the job card and as dashboard notifications. Failed job
details can be copied with the job ID when reporting a problem.

Dynamic public TTS commands can spend provider credits. Restrict them to trusted
roles, add cooldowns, and prefer reusable tokens for frequently played clips.
