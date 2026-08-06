import { describe, it, expect } from "vitest";
import { idPaths } from "@/lib/tree/number";
import type { TreeNode } from "@/lib/tree/build";

// Minimal tree factory — id + optional label/alias + children drive idPaths.
const n = (
  id: string,
  opts: { label?: string | null; alias?: string | null; children?: TreeNode[] } = {},
): TreeNode => ({
  id, label: opts.label ?? null, alias: opts.alias ?? null, title: null, text: "",
  sourceId: "s", startOffset: 0, annotations: [], nodeAnnotation: null, children: opts.children ?? [],
});

describe("idPaths", () => {
  it("falls back to positional numbering when no node has an id (legacy/flat docs)", () => {
    const tree = [n("a", { children: [n("a1"), n("a2", { children: [n("a2a")] })] }), n("b")];
    const { full, short } = idPaths(tree);
    expect(Object.fromEntries(full)).toEqual({
      a: "1", a1: "1.1", a2: "1.2", a2a: "1.2.1", b: "2",
    });
    // short = the node's own segment alone (a2 is the 2nd child of a → "2")
    expect(Object.fromEntries(short)).toEqual({ a: "1", a1: "1", a2: "2", a2a: "1", b: "2" });
  });

  it("builds ancestor-alias + own-id paths (rule 2), own-id alone for short (rule 1)", () => {
    // PART I (alias I) → Propositions (alias Prop) → Prop LXI (id LXI)
    const tree = [
      n("part", {
        label: "PART I", alias: "I",
        children: [
          n("props", {
            label: "Propositions", alias: "Prop",
            children: [n("p61", { label: "LXI" })],
          }),
        ],
      }),
    ];
    const { full, short } = idPaths(tree);
    expect(full.get("p61")).toBe("I.Prop.LXI"); // ancestors as aliases, self full
    expect(short.get("p61")).toBe("LXI"); // own segment
    expect(full.get("part")).toBe("PART I"); // top-level: self full id, no ancestors
    expect(full.get("props")).toBe("I.Propositions"); // ancestor alias + own full id
  });

  it("gives a folded body paragraph (no label) a positional segment under its parent", () => {
    const tree = [n("prop", { label: "II", alias: "II", children: [n("proof")] })];
    const { full } = idPaths(tree);
    expect(full.get("proof")).toBe("II.1"); // parent alias + positional own id
  });
});
