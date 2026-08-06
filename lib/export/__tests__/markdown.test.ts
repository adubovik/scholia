import { describe, it, expect } from "vitest";
import { toMarkdown, filenameStem } from "@/lib/export/markdown";
import type { TreeNode } from "@/lib/tree/build";
import type { InlineAnnotationView, NodeAnnotationView } from "@/lib/annotations/types";

const ann = (id: string, startOffset: number, endOffset: number, note: string | null, tags: string[] = []): InlineAnnotationView =>
  ({ id, startOffset, endOffset, color: "yellow", note, tags, authorId: "u", createdAt: "2026-01-01T00:00:00.000Z" });

const nodeAnn = (note: string, tags: string[] = []): NodeAnnotationView =>
  ({ id: "na", nodeId: "a", note, tags, authorId: "u", createdAt: "2026-01-01T00:00:00.000Z" });

const n = (id: string, text: string, over: Partial<TreeNode> = {}): TreeNode => ({
  id, label: null, alias: null, title: null, text, sourceId: "s", startOffset: 0,
  annotations: [], nodeAnnotation: null, children: [], ...over,
});

const numbers = (tree: TreeNode[]) => {
  const m = new Map<string, string>();
  const walk = (ns: TreeNode[], p: string) => ns.forEach((x, i) => {
    const num = p ? `${p}.${i + 1}` : `${i + 1}`;
    m.set(x.id, num);
    walk(x.children, num);
  });
  walk(tree, "");
  return m;
};

const run = (tree: TreeNode[]) => toMarkdown("Title", tree, numbers(tree));

describe("toMarkdown", () => {
  it("bolds highlights and numbers them in reading order", () => {
    const tree = [n("a", "one two three", { annotations: [ann("y", 8, 13, "second"), ann("x", 0, 3, "first")] })];
    expect(run(tree)).toBe(
      "# Title\n\n## 1\n\n**one**(1) two **three**(2)\n\n**Inline notes**:\n\n1: first\n\n2: second\n",
    );
  });

  it("omits blocks with no annotation, keeping annotated descendants", () => {
    const tree = [n("a", "silent", { children: [n("b", "loud", { nodeAnnotation: nodeAnn("on the block", ["tag"]) })] })];
    expect(run(tree)).toBe("# Title\n\n## 1.1\n\nloud\n\n**Block note**: on the block #tag\n");
  });

  it("bolds an overlapping pair as one run, each marker at its own end", () => {
    const tree = [n("a", "abcdef", { annotations: [ann("x", 0, 4, "first"), ann("y", 2, 6, "second")] })];
    expect(run(tree)).toContain("**abcd(1)ef**(2)");
  });

  it("numbers a highlight with no note and lists it as {empty}", () => {
    const tree = [n("a", "abcdef", { annotations: [ann("x", 0, 3, null), ann("y", 3, 6, "  ")] })];
    const out = run(tree);
    expect(out).toContain("**abc(1)def**(2)"); // adjacent runs merge into one bold span
    expect(out).toContain("1: {empty}\n\n2: {empty}");
  });

  it("closes the marks across a paragraph break and keeps padding outside them", () => {
    const tree = [n("a", "one\n\ntwo ", { annotations: [ann("x", 0, 9, "spans")] })];
    expect(run(tree)).toContain("**one**\n\n**two**(1)");
  });

  it("titles the section and carries tags on notes", () => {
    const tree = [n("a", "text", { title: "Proem", annotations: [ann("x", 0, 4, "note", ["greek", "meter"])] })];
    const out = run(tree);
    expect(out).toContain("## 1 — Proem");
    expect(out).toContain("1: note #greek #meter");
  });
});

describe("filenameStem", () => {
  it("keeps non-ASCII letters, strips path/header-hostile characters", () => {
    expect(filenameStem("Ἰλιάς / book 1")).toBe("Ἰλιάς-book-1");
    expect(filenameStem('a"b:c*d')).toBe("abcd");
    expect(filenameStem("///")).toBe("document");
  });
});
