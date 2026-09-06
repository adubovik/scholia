"use server";
import { htmlToSource, type ExtractedText } from "@/lib/import/html";
import { epubToSource, type ExtractedBook } from "@/lib/import/epub";
import { getUserId } from "@/lib/auth/current-user";

export async function extractHtml(html: string): Promise<ExtractedText> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthenticated");
  return htmlToSource(html);
}

/** An epub is binary, so it rides in as FormData rather than a string argument.
 * `next.config.ts` raises the Server Action body limit to cover a whole book. */
export async function extractEpub(form: FormData): Promise<ExtractedBook> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthenticated");
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");
  return epubToSource(new Uint8Array(await file.arrayBuffer()));
}
