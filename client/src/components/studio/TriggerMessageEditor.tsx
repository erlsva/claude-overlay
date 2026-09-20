import { fieldStyle } from "./shared";
import type { StudioContext } from "./context";

/** The chat message or TTS prompt an action sends, with its variables. */
export function TriggerMessageEditor({
  s,
}: {
  s: Pick<
    StudioContext,
    "chatMessage" | "setChatMessage" | "setTtsErrorMessage" | "triggerAction" | "ttsErrorMessage"
  >;
}) {
  const { chatMessage, setChatMessage, setTtsErrorMessage, triggerAction, ttsErrorMessage } = s;
  return (
    <div className="chat-message-editor">
      <label>
        <span>
          {triggerAction === "tts"
            ? "TTS prompt or token · {message} inserts viewer input"
            : "Chat message"}
        </span>
        <textarea
          style={{
            ...fieldStyle,
            height: 72,
            paddingTop: 8,
            resize: "vertical",
          }}
          maxLength={triggerAction === "tts" ? 6000 : 500}
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          placeholder={
            triggerAction === "tts"
              ? '((a warm voice says "{message}" with echo;6s))'
              : "Thanks {user} for the {bits} Bits!"
          }
          title="Message sent by the connected chatbot account. Event variables in braces are replaced automatically."
        />
      </label>
      <div className="chat-variable-guide" aria-label="Available chat message variables">
        <strong>Variables</strong>
        {triggerAction === "tts" && (
          <code title="Viewer text after the chat command">{"{message}"}</code>
        )}
        <code title="Viewer or broadcaster who caused the event">{"{user}"}</code>
        <code title="Total subscription months">{"{months}"}</code>
        <code title="Number of incoming raid viewers">{"{viewers}"}</code>
        <code title="Number of Bits cheered">{"{bits}"}</code>
        <code title="Channel point reward title">{"{reward}"}</code>
        <code title="Channel receiving the event">{"{channel}"}</code>
        <code title="Moderator who issued the ban or timeout">{"{moderator}"}</code>
        <code title="Moderation reason">{"{reason}"}</code>
        <code title="Permanent or timeout duration">{"{duration}"}</code>
        <code title="Either ban or timeout">{"{banType}"}</code>
        <code title="Title of the prediction that started">{"{title}"}</code>
      </div>
      {triggerAction === "tts" && (
        <>
          <label>
            <span>Chat message if TTS fails (optional)</span>
            <textarea
              style={{
                ...fieldStyle,
                height: 58,
                paddingTop: 8,
                resize: "vertical",
              }}
              maxLength={500}
              value={ttsErrorMessage}
              onChange={(event) => setTtsErrorMessage(event.target.value)}
              placeholder="Sorry {user}, that TTS could not be played."
            />
          </label>
          <p className="command-cost-warning">
            New prompts spend OpenAI and ElevenLabs credits. Saved (TTS:…) tokens replay without
            generation cost; restrict dynamic chat TTS to trusted roles and a meaningful cooldown.
            Failed TTS can notify chat through the connected chatbot.
          </p>
        </>
      )}
    </div>
  );
}
