// Shared AI model constants (imported by both the client form and the server
// path) so the client bundle needn't pull in the OpenAI call / prompt.
// `AI_MODEL` is the default and what the import form advertises; the server
// overrides it with OPENAI_MODEL when that is set (see lib/actions/ai-preview.ts).
// Keep the env read out of this file — it is imported by client components, where
// a non-NEXT_PUBLIC_ var would silently be undefined.
export const AI_MODEL = "gpt-5.4";
export const AI_EFFORT = "high";
