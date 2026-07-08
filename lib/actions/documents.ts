"use server";

import { db } from "@/lib/db";
import { documents, sources, paragraphs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";

export async function createDocument(input: {
  title: string;
  language?: string;
  label?: string;
  text: string;
}): Promise<string> {
  const user = await requireUser();
  const normalized = normalizeText(input.text);
  const paras = paragraphize(normalized);

  const docId = crypto.randomUUID();
  const srcId = crypto.randomUUID();

  const statements: any[] = [
    db.insert(documents).values({ id: docId, ownerId: user.id, title: input.title }),
    db.insert(sources).values({
      id: srcId, documentId: docId, language: input.language ?? null,
      label: input.label ?? null, isPrimary: true, position: 0, text: normalized,
    }),
  ];
  if (paras.length > 0) {
    statements.push(
      db.insert(paragraphs).values(
        paras.map((p, i) => ({ sourceId: srcId, position: i, charStart: p.start, charEnd: p.end })),
      ),
    );
  }
  // neon-http has no interactive transactions; batch is a single atomic round-trip.
  await db.batch(statements as [any, ...any[]]);
  return docId;
}
