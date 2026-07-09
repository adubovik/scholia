import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SelectionPopover } from "@/components/SelectionPopover";

const create = vi.fn(async () => "new-id");
vi.mock("@/lib/actions/annotations", () => ({ createInlineAnnotation: (...a: unknown[]) => create(...a) }));

// A reading root with a single-node source run.
function mountRoot(): HTMLElement {
  const root = document.createElement("div");
  root.id = "reading-root";
  root.innerHTML =
    `<section data-node-id="n1"><p>` +
      `<span data-source-id="s1" data-char-start="0">Hello world</span>` +
    `</p></section>`;
  document.body.appendChild(root);
  return root;
}

describe("SelectionPopover", () => {
  beforeEach(() => { document.body.innerHTML = ""; create.mockClear(); });

  it("renders nothing without a selection", () => {
    mountRoot();
    const { container } = render(<SelectionPopover documentId="d1" rootId="reading-root" />);
    expect(container.querySelector(".selection-popover")).toBeNull();
  });

  it("shows swatches on a valid selection and creates on click", () => {
    const root = mountRoot();
    render(<SelectionPopover documentId="d1" rootId="reading-root" />);

    const textNode = root.querySelector('[data-char-start="0"]')!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5); // "Hello"
    vi.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => range,
      removeAllRanges: () => {},
    } as unknown as Selection);

    fireEvent.mouseUp(document);

    const swatches = document.querySelectorAll(".selection-popover .swatch");
    expect(swatches.length).toBe(4);

    fireEvent.click(swatches[0]); // yellow
    expect(create).toHaveBeenCalledWith({ documentId: "d1", sourceId: "s1", startOffset: 0, endOffset: 5, color: "yellow" });
  });
});
