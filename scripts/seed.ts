import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, nodes, nodeSourceRanges, nodeAnnotations, inlineAnnotations } from "@/lib/db/schema";
import { htmlToSource } from "@/lib/import/html";
import { createDocument } from "@/lib/actions/documents";
import { withSpinner } from "./seed-progress";

const BOOK_URL = "https://www.gutenberg.org/files/5827/5827-h/5827-h.htm";
const DEV_USER = "local-dev";

async function main() {
  // Idempotent: if the dev user already owns a document, do nothing.
  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.ownerId, DEV_USER));
  if (existing.length > 0) {
    console.log("Seed: dev user already has documents — skipping.");
    return;
  }

  // 1) Import the book through the REAL import path (fetch -> htmlToSource -> createDocument).
  const html = await withSpinner(`Seed: fetching ${BOOK_URL}`, async () => {
    const res = await fetch(BOOK_URL, { headers: { "user-agent": "ScholiaBot/1.0" } });
    if (!res.ok) throw new Error(`Seed fetch failed: ${res.status}`);
    return res.text();
  });
  const { title, text, headingLevels } = htmlToSource(html);
  if (text.length === 0) throw new Error("Seed: no text extracted from book");
  const docId = await withSpinner(
    `Seed: importing document`,
    () => createDocument({ title: title ?? "Seeded Book", text, headingLevels }),
  );
  console.log(`Seed: created document ${docId}`);

  // 2) Import already nested the book (chapter headings -> prose children), so
  //    there's no demo indent to apply. Demo comments go on the first chapter's
  //    opening prose paragraphs — nodes that render a passage, so an inline
  //    highlight is actually visible (a heading node renders as a head only).
  const [firstHeading] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.documentId, docId), isNull(nodes.parentId)))
    .orderBy(nodes.position)
    .limit(1);
  const prose = firstHeading
    ? await db
        .select()
        .from(nodes)
        .where(and(eq(nodes.documentId, docId), eq(nodes.parentId, firstHeading.id)))
        .orderBy(nodes.position)
        .limit(2)
    : [];
  for (const n of prose) {
    await db.insert(nodeAnnotations).values({
      documentId: docId,
      nodeId: n.id,
      authorId: DEV_USER,
      note: "Seeded demo comment on this block.",
      tags: [],
    });
    const [range] = await db.select().from(nodeSourceRanges).where(eq(nodeSourceRanges.nodeId, n.id));
    if (range) {
      const start = range.startOffset;
      const end = Math.min(range.endOffset, start + 24);
      if (end > start) {
        await db.insert(inlineAnnotations).values({
          documentId: docId,
          sourceId: range.sourceId,
          authorId: DEV_USER,
          startOffset: start,
          endOffset: end,
          color: "yellow",
          note: "inline comment",
          tags: [],
        });
      }
    }
  }
  console.log("Seed: added node + inline comments on the first chapter's opening paragraphs");
  console.log("Seed: done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
