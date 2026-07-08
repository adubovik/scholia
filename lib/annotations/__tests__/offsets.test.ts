import { describe, it, expect, beforeEach } from "vitest";
import { rangeToOffsets } from "@/lib/annotations/offsets";

// Build a reading root: one node with two adjacent runs, plus a second node.
function build(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML =
    `<section data-node-id="n1">` +
      `<p><span data-source-id="s1" data-char-start="0">Hello </span>` +
      `<span data-source-id="s1" data-char-start="6">world</span></p>` +
    `</section>` +
    `<section data-node-id="n2">` +
      `<p><span data-source-id="s1" data-char-start="20">Next</span></p>` +
    `</section>`;
  document.body.appendChild(root);
  return root;
}

describe("rangeToOffsets", () => {
  let root: HTMLElement;
  beforeEach(() => { document.body.innerHTML = ""; root = build(); });

  const textOf = (charStart: number) =>
    root.querySelector<HTMLElement>(`[data-char-start="${charStart}"]`)!.firstChild!;

  it("maps a selection within one run to absolute offsets", () => {
    const r = document.createRange();
    r.setStart(textOf(0), 0); // "Hello " → H
    r.setEnd(textOf(0), 5);   // through "Hello"
    expect(rangeToOffsets(r, root)).toEqual({ sourceId: "s1", startOffset: 0, endOffset: 5 });
  });

  it("maps a selection spanning two runs in the SAME node", () => {
    const r = document.createRange();
    r.setStart(textOf(0), 0); // absolute 0
    r.setEnd(textOf(6), 5);   // 6 + 5 = 11
    expect(rangeToOffsets(r, root)).toEqual({ sourceId: "s1", startOffset: 0, endOffset: 11 });
  });

  it("returns null for a collapsed selection", () => {
    const r = document.createRange();
    r.setStart(textOf(0), 2); r.setEnd(textOf(0), 2);
    expect(rangeToOffsets(r, root)).toBeNull();
  });

  it("returns null when the selection crosses a node boundary", () => {
    const r = document.createRange();
    r.setStart(textOf(0), 0);  // node n1
    r.setEnd(textOf(20), 4);   // node n2
    expect(rangeToOffsets(r, root)).toBeNull();
  });

  it("returns null when an endpoint is outside any source run", () => {
    const outside = document.createElement("span");
    outside.textContent = "chrome";
    root.appendChild(outside);
    const r = document.createRange();
    r.setStart(outside.firstChild!, 0); r.setEnd(outside.firstChild!, 3);
    expect(rangeToOffsets(r, root)).toBeNull();
  });

  it("returns null when the selection spans two different sources", () => {
    const container = document.createElement("section");
    container.setAttribute("data-node-id", "cross-node");
    container.innerHTML =
      `<span data-source-id="s1" data-char-start="0">First</span>` +
      `<span data-source-id="s2" data-char-start="0">Second</span>`;
    document.body.appendChild(container);

    const run1 = container.querySelector<HTMLElement>('[data-source-id="s1"]')!;
    const run2 = container.querySelector<HTMLElement>('[data-source-id="s2"]')!;
    const r = document.createRange();
    r.setStart(run1.firstChild!, 1); // offset 1 in run1
    r.setEnd(run2.firstChild!, 3);   // offset 3 in run2
    expect(rangeToOffsets(r, root)).toBeNull();
  });

  it("returns null when an endpoint's run is outside the given root", () => {
    const otherRoot = document.createElement("div");
    otherRoot.innerHTML =
      `<section data-node-id="external">` +
      `<span data-source-id="s1" data-char-start="0">External</span>` +
      `</section>`;
    document.body.appendChild(otherRoot);

    const externalRun = otherRoot.querySelector<HTMLElement>('[data-source-id="s1"]')!;
    const r = document.createRange();
    r.setStart(externalRun.firstChild!, 0);
    r.setEnd(externalRun.firstChild!, 3);
    expect(rangeToOffsets(r, root)).toBeNull();
  });
});
