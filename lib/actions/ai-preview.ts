"use server";

import { getUserId } from "@/lib/auth/current-user";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";
import { aiStructure, buildPreview, type AiNode, type AiTurn, type PreviewLine, type AiUsage } from "@/lib/tree/ai-structure";
import { AI_MODEL } from "@/lib/tree/ai-model";

export interface AiPreviewResult {
  tree: AiNode[]; // carried back to createDocument on Accept (no second AI call)
  lines: PreviewLine[]; // reading-order preview for the modal
  usage: AiUsage;
  model: string; // which model actually answered (env can override the default)
  kept: number;
  dropped: number;
}

/**
 * Run the AI structure pass on the given text and return a preview WITHOUT
 * writing anything. The BYOK key is used here for exactly one OpenAI call and
 * never persisted or logged. On Accept the caller passes `tree` to
 * `createDocument({ aiTree })`, which re-validates and maps it — no re-call.
 *
 * `history` carries earlier exchanges (each: the tree the model returned, then what
 * the reader asked next) so a follow-up like "drop everything after the Dover line"
 * is answered with the whole conversation in view. The conversation lives in the
 * client — nothing about it is stored here.
 */
export async function previewAiStructure(input: {
  text: string;
  aiKey: string;
  history?: AiTurn[];
}): Promise<AiPreviewResult> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthenticated");
  // The reader's own key wins; OPENAI_API_KEY is the deployment's fallback, so a
  // self-hosted/local instance can run the pass without anyone pasting a key.
  const apiKey = input.aiKey.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenAI API key required — paste one, or set OPENAI_API_KEY on the server");
  const model = process.env.OPENAI_MODEL?.trim() || AI_MODEL;

  const paras = paragraphize(normalizeText(input.text)).map((p) => ({ start: p.start, end: p.end, text: p.text }));
  const { tree, usage } = await aiStructure(paras, { apiKey, model }, input.history ?? []);
  const lines = buildPreview(tree, paras);
  const dropped = lines.filter((l) => l.kind === "dropped").length;
  return { tree, lines, usage, model, kept: lines.length - dropped, dropped };
}
