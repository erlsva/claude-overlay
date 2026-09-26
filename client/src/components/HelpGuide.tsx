import { useEffect, useState } from "react";
import { GraduationCap, HelpCircle, Rocket, X } from "lucide-react";
import { usePresence } from "../hooks/usePresence";

const sections = [
  {
    title: "Move, select & resize",
    items: [
      [
        "Left-drag an element",
        "Move it. If it belongs to the current multi-selection or a group, every selected or grouped element moves with it.",
      ],
      ["Alt + drag", "Temporarily disable edge and center snapping."],
      ["Drag a resize handle", "Resize from that edge or corner."],
      [
        "Drag the round rotation handle",
        "Rotate the selected element around its center. Hold Shift to snap to 15° increments.",
      ],
      ["Click an element", "Select it and show its editing controls."],
      ["Shift / Ctrl / Cmd + click", "Add or remove an element from the selection."],
      ["Drag empty background", "Draw a selection box around multiple elements."],
      ["Click empty background", "Clear the current selection."],
      [
        "Double-click text",
        "Open the text editor. You can also select the layer and use Edit text and style in Layers.",
      ],
      ["Ctrl / Cmd + Enter in text editor", "Save the text layer without reaching for the mouse."],
      ["Escape in text editor", "Close the editor without saving changes."],
      ["Delete / Backspace", "Delete selected unlocked elements."],
    ],
  },
  {
    title: "Navigate the workspace",
    items: [
      ["Middle-mouse drag", "Pan around the workspace."],
      ["Mouse wheel", "Zoom toward or away from the pointer."],
      ["% · Fit", "Center the 1920×1080 stream area and reset its zoom."],
    ],
  },
  {
    title: "Keyboard shortcuts",
    items: [
      ["Ctrl / Cmd + Z", "Undo the latest shared canvas change."],
      ["Ctrl / Cmd + Shift + Z", "Redo the latest undone change."],
      ["Ctrl / Cmd + Y", "Redo on Windows."],
      ["Ctrl / Cmd + C", "Copy the selected elements."],
      [
        "Ctrl / Cmd + V",
        "Paste copied layers with a small offset, clipboard text as a text layer, or clipboard image/GIF data as uploaded media.",
      ],
    ],
  },
  {
    title: "Top toolbar",
    items: [
      ["Add media", "Upload an image, GIF, video, or audio file."],
      [
        "Library",
        "Shared default videos, images and sounds that stay available after restarts. Add one to the canvas, or a sound to the Soundboard. Anyone can add or delete.",
      ],
      [
        "Text",
        "Create centered overlay text with font, weight, alignment, color, outline, shadow, background, spacing, and size controls.",
      ],
      ["Draw", "Open Pen, Erase, Fill, brush size, and drawing controls."],
      ["Add as Element", "Turn the current drawing into movable media."],
      ["Fit / Fill", "Fit inside the stream area, or cover it completely."],
      ["DVD", "Start or stop bouncing movement for the selected element."],
      [
        "Drag and drop",
        "Drop one local image, GIF, video, or audio file anywhere on the dashboard. You can also drag the GIF image itself from Giphy; webpage links are rejected safely.",
      ],
      ["Flip X / Flip Y", "Mirror selected visual media horizontally or vertically."],
      ["Auto", "For video: show on play, then hide when playback ends."],
    ],
  },
  {
    title: "Drawing mode",
    items: [
      [
        "Pen / Erase",
        "Draw or remove freehand strokes. The circle at the pointer previews the current brush size.",
      ],
      ["Line / Arrow", "Drag between two points. Hold Shift to snap to 45° angles."],
      [
        "Box / Oval",
        "Drag out a rectangle or ellipse. Hold Shift to constrain it to a square or circle.",
      ],
      ["Opacity", "Set transparency for new strokes, shapes, and fills."],
      [
        "Fill tolerance",
        "Control how closely neighboring pixels must match; lower values stop at sharper boundaries.",
      ],
      ["Exit Draw", "Exit drawing mode and return to selecting and moving overlay elements."],
      [
        "Clear",
        "Remove the complete drawing after confirmation. Use Undo to restore it immediately.",
      ],
    ],
  },
  {
    title: "Layers, video & stream",
    items: [
      ["Eye / eye-off", "Show or hide a layer on the overlay."],
      ["Lock", "Prevent accidental movement, resizing, and deletion."],
      ["Group", "Keep multiple selected layers moving together."],
      [
        "Group rotation handles",
        "White handles rotate one member; the accent-colored handle on the dashed group boundary rotates the whole group.",
      ],
      [
        "Video body",
        "Click the upper video area to play or pause, or drag it to move. Native playback and volume controls stay in the bottom strip.",
      ],
      ["Preview eye", "Show or hide the Twitch preview only on the dashboard."],
      [
        "Player button (pointer)",
        "Hands the mouse to the Twitch player so you can play, pause or mute it. Canvas editing is paused until you turn it off again.",
      ],
      [
        "Switch preview",
        "When multiple production channels are configured, switch both the preview and chat command listener. Local development is locked to EPLE7.",
      ],
      [
        "Overlay preview (monitor icon)",
        "A floating, silent live copy of what the overlay shows, including chat emotes. Drag its header to move it, drag the corner to resize, double-click the header to reset.",
      ],
      ["Refresh overlay", "Ask connected overlay browser sources to reload."],
      [
        "Go-live check",
        "Verify the dashboard server, overlay connection, Twitch listeners, broadcaster Events, command targets, and visible media placement before a stream.",
      ],
      [
        "Lifebuoy support button",
        "Review notifications from this browser session and copy a safe diagnostic report containing build and connection details when asking for help.",
      ],
      ["Studio", "Open Sounds, commands, Twitch events, TTS, saved scenes, and chat emotes."],
      [
        "Manage who can use the dashboard",
        "The people icon beside Studio (owner and super moderators) adds or removes approved Twitch accounts. Only the owner can make someone a super moderator, or remove one.",
      ],
      [
        "Dashboard / overlay badges",
        "Dashboard only is a private local preview; Plays on overlay reaches the stream; Dashboard + overlay runs in both places.",
      ],
      [
        "Selection hints",
        "Contextual tips appear whenever a new media element is selected until you choose Don’t show again. Dismissing them permanently does not remove this guide.",
      ],
      [
        "Search layers and Studio lists",
        "Filter large layer, Soundboard, command, and event-action lists by name without changing the overlay.",
      ],
    ],
  },
  {
    title: "Commands & effects",
    items: [
      [
        "Soundboard vs media",
        "Soundboard clips play on the overlay without a canvas layer. Use Stop on Overlay to immediately silence every playing instance of that clip. Play video/audio layer targets uploaded media in Layers.",
      ],
      [
        "Myinstants links",
        "Sound-page links are resolved on a best-effort basis. If Myinstants blocks the server, use Download MP3 and then Upload file.",
      ],
      [
        "Add another action",
        "Chain up to 10 editable actions to one chat command or Twitch event, such as showing an image, playing a sound, and sending a chat message.",
      ],
      [
        "When → Do → Then",
        "Use the three command-builder stages to choose the trigger, configure one or more actions, then set access and save.",
      ],
      [
        "Twitch event filters",
        "Run actions for follows, subscriptions, gifts, raids, Bits, channel points, permanent bans, timeouts, or new predictions. Limit numeric and reward events with their matching filters.",
      ],
      [
        "Chat message variables",
        "Messages can insert {user}, {months}, {viewers}, {bits}, {reward}, {channel}, {moderator}, {reason}, {duration}, and {banType}. TTS chat commands can also insert {message}. The dedicated chatbot sends chat replies.",
      ],
      [
        "Studio · TTS",
        "Write a scene, review the interpreted plan, then generate and save it or play it on the overlay. Plain text is spoken. Inside ((…)), quoted words are speech and unquoted descriptions are sound effects; every part plays in sequence.",
      ],
      [
        "TTS voices and effects",
        "Describe a voice or effect in plain words: an angry pirate, underwater, robot, chipmunk, slow motion, backwards, over a walkie-talkie, through a tin can, on an old radio, in a cave, behind a door, with echo. Effects can be combined.",
      ],
      [
        "TTS speed",
        "Slow or speed up a line or a sound effect from half speed to double speed without changing its pitch: add ;speed=0.5x, ;speed=1.5x or ;speed=2x inside the ((…)). On a spoken line, words like slowly, very quickly or half speed work too.",
      ],
      [
        "Saved TTS tokens",
        "Copy a (TTS:…) token to replay the exact saved audio later without paying generation credits again. You can preview saved clips privately on the dashboard or delete them permanently.",
      ],
      [
        "TTS pauses",
        "Use ((silence;2s)), ((pause, 2 sec)), or ((silent pause 2 seconds)) for an exact 0.5–30 second silent gap. Without a duration it defaults to one second.",
      ],
      [
        "TTS playback safety",
        "Use the speaker control to turn new TTS playback on or off. Pause, Resume, and Stop control the active overlay clip. Audio is loudness-normalized and peak-limited, and the overlay shows a small status notice while TTS is playing.",
      ],
      [
        "TTS failures",
        "If AI planning is temporarily unavailable, TTS uses a safe local interpretation instead of paying for a retry. A TTS command/event action can optionally send a chatbot message when generation or overlay playback fails.",
      ],
      [
        "Command action timing",
        "Run actions together, after a chosen delay, or after the previous timed effect, video, or sound finishes.",
      ],
      [
        "Random position",
        "Place media at a fresh random point anywhere it fits inside the stream area.",
      ],
      [
        "Preview flight",
        "Test a fly-across animation on your dashboard without affecting the overlay or other users.",
      ],
      [
        "DVD speed panel",
        "When a selected element is using DVD mode, adjust its speed and the shared corner sound, volume, and counter position directly beneath it.",
      ],
      [
        "Selected media animation",
        "Select an image, GIF, or video in Layers, choose a reaction or travel animation, set its duration with the slider or presets, and press Play. It runs on the dashboard and overlay; travel animations restore the previous position afterward.",
      ],
      [
        "Studio · Scenes",
        "Save the complete layout and drawing under a name and load it later. Loading replaces the canvas, and Undo brings it back. The owner turns Scenes on in the account menu.",
      ],
      [
        "Studio · Emotes",
        "Pick a movement: bottom parade, corner route, floor or wall bounce, pop-in bounces, rain, snowfall, rising balloons, drift and twinkle, orbit, fireworks, bouncy slide-in, pinball, pile-up or a conga line; tune size, speed, labels, gravity, and limits, blacklist chatters, allow selected emotes after the first emote in a message, and preview locally. Wide and zero-width emotes retain their intended layout.",
      ],
      [
        "Show my cursor on overlay",
        "The green Visible or red Hidden state controls only your cursor on the overlay; dashboard cursors remain visible.",
      ],
    ],
  },
];

export function HelpGuide({
  onOpenTour,
  onOpenSetup,
}: {
  onOpenTour?: () => void;
  onOpenSetup?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        className="ui-icon-button canvas-corner-button"
        onClick={() => setOpen(true)}
        title="Open controls and shortcuts guide"
        aria-label="Open controls and shortcuts guide"
        style={{
          position: "absolute",
          right: 14,
          bottom: 12,
          zIndex: 2500,
          border: "1px solid var(--accent-border)",
          background: "var(--accent-solid)",
          color: "var(--accent-contrast)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
          cursor: "pointer",
        }}
      >
        <HelpCircle size={18} />
      </button>

      {presence.mounted && (
        <div
          role="presentation"
          className="guide-backdrop motion-backdrop"
          data-state={presence.state}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="controls-guide-title"
            className="guide-dialog motion-dialog"
            data-state={presence.state}
          >
            <header className="guide-header">
              <div>
                <h2 id="controls-guide-title">Controls & shortcuts</h2>
                <p>A quick guide to editing the overlay</p>
              </div>
              <div className="guide-header__actions">
                {onOpenSetup && (
                  <button
                    className="ui-button"
                    onClick={() => {
                      setOpen(false);
                      onOpenSetup();
                    }}
                  >
                    <Rocket size={14} /> Setup guide
                  </button>
                )}
                {onOpenTour && (
                  <button
                    className="ui-button"
                    onClick={() => {
                      setOpen(false);
                      onOpenTour();
                    }}
                  >
                    <GraduationCap size={14} /> Quick tour
                  </button>
                )}
                <button
                  className="ui-icon-button"
                  onClick={() => setOpen(false)}
                  title="Close guide (Escape)"
                  aria-label="Close controls guide"
                >
                  <X size={16} />
                </button>
              </div>
            </header>
            <div
              style={{
                overflowY: "auto",
                padding: 18,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: 14,
              }}
            >
              {sections.map((section) => (
                <section
                  key={section.title}
                  style={{
                    padding: 13,
                    background: "var(--bg-raised)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 10px",
                      color: "var(--accent-text)",
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: "0.045em",
                      textTransform: "uppercase",
                    }}
                  >
                    {section.title}
                  </h3>
                  <div style={{ display: "grid", gap: 9 }}>
                    {section.items.map(([control, description]) => (
                      <div
                        key={control}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(112px, 0.72fr) minmax(0, 1.4fr)",
                          gap: 10,
                          alignItems: "start",
                        }}
                      >
                        <kbd
                          style={{
                            minHeight: 24,
                            display: "inline-flex",
                            alignItems: "center",
                            width: "fit-content",
                            maxWidth: "100%",
                            padding: "3px 7px",
                            color: "var(--text-primary)",
                            background: "var(--bg-control)",
                            border: "1px solid var(--line-strong)",
                            borderBottomWidth: 2,
                            borderRadius: 5,
                            fontFamily: "Inter, sans-serif",
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1.35,
                          }}
                        >
                          {control}
                        </kbd>
                        <span
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: 11,
                            lineHeight: 1.45,
                          }}
                        >
                          {description}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
