// Auto-links §-references in note prose. `§1.1` targets a text block by its reading
// number; `§1.1_1` targets the first inline highlight of that block (mirroring the
// 2.1₁ labels the annotation panel shows). A remark plugin so it runs on mdast *text*
// nodes only — code spans and existing links are already separate node types, so we
// never linkify inside `§1.1` in backticks or a hand-written [link](§…).

// The slice of mdast we touch. No @types/mdast in the tree, and these three fields are
// all the transform reads/writes, so a local shape beats pulling in the types package.
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

// § + a dotted number (1.1 / IV.Prop.LXI), then an optional _index for an inline
// highlight. The segment class excludes `.` at the edges so a trailing sentence period
// ("see §1.1.") isn't swallowed into the reference.
const REF = /§([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*(?:_\d+)?)/g;

// href scheme the NoteMarkdown `a` override recognises → scrollToSection(ref). ASCII
// only + all-unreserved chars, so react-markdown's URL encoding leaves it byte-for-byte
// (a `§` in the href gets percent-encoded to %C2%A7, which wouldn't round-trip). A hash
// so the default urlTransform keeps it (custom `scheme:` URLs get stripped).
const HREF_PREFIX = "#xref-";
export const refHref = (ref: string) => `${HREF_PREFIX}${ref}`;
export const refFromHref = (href: string | undefined): string | null =>
  href && href.startsWith(HREF_PREFIX) ? href.slice(HREF_PREFIX.length) : null;

/** Split one text node's value on §-references, emitting link nodes for each match. */
function splitText(node: MdNode): MdNode[] {
  const value = node.value!;
  const out: MdNode[] = [];
  let last = 0;
  for (const m of value.matchAll(REF)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", value: value.slice(last, start) });
    out.push({ type: "link", url: refHref(m[1]), children: [{ type: "text", value: m[0] }] });
    last = start + m[0].length;
  }
  if (out.length === 0) return [node]; // no reference — leave the node untouched
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

export function remarkSectionRefs() {
  const walk = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((c) => {
      // Never descend into an existing link — no nested <a>.
      if (c.type === "link" || c.type === "linkReference") return [c];
      if (c.type === "text" && c.value !== undefined) return splitText(c);
      walk(c);
      return [c];
    });
  };
  return (tree: MdNode) => walk(tree);
}
