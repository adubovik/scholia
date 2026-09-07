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
import { AI_EFFORT } from "../ai-model";

const paras: ParaInput[] = [
  { start: 0, end: 10, text: "DEDICATION" }, // 1
  { start: 11, end: 24, text: "To the Reader, a long prose line ".repeat(6) }, // 2 body
  { start: 25, end: 30, text: "by Someone" }, // 3 dropped (fluff)
  { start: 31, end: 38, text: "PREFACE" }, // 4 heading
  { start: 39, end: 50, text: "Preface prose here." }, // 5 body
  { start: 51, end: 70, text: "1. The first numbered section of the work." }, // 6 section
];

const tree: AiNode[] = [
  { h: 1, id: "Dedication", alias: null, cut: "DEDICATION", body: [1, 2], children: null },
  {
    h: 4,
    id: "Preface",
    alias: null,
    cut: "PREFACE",
    body: [4, 5],
    children: [{ h: 6, id: "1", alias: null, cut: "1.", body: null, children: null }],
  },
];

describe("validateTree", () => {
  it("accepts a strictly-increasing in-range tree", () => {
    expect(() => validateTree(tree, paras.length)).not.toThrow();
  });
  it("rejects an out-of-order tree", () => {
    const bad: AiNode[] = [
      { h: 4, id: "B", body: null, children: null },
      { h: 2, id: "A", body: null, children: null },
    ];
    expect(() => validateTree(bad, paras.length)).toThrow(/increasing/);
  });
  it("rejects an out-of-range anchor", () => {
    expect(() => validateTree([{ h: 99, id: "x", body: null, children: null }], paras.length)).toThrow(/range/);
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
    // id lands in label; a body paragraph (no cut) keeps the paragraph's own start
    expect(byIdx.get(5)!.label).toBe("1");
    expect(byIdx.get(1)!.startOffset).toBe(11); // body para, no cut → paragraph start
    // cut shifts the start past the prefix + its trailing space ("1. " = 3 chars)
    expect(byIdx.get(5)!.startOffset).toBe(51 + 3);
  });

  it("drops struck anchors and re-parents a struck heading's survivors upward", () => {
    let seq = 0;
    // Strike PREFACE itself (anchor 4) but not its prose (5) or §1 (6).
    const planned = treeToPlanned(tree, paras, () => `n${seq++}`, new Set([4]));
    expect(planned.map((p) => p.paragraphIndex)).toEqual([0, 1, 4, 5]);
    const byIdx = new Map(planned.map((p) => [p.paragraphIndex, p]));
    expect(byIdx.get(4)!.parentId).toBeNull(); // PREFACE was top-level → survivors root
    expect(byIdx.get(5)!.parentId).toBeNull();
  });
});

describe("buildPreview", () => {
  it("returns one reading-order line per paragraph, marking dropped + truncating", () => {
    const lines = buildPreview(tree, paras);
    expect(lines).toHaveLength(paras.length);
    expect(lines[0].kind).toBe("heading"); // DEDICATION: whole-line cut leaves nothing
    expect(lines[1].kind).toBe("text");
    expect(lines[1].depth).toBe(1); // body nested under its heading
    expect(lines[2].kind).toBe("dropped"); // anchor 3
    expect(lines[5].title).toBe("1"); // preview shows the id as the label
    expect(lines.filter((l) => l.kind === "dropped")).toHaveLength(1);
    // long line clipped to ~160 chars + ellipsis
    expect(lines[1].text.endsWith("…")).toBe(true);
    expect(lines[1].text.length).toBeLessThan(170);
  });

  it("carries each line's anchor and the last anchor of its subtree", () => {
    const lines = buildPreview(tree, paras);
    expect(lines.map((l) => l.anchor)).toEqual([1, 2, 3, 4, 5, 6]);
    // Striking PREFACE (anchor 4) must take its body (5) and its child §1 (6).
    expect(lines[3].last).toBe(6);
    expect(lines[0].last).toBe(2); // DEDICATION + its one body paragraph
    expect(lines[2].last).toBe(3); // a dropped line stands alone
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
      expect(body.reasoning_effort).toBe(AI_EFFORT);
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

  it("replays the conversation on a follow-up: anchored text, each proposed tree, each request", async () => {
    let sent: { role: string; content: string }[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string).messages;
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ nodes: tree }) } }], usage: {} }),
      } as unknown as Response;
    });
    await aiStructure(paras, { apiKey: "sk-test", fetchImpl: fetchImpl as unknown as typeof fetch }, [
      { tree, prompt: "Remove everything after anchor 4" },
    ]);
    expect(sent.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(sent[1].content).toContain("1: DEDICATION"); // the anchored text stays turn one
    expect(JSON.parse(sent[2].content)).toEqual({ nodes: tree }); // what the model already proposed
    expect(sent[3].content).toContain("Remove everything after anchor 4");
    expect(sent[3].content).toContain("not a diff"); // nudged to restate the whole tree
  });

  it("throws on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => "bad key" }) as unknown as Response);
    await expect(aiStructure(paras, { apiKey: "x", fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(/401/);
  });
});
