import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, nodes, nodeSourceRanges, nodeAnnotations, inlineAnnotations } from "@/lib/db/schema";
import { htmlToParagraphs } from "@/lib/import/html";
import { createDocument } from "@/lib/actions/documents";
import { computeDemoNesting } from "./seed-tree";

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

  // 1) Import the book through the REAL import path (fetch -> htmlToParagraphs -> createDocument).
  console.log("Seed: fetching", BOOK_URL);
  const res = await fetch(BOOK_URL, { headers: { "user-agent": "ScholiaBot/1.0" } });
  if (!res.ok) throw new Error(`Seed fetch failed: ${res.status}`);
  const html = await res.text();
  const { title, paragraphs } = htmlToParagraphs(html);
  if (paragraphs.length === 0) throw new Error("Seed: no paragraphs extracted from book");
  const docId = await createDocument({ title: title ?? "Seeded Book", text: paragraphs.join("\n\n") });
  console.log(`Seed: created document ${docId} (${paragraphs.length} paragraphs)`);

  // 2) Demo indent tree over the first three top-level nodes.
  const top = await db
    .select()
    .from(nodes)
    .where(and(eq(nodes.documentId, docId), isNull(nodes.parentId)))
    .orderBy(nodes.position);
  for (const u of computeDemoNesting(top.map((n) => n.id))) {
    await db.update(nodes).set({ parentId: u.parentId, position: u.position }).where(eq(nodes.id, u.id));
  }
  console.log("Seed: nested the first three blocks");

  // 3) Comments on the first two blocks (original reading order): a node
  //    annotation on each, and one inline annotation inside each.
  for (const n of top.slice(0, 2)) {
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
  console.log("Seed: added node + inline comments on the first two blocks");
  console.log("Seed: done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
