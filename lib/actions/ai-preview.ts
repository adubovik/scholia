"use server";

import { getUserId } from "@/lib/auth/current-user";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";
import { aiStructure, buildPreview, type AiNode, type PreviewLine, type AiUsage } from "@/lib/tree/ai-structure";

export interface AiPreviewResult {
  tree: AiNode[]; // carried back to createDocument on Accept (no second AI call)
  lines: PreviewLine[]; // reading-order preview for the modal
  usage: AiUsage;
  kept: number;
  dropped: number;
}

/**
 * Run the AI structure pass on the given text and return a preview WITHOUT
 * writing anything. The BYOK key is used here for exactly one OpenAI call and
 * never persisted or logged. On Accept the caller passes `tree` to
 * `createDocument({ aiTree })`, which re-validates and maps it — no re-call.
 */
export async function previewAiStructure(input: {
  text: string;
  aiKey: string;
}): Promise<AiPreviewResult> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthenticated");
  if (!input.aiKey.trim()) throw new Error("OpenAI API key required");

  const paras = paragraphize(normalizeText(input.text)).map((p) => ({ start: p.start, end: p.end, text: p.text }));
  const { tree, usage } = await aiStructure(paras, { apiKey: input.aiKey.trim() });
  const lines = buildPreview(tree, paras);
  const dropped = lines.filter((l) => l.kind === "dropped").length;
  return { tree, lines, usage, kept: lines.length - dropped, dropped };
}
