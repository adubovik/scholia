import { describe, it, expect, vi } from "vitest";
import {
  parseTree,
  validateTree,
  treeToPlanned,
  buildPreview,
  aiStructure,
  type AiNode,
} from "../ai-structure";
import type { ParaInput } from "../plan";

const paras: ParaInput[] = [
  { start: 0, end: 10, text: "DEDICATION" }, // 1
  { start: 11, end: 24, text: "To the Reader, a long prose line ".repeat(6) }, // 2 body
  { start: 25, end: 30, text: "by Someone" }, // 3 dropped (fluff)
  { start: 31, end: 38, text: "PREFACE" }, // 4 heading
  { start: 39, end: 50, text: "Preface prose here." }, // 5 body
  { start: 51, end: 70, text: "1. The first numbered section of the work." }, // 6 section
];

const tree: AiNode[] = [
  { h: 1, title: "DEDICATION", body: [1, 2], children: null },
  {
    h: 4,
    title: "PREFACE",
    body: [4, 5],
    children: [{ h: 6, title: "§1", body: null, children: null }],
  },
];

describe("validateTree", () => {
  it("accepts a strictly-increasing in-range tree", () => {
    expect(() => validateTree(tree, paras.length)).not.toThrow();
  });
  it("rejects an out-of-order tree", () => {
    const bad: AiNode[] = [
      { h: 4, title: "B", body: null, children: null },
      { h: 2, title: "A", body: null, children: null },
    ];
    expect(() => validateTree(bad, paras.length)).toThrow(/increasing/);
  });
  it("rejects an out-of-range anchor", () => {
    expect(() => validateTree([{ h: 99, title: "x", body: null, children: null }], paras.length)).toThrow(/range/);
  });
});

describe("treeToPlanned", () => {
  it("maps one node per kept paragraph, dropping unmentioned anchors", () => {
    let seq = 0;
    const planned = treeToPlanned(tree, paras, () => `n${seq++}`);
    // anchors 1,2,4,5,6 kept (5 nodes); anchor 3 dropped.
    expect(planned.map((p) => p.paragraphIndex)).toEqual([0, 1, 3, 4, 5]);
    // parentage: para2 under para1; para5 & para6 under para4.
    const byIdx = new Map(planned.map((p) => [p.paragraphIndex, p]));
    expect(byIdx.get(1)!.parentId).toBe(byIdx.get(0)!.id); // body under DEDICATION
    expect(byIdx.get(4)!.parentId).toBe(byIdx.get(3)!.id); // prose under PREFACE
    expect(byIdx.get(5)!.parentId).toBe(byIdx.get(3)!.id); // §1 under PREFACE
    expect(byIdx.get(0)!.parentId).toBeNull();
    expect(byIdx.get(3)!.parentId).toBeNull();
    // offsets come straight from the paragraph
    expect(byIdx.get(0)!.startOffset).toBe(0);
    expect(byIdx.get(5)!.title).toBe("§1");
  });
});

describe("buildPreview", () => {
  it("returns one reading-order line per paragraph, marking dropped + truncating", () => {
    const lines = buildPreview(tree, paras);
    expect(lines).toHaveLength(paras.length);
    expect(lines[0].kind).toBe("heading"); // DEDICATION (title == text)
    expect(lines[1].kind).toBe("text");
    expect(lines[1].depth).toBe(1); // body nested under its heading
    expect(lines[2].kind).toBe("dropped"); // anchor 3
    expect(lines[5].title).toBe("§1");
    expect(lines.filter((l) => l.kind === "dropped")).toHaveLength(1);
    // long line clipped to ~160 chars + ellipsis
    expect(lines[1].text.endsWith("…")).toBe(true);
    expect(lines[1].text.length).toBeLessThan(170);
  });
});

describe("parseTree", () => {
  it("parses {nodes:[…]}, bare arrays, and fenced JSON", () => {
    expect(parseTree(JSON.stringify({ nodes: tree }))).toHaveLength(2);
    expect(parseTree(JSON.stringify(tree))).toHaveLength(2);
    expect(parseTree("```json\n" + JSON.stringify(tree) + "\n```")).toHaveLength(2);
  });
});

describe("aiStructure (structured output plumbing)", () => {
  it("sends json_schema + reasoning_effort and returns tree + token usage", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.reasoning_effort).toBe("medium");
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ nodes: tree }) } }],
          usage: { total_tokens: 1234, prompt_tokens: 1000, completion_tokens: 234 },
        }),
      } as unknown as Response;
    });
    const { tree: got, usage } = await aiStructure(paras, { apiKey: "sk-test", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(got).toHaveLength(2);
    expect(usage.totalTokens).toBe(1234);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("throws on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => "bad key" }) as unknown as Response);
    await expect(aiStructure(paras, { apiKey: "x", fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(/401/);
  });
});
