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

// Book-agnostic prompt (mirrors .scratchpad/prompts/general-json.md, plus the
// duplicated-heading fix found while testing Nietzsche).
const PROMPT = `You recover the structure ALREADY IN a book from an anchored text: numbered lines (anchors), physical line N == anchor N, one paragraph per line clipped to ~160 chars. Recover only the book's own divisions — never invent semantic grouping.

FIND THE HIERARCHY (infer depth from the text; every book differs):
- High level: PART / BOOK / CHAPTER / SECTION headings, prefaces, dedications, introductions.
- Mid level: numbered or titled sub-units — sections "1.", aphorisms, chapters, propositions/definitions/axioms, dialogue turns, entries.
- Leaf: editorial notes/footnotes.
Assign level by actual nesting (a numbered item inside "PART II" is a child of that part; a note after a proposition is a child of that proposition).

KEEP vs DROP:
- DROP (omit the anchor): Project Gutenberg header/footer/license, "Produced by…"/transcriber lines, title-page byline ("by"), standalone author name, author sign-offs, running-header artifacts (a line mashing two heading titles), a heading line immediately repeated on the next line (drop the repeat), and link-list tables of contents.
- KEEP as their own section: substantial editor/translator introductions, prefaces, dedications (nest their sub-parts too).
- KEEP notes: editorial footnotes/notes stay, re-parented as a LEAF CHILD of the unit they annotate (nearest preceding kept unit). Never drop them.
- When unsure whether a line is fluff, KEEP it as content (do not delete real text).

COMPACT OUTPUT: emit a node ONLY for a real structural unit (a heading/division, a numbered/titled item, or a note). Consecutive plain prose paragraphs belonging to one unit go into that unit's body:[first,last] range — do NOT emit one node per prose paragraph.

HARD RULES: anchors only; strictly increasing across the whole tree; never repeat an anchor. body = [first,last] inclusive content anchors a node owns directly (before its children).

OUTPUT: an object { "nodes": [ … ] } in reading order. Each node is { "h": <anchor>, "title": "<short label>", "body": [<first>,<last>] | null, "children": [ … ] | null }.
- title: short (heading text, or "§7", "Book II", "Prop. 14").
- body: [first,last] inclusive when the node owns content lines directly, else null.
- children: nested nodes, else null.`;

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
            title: { type: "string" },
            body: { type: ["array", "null"], items: { type: "integer" } },
            children: { type: ["array", "null"], items: { $ref: "#/$defs/node" } },
          },
          required: ["h", "title", "body", "children"],
        },
      },
    },
  },
} as const;

export interface AiNode {
  h: number;
  title?: string;
  body?: [number, number] | number[] | null;
  children?: AiNode[] | null;
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

/** Map a validated AI tree onto PlannedNode[] (one node per kept paragraph). */
export function treeToPlanned(
  nodes: AiNode[],
  paras: ParaInput[],
  newId: () => string,
): PlannedNode[] {
  const out: PlannedNode[] = [];
  const posByParent = new Map<string | null, number>();
  const nextPos = (parentId: string | null) => {
    const key = parentId ?? "\0root";
    const n = posByParent.get(key) ?? 0;
    posByParent.set(key, n + 1);
    return n;
  };
  const emit = (anchor: number, parentId: string | null, title: string | null): string => {
    const p = paras[anchor - 1];
    const id = newId();
    out.push({
      id, parentId, position: nextPos(parentId), label: null, title,
      paragraphIndex: anchor - 1, startOffset: p.start, endOffset: p.end,
    });
    return id;
  };
  const walk = (n: AiNode, parentId: string | null) => {
    const hId = emit(n.h, parentId, n.title?.trim() || null);
    const b = bodyRange(n);
    if (b) for (let a = b[0]; a <= b[1]; a++) if (a !== n.h) emit(a, hId, null);
    for (const c of n.children ?? []) walk(c, hId);
  };
  for (const n of nodes) walk(n, null);
  return out;
}

// ── Preview (for the confirm-before-create modal) ─────────────────────────────

export interface PreviewLine {
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
  const walk = (n: AiNode, depth: number) => {
    const full = paras[n.h - 1]?.text ?? "";
    const title = n.title?.trim() || null;
    const isHeading = !!title && title === full.replace(/\s+/g, " ").trim();
    byAnchor.set(n.h, { depth, kind: isHeading ? "heading" : "text", title, text: clip(full) });
    const b = bodyRange(n);
    if (b) for (let a = b[0]; a <= b[1]; a++) if (a !== n.h) byAnchor.set(a, { depth: depth + 1, kind: "text", title: null, text: clip(paras[a - 1]?.text ?? "") });
    for (const c of n.children ?? []) walk(c, depth + 1);
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
      out.push({ depth: lastDepth, kind: "dropped", title: null, text: clip(paras[a - 1].text) });
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
