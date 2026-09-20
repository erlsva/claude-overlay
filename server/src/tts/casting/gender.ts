/** Who a character is meant to be, from the words used to describe them. */

// "welshman" and "frenchman" say the gender inside the word.
const nationalityPrefix =
  "french|welsh|irish|english|scots|dutch|norse|cave|space|snow|super|bat|spider|iron";

export function gender(text: string) {
  return new RegExp(`\\b(?:woman|female|girl|(?:${nationalityPrefix})woman)\\b`).test(text)
    ? "female"
    : new RegExp(`\\b(?:man|male|boy|(?:${nationalityPrefix})man)\\b`).test(text)
      ? "male"
      : null;
}

/**
 * A character that names no gender still has one in the listener's mind. Demons, trolls
 * and monsters are deep male voices; asking for a "demonic voice" must not return a woman.
 * An explicit gender in the request always wins over this.
 */
export function impliedGender(text: string) {
  return /\b(?:demon\w*|devil\w*|satan\w*|troll|ogre|orc|monster|giant|beast|zombie|guy|dude|gentleman|sir|dad|father|grandpa|king|lord)\b/.test(
    text,
  )
    ? "male"
    : /\b(?:witch|queen|lady|princess|mom|mother|grandma|girlfriend)\b/.test(text)
      ? "female"
      : null;
}
