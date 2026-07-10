import { describe, it, expect, vi, beforeEach } from "vitest";

const authState = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: authState.userId }) }));
import { POST } from "@/app/api/import/route";

const HTML = `<html><head><title>T</title></head><body><article>
  <h1>Title</h1><p>Hello paragraph one.</p><p>Hello paragraph two.</p></article></body></html>`;

function req(body: unknown) {
  return new Request("http://localhost/api/import", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/import", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authState.userId = "u1";
  });

  it("returns text and headingLevels for a fetched page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(HTML, { status: 200 })));
    const res = await POST(req({ url: "https://example.com/book" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.text).toBe("string");
    expect(json.text).toContain("paragraph one");
    expect(Array.isArray(json.headingLevels)).toBe(true);
  });

  it("rejects a non-http url", async () => {
    const res = await POST(req({ url: "ftp://nope" }));
    expect(res.status).toBe(400);
  });

  it("502s on upstream failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 404 })));
    const res = await POST(req({ url: "https://example.com/missing" }));
    expect(res.status).toBe(502);
  });

  it("401s when unauthenticated", async () => {
    authState.userId = null;
    const res = await POST(req({ url: "https://example.com/book" }));
    expect(res.status).toBe(401);
    authState.userId = "u1";
  });
});
