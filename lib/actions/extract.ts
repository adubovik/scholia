"use server";
import { htmlToParagraphs, type ExtractedText } from "@/lib/import/html";
import { auth } from "@clerk/nextjs/server";

export async function extractHtml(html: string): Promise<ExtractedText> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthenticated");
  return htmlToParagraphs(html);
}
