import type { ParaInput, PlannedNode } from "./plan";
import { AI_MODEL, AI_EFFORT } from "./ai-model";

/**
 * AI structure extraction: an alternative to the rule-based `planNodes`.
 *
 * Pipeline: paragraphs → anchored text (one clipped line per paragraph) → a
 * single OpenAI call that returns a nested {h,title,body,children} tree over the
 * anchor numbers → hard-validate (strictly increasing, in-range, no repeats) →
 * map onto `PlannedNode[]`, preserving the app's one-node-per-paragraph model
 * (heading paragraph → node; its `body` paragraphs → child nodes; unmentioned
 * anchors → dropped, no node).
 *
 * The prompt/encoding were tuned in `.scratchpad/` across Berkeley, Nietzsche,
 * Marcus Aurelius and Spinoza — see `.scratchpad/ITERATIONS.md`.
 */

const CLIP = 160;
// Output scales with node count AND reasoning tokens count against this on a
// reasoning model — a ~400-node book emits ~14k JSON tokens before reasoning, so
// keep generous. Very long books still need chunking (see .scratchpad/ITERATIONS.md).
const MAX_COMPLETION_TOKENS = 64000;
const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/** One anchor per paragraph; physical line N == anchor N (no header line). */
export function buildAnchored(paras: ParaInput[]): string {
  return (
    paras
      .map((p, i) => {
        const one = p.text.replace(/\s+/g, " ").trim();
        const clipped = one.length > CLIP ? one.slice(0, CLIP) + " …" : one;
        return `${i + 1}: ${clipped}`;
      })
      .join("\n") + "\n"
  );
}

// Book-agnostic prompt (mirrors .scratchpad/prompts/general-json.md — the id/alias/cut
// identity system, with the Good/Bad worked examples).
const PROMPT = `You recover the structure ALREADY IN a book from an anchored text: numbered lines (anchors), physical line N == anchor N, one paragraph per line clipped to ~160 chars. Recover only the book's own divisions — never invent semantic grouping.

FIND THE HIERARCHY (infer depth from the text; every book differs):
- High level: PART / BOOK / CHAPTER / SECTION headings, prefaces, dedications, introductions.
- Mid level: numbered or titled sub-units — sections "1.", aphorisms, chapters, propositions/definitions/axioms, dialogue turns, entries.
- Leaf: editorial notes/footnotes.
Assign level by actual nesting (a numbered item inside "PART II" is a child of that part; a note after a proposition is a child of that proposition).
TOP LEVEL must list real divisions — never a single root. If the book opens with one title/author line wrapping everything, DROP it; the top-level array holds the actual divisions (Preface, Intro, Part I, …). A top-level array of length 1 is wrong.

KEEP vs DROP:
- DROP (omit the anchor): Project Gutenberg header/footer/license, "Produced by…"/transcriber lines, title-page byline ("by"), standalone author name, author sign-offs, running-header artifacts (a line mashing two heading titles), a heading line immediately repeated on the next line (drop the repeat), and tables of contents / indexes / first-line link-list indexes (fluff — drop them).
- KEEP as their own section: substantial editor/translator introductions, prefaces, dedications (nest their sub-parts too).
- KEEP notes: editorial footnotes/notes stay, re-parented as a LEAF CHILD of the unit they annotate (nearest preceding kept unit). Never drop them.
- When unsure whether a line is fluff, KEEP it as content (do not delete real text).

COMPACT OUTPUT: emit a node ONLY for a real structural unit (a heading/division, a numbered/titled item, or a note). Consecutive plain prose paragraphs belonging to one unit go into that unit's body:[first,last] range — do NOT emit one node per prose paragraph.

IDENTITY (id / alias / cut) — every node carries an identity from its own heading text, so the app can address it as a compound path <ancestor>.<…>.<self> (e.g. I.Ax.I = Part I → Axioms → Axiom I) without re-printing the number already in the prose:
- id — the node's canonical name, taken from the text's OWN enumerator when it has one; NEVER an invented counter. "PROP. XI. God…"→"XI"; "I. By that…"→"I"; "56. He who…"→"56"; "PART I. CONCERNING GOD."→"PART I"; "DEFINITIONS."→"Definitions"; "Note I.—As…"→"NI". Only a kept node with NO enumerator/caption gets a positional index "1","2",… among its siblings. ids are UNIQUE among siblings and contain NO dot.
- alias — the SHORT token an ancestor lends to a descendant's path. "Definitions"→"Def", "Axioms"→"Ax", "Propositions"→"Prop", "PART I"→"I", "THE SECOND BOOK"→id "Book II" alias "II". Set alias equal to id (or null) when there's nothing to shorten (numerals/romans).
- cut — the exact leading substring of THIS node's heading text to strip so the id is not echoed in the prose. Must be a literal prefix. Prefix cut: "PROP. XI. God…" cut "PROP. XI." → shows "God…". Whole-line cut: "DEFINITIONS." cut "DEFINITIONS." → shows nothing (a pure caption / container). null when there's no redundant prefix.

GOOD  "PROP. XI. God, or substance…" → {"h":57,"id":"XI","cut":"PROP. XI.","body":[58,65]}   shows "God…"
BAD   same line → {"h":57,"id":"11"}   (invented "11" duplicates the "XI" still in the prose; no cut)
GOOD  "DEFINITIONS." → {"h":7,"id":"Definitions","alias":"Def","cut":"DEFINITIONS.","children":[{"h":8,"id":"I","cut":"I."},{"h":9,"id":"II","cut":"II."}]}
BAD   "DEFINITIONS." → {"h":7,"id":"1"}   (positional "1" ignores the caption; children can't inherit a "Def" alias)
GOOD  "Note I.—As finite existence involves…" → {"h":45,"id":"NI","cut":"Note I.—"}   shows "As finite existence…"
GOOD  "1. From my grandfather Verus…" → {"h":37,"id":"1","cut":"1."}
BAD   "1. From my grandfather…" → {"h":37,"id":"3"}   (a fresh counter, not the text's own "1")

HARD RULES: anchors only; strictly increasing across the whole tree; never repeat an anchor. body = [first,last] inclusive content anchors a node owns directly (before its children). cut is a literal prefix of h's own text. ids unique among siblings, no dots. Top-level length ≥ 2.

OUTPUT: an object { "nodes": [ … ] } in reading order. Each node is { "h": <anchor>, "id": "<seg>", "alias": "<short>" | null, "cut": "<prefix>" | null, "body": [<first>,<last>] | null, "children": [ … ] | null }.`;

// OpenAI Structured Outputs schema (strict): guarantees a parseable, recursively
// nested tree. Root must be an object; strict mode requires every property listed
// in `required`, so body/children are nullable rather than optional.
const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "book_structure",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { nodes: { type: "array", items: { $ref: "#/$defs/node" } } },
      required: ["nodes"],
      $defs: {
        node: {
          type: "object",
          additionalProperties: false,
          properties: {
            h: { type: "integer" },
            id: { type: "string" },
            alias: { type: ["string", "null"] },
            cut: { type: ["string", "null"] },
            body: { type: ["array", "null"], items: { type: "integer" } },
            children: { type: ["array", "null"], items: { $ref: "#/$defs/node" } },
          },
          required: ["h", "id", "alias", "cut", "body", "children"],
        },
      },
    },
  },
} as const;

export interface AiNode {
  h: number;
  id?: string; // canonical own-id from the text's enumerator ("XI", "PART I", "Definitions", "NI")
  alias?: string | null; // short token ancestors lend to a descendant's path ("Def", "Ax", "I")
  cut?: string | null; // literal prefix of h's text to strip so the id isn't echoed
  body?: [number, number] | number[] | null;
  children?: AiNode[] | null;
}

/** How much of paragraph `text` a node's `cut` removes: the prefix + trailing whitespace. */
function cutLength(text: string, cut: string | null | undefined): number {
  if (!cut || !text.startsWith(cut)) return 0; // not a prefix ⇒ don't shift (graceful)
  let n = cut.length;
  while (n < text.length && /\s/.test(text[n])) n++;
  return n;
}

/** A node owns direct content lines only when body is a well-formed [first,last]. */
function bodyRange(n: AiNode): [number, number] | null {
  return Array.isArray(n.body) && n.body.length === 2 ? [n.body[0], n.body[1]] : null;
}

export interface AiOptions {
  apiKey: string;
  model?: string;
  effort?: string;
  fetchImpl?: typeof fetch; // injectable for tests
}

export interface AiUsage {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
}

/** Call OpenAI once; return the raw assistant text + token usage. Throws on transport/HTTP errors. */
async function callOpenAI(
  anchored: string,
  opts: AiOptions,
): Promise<{ content: string; usage: AiUsage }> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? AI_MODEL,
      reasoning_effort: opts.effort ?? AI_EFFORT,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      response_format: RESPONSE_FORMAT,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: anchored },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content");
  const u = json.usage ?? {};
  return {
    content,
    usage: {
      totalTokens: u.total_tokens ?? 0,
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
    },
  };
}

/** Extract the JSON tree from an assistant reply (tolerates fences / stray prose). */
export function parseTree(raw: string): AiNode[] {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
  const tryParse = (s: string) => {
    const j = JSON.parse(s);
    return Array.isArray(j) ? j : (j.nodes ?? j.tree ?? null);
  };
  try {
    const arr = tryParse(cleaned);
    if (arr) return arr;
  } catch {
    /* fall through to bracket extraction */
  }
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end > start) {
    const arr = tryParse(cleaned.slice(start, end + 1));
    if (arr) return arr;
  }
  throw new Error("Could not parse a JSON structure from the AI response");
}

/** Flatten to the anchor sequence in reading order (h, then body>h, then children). */
function anchorSequence(nodes: AiNode[]): number[] {
  const seq: number[] = [];
  const walk = (n: AiNode) => {
    if (typeof n.h !== "number") throw new Error("AI node missing numeric 'h'");
    seq.push(n.h);
    const b = bodyRange(n);
    if (b) for (let a = b[0]; a <= b[1]; a++) if (a > n.h) seq.push(a);
    for (const c of n.children ?? []) walk(c);
  };
  for (const n of nodes) walk(n);
  return seq;
}

/** Hard checks (throw): every anchor in [1,count], strictly increasing (⇒ no repeats). */
export function validateTree(nodes: AiNode[], count: number): void {
  const seq = anchorSequence(nodes);
  if (seq.length === 0) throw new Error("AI structure is empty");
  let prev = 0;
  for (const a of seq) {
    if (a < 1 || a > count) throw new Error(`AI anchor ${a} out of range 1..${count}`);
    if (a <= prev) throw new Error(`AI anchors not strictly increasing at ${a} (after ${prev})`);
    prev = a;
  }
}

/**
 * Map a validated AI tree onto PlannedNode[] (one node per kept paragraph).
 * `drop` holds anchors the reader struck out in the preview: those paragraphs
 * get no node, and a struck heading's surviving children re-parent onto its own
 * parent (the preview strikes a whole subtree at once, so this is only reached
 * for the roots of the strike).
 */
export function treeToPlanned(
  nodes: AiNode[],
  paras: ParaInput[],
  newId: () => string,
  drop: ReadonlySet<number> = new Set(),
): PlannedNode[] {
  const out: PlannedNode[] = [];
  const posByParent = new Map<string | null, number>();
  const nextPos = (parentId: string | null) => {
    const key = parentId ?? "\0root";
    const n = posByParent.get(key) ?? 0;
    posByParent.set(key, n + 1);
    return n;
  };
  const emit = (
    anchor: number, parentId: string | null,
    label: string | null, alias: string | null, cut: string | null,
  ): string => {
    const p = paras[anchor - 1];
    const id = newId();
    out.push({
      id, parentId, position: nextPos(parentId), label, alias, title: null,
      paragraphIndex: anchor - 1,
      startOffset: p.start + cutLength(p.text, cut), // shift past the cut prefix (like proseStart)
      endOffset: p.end,
    });
    return id;
  };
  const walk = (n: AiNode, parentId: string | null) => {
    // heading node: own-id → label, alias, cut applied to its passage
    const hId = drop.has(n.h)
      ? parentId
      : emit(n.h, parentId, n.id?.trim() || null, n.alias?.trim() || null, n.cut ?? null);
    // body paragraphs (folded prose) become label-less child nodes → positional id at render
    const b = bodyRange(n);
    if (b) for (let a = b[0]; a <= b[1]; a++) if (a !== n.h && !drop.has(a)) emit(a, hId, null, null, null);
    for (const c of n.children ?? []) walk(c, hId);
  };
  for (const n of nodes) walk(n, null);
  return out;
}

// ── Preview (for the confirm-before-create modal) ─────────────────────────────

export interface PreviewLine {
  anchor: number; // 1-based paragraph number this line shows
  last: number; // last anchor of the subtree rooted here (=== anchor for a leaf)
  depth: number;
  kind: "heading" | "text" | "dropped";
  title: string | null;
  text: string; // clipped
}

const clip = (s: string) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > CLIP ? one.slice(0, CLIP) + " …" : one;
};

/**
 * Reading-order preview: every paragraph as one line. Kept paragraphs carry their
 * tree depth (heading paragraphs → "heading", their body/child prose → "text");
 * unmentioned paragraphs appear in place as "dropped" (rendered red in the modal).
 */
export function buildPreview(nodes: AiNode[], paras: ParaInput[]): PreviewLine[] {
  const byAnchor = new Map<number, PreviewLine>();
  /** Returns the last anchor this node's subtree reaches, so a heading line knows
   * the whole span striking it out would remove (anchors ascend in reading order). */
  const walk = (n: AiNode, depth: number): number => {
    const full = paras[n.h - 1]?.text ?? "";
    const id = n.id?.trim() || null;
    const remaining = full.slice(cutLength(full, n.cut)); // what survives after the cut prefix
    const isHeading = remaining.trim() === ""; // pure caption / container (nothing left to show)
    const line: PreviewLine = { anchor: n.h, last: n.h, depth, kind: isHeading ? "heading" : "text", title: id, text: clip(remaining) };
    byAnchor.set(n.h, line);
    const b = bodyRange(n);
    if (b) for (let a = b[0]; a <= b[1]; a++) if (a !== n.h) byAnchor.set(a, { anchor: a, last: a, depth: depth + 1, kind: "text", title: null, text: clip(paras[a - 1]?.text ?? "") });
    if (b) line.last = Math.max(line.last, b[1]);
    for (const c of n.children ?? []) line.last = Math.max(line.last, walk(c, depth + 1));
    return line.last;
  };
  for (const n of nodes) walk(n, 0);

  const out: PreviewLine[] = [];
  let lastDepth = 0;
  for (let a = 1; a <= paras.length; a++) {
    const kept = byAnchor.get(a);
    if (kept) {
      out.push(kept);
      lastDepth = kept.depth;
    } else {
      out.push({ anchor: a, last: a, depth: lastDepth, kind: "dropped", title: null, text: clip(paras[a - 1].text) });
    }
  }
  return out;
}

export interface AiResult {
  tree: AiNode[];
  usage: AiUsage;
}

/** AI structure pass: anchored text → OpenAI (structured output) → validated tree + usage. */
export async function aiStructure(paras: ParaInput[], opts: AiOptions): Promise<AiResult> {
  if (paras.length === 0) return { tree: [], usage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 } };
  const { content, usage } = await callOpenAI(buildAnchored(paras), opts);
  const tree = parseTree(content);
  validateTree(tree, paras.length);
  return { tree, usage };
}

/** Convenience: full path to PlannedNode[] (used by tests / direct callers). */
export async function planNodesWithAi(
  paras: ParaInput[],
  newId: () => string,
  opts: AiOptions,
): Promise<PlannedNode[]> {
  const { tree } = await aiStructure(paras, opts);
  return treeToPlanned(tree, paras, newId);
}
