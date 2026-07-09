/**
 * Return the first sentence of `text` — everything up to and including the first
 * `.`, `!`, or `?` that is followed by whitespace or the end of the string.
 * Falls back to the whole trimmed string when no such boundary exists.
 * Intentionally simple: abbreviations like "Dr." are treated as boundaries.
 */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  // `[\s\S]` (rather than `.` with the /s flag) matches across newlines while
  // staying compatible with pre-es2018 TypeScript targets.
  const match = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return match ? match[0] : trimmed;
}
