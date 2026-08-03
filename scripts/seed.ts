import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, nodes, nodeSourceRanges, nodeAnnotations, inlineAnnotations } from "@/lib/db/schema";
import { htmlToSource } from "@/lib/import/html";
import { createDocument } from "@/lib/actions/documents";
import { COLORS } from "@/lib/annotations/types";
import { GLYPHS, glyphTag } from "@/lib/annotations/glyphs";
import { withSpinner } from "./seed-progress";

const BOOK_URL = "https://www.gutenberg.org/files/5827/5827-h/5827-h.htm";
const DEV_USER = "local-dev";

// Demo #tags to sprinkle across the seeded annotations, so the filter row + tag chips
// have something to show.
const DEMO_TAGS = ["appearance", "reality", "sense-data", "knowledge", "matter", "idealism"];

type SourceRange = { sourceId: string; startOffset: number; endOffset: number };

/** Insert one inline highlight over [from,to) chars into a node's range (clamped). */
async function addInline(
  docId: string,
  range: SourceRange,
  from: number,
  to: number,
  color: string,
  note: string | null,
  tags: string[],
) {
  const start = range.startOffset + from;
  const end = Math.min(range.endOffset, range.startOffset + to);
  if (end <= start) return;
  await db.insert(inlineAnnotations).values({
    documentId: docId,
    sourceId: range.sourceId,
    authorId: DEV_USER,
    startOffset: start,
    endOffset: end,
    color,
    note,
    tags,
  });
}

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
    () => createDocument({ title: title ?? "Seeded Book", author: "Bertrand Russell", text, headingLevels }),
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
        .limit(3)
    : [];

  // Rotate colours, glyphs, and #tags across the demo annotations so every display
  // feature has live data: all four highlight colours, all three preset glyphs, a
  // handful of tags, and one note-less highlight (the "dim span, add a note" case).
  let ci = 0; // colour cursor
  let ti = 0; // tag cursor
  const nextTag = () => DEMO_TAGS[ti++ % DEMO_TAGS.length];
  const nextColor = () => COLORS[ci++ % COLORS.length];

  for (let i = 0; i < prose.length; i++) {
    const n = prose[i];
    // A node note with a #tag and a preset glyph (":summary" / ":question" / ":insight").
    await db.insert(nodeAnnotations).values({
      documentId: docId,
      nodeId: n.id,
      authorId: DEV_USER,
      note: `Seeded node note on paragraph ${i + 1}.`,
      tags: [nextTag(), glyphTag(GLYPHS[i % GLYPHS.length])],
    });
    const [range] = await db.select().from(nodeSourceRanges).where(eq(nodeSourceRanges.nodeId, n.id));
    if (!range) continue;
    // Two inline highlights per paragraph: the first noted (with a glyph), the second
    // bare (no note) to exercise the add-a-note affordance.
    await addInline(docId, range, 0, 24, nextColor(), "Seeded inline note.", [
      nextTag(),
      glyphTag(GLYPHS[(i + 1) % GLYPHS.length]),
    ]);
    await addInline(docId, range, 30, 60, nextColor(), null, [nextTag()]);
  }
  console.log("Seed: added varied node + inline annotations (colours, glyphs, tags) on the first chapter");
  console.log("Seed: done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
