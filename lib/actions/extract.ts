"use server";
import { htmlToParagraphs, type ExtractedText } from "@/lib/import/html";
import { getUserId } from "@/lib/auth/current-user";

export async function extractHtml(html: string): Promise<ExtractedText> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthenticated");
  return htmlToParagraphs(html);
}
