import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";

/**
 * Gate a mutation on a document. M2: owner-only (no memberships yet). M5 will
 * extend this with the collaborator role matrix, keyed off `action`.
 */
export async function authorize(userId: string, docId: string, _action: string): Promise<void> {
  const [doc] = await db
    .select({ ownerId: documents.ownerId })
    .from(documents)
    .where(eq(documents.id, docId));
  if (!doc || doc.ownerId !== userId) throw new Error("Forbidden");
}
