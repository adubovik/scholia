import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("db users", () => {
  const id = "test_user_" + crypto.randomUUID();
  afterAll(async () => { await db.delete(users).where(eq(users.id, id)); });

  it("inserts and reads a user", async () => {
    await db.insert(users).values({ id, email: "a@b.c", displayName: "Tester" });
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row.displayName).toBe("Tester");
  });
});
