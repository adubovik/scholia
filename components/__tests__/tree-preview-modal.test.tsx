import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TreePreviewModal } from "@/components/TreePreviewModal";
import type { AiPreviewResult } from "@/lib/actions/ai-preview";

// Anchors 1–6: a PREFACE section (1, body 2), an INDEX heading (3) whose subtree
// runs to 5, and one line the AI already dropped (6).
const result: AiPreviewResult = {
  tree: [],
  usage: { totalTokens: 1234, promptTokens: 1000, completionTokens: 234 },
  kept: 5,
  dropped: 1,
  lines: [
    { anchor: 1, last: 2, depth: 0, kind: "heading", title: "Preface", text: "" },
    { anchor: 2, last: 2, depth: 1, kind: "text", title: null, text: "Preface prose." },
    { anchor: 3, last: 5, depth: 0, kind: "heading", title: "Index", text: "" },
    { anchor: 4, last: 4, depth: 1, kind: "text", title: null, text: "Absolute, the, 12" },
    { anchor: 5, last: 5, depth: 1, kind: "text", title: null, text: "Behaviourism, 44" },
    { anchor: 6, last: 6, depth: 1, kind: "dropped", title: null, text: "Produced by a volunteer" },
  ],
};

const renderModal = (onAccept = vi.fn()) => {
  render(<TreePreviewModal result={result} busy={false} error={null} onAccept={onAccept} onCancel={vi.fn()} />);
  return onAccept;
};

describe("TreePreviewModal manual removal", () => {
  it("offers a strike button on kept lines only — an AI-dropped line has no node to restore", () => {
    renderModal();
    expect(screen.queryByLabelText("Remove paragraph 3")).not.toBeNull();
    expect(screen.queryByLabelText("Remove paragraph 6")).toBeNull();
    expect(screen.queryByLabelText("Put back paragraph 6")).toBeNull();
  });

  it("striking a heading takes its whole subtree, and Accept reports those anchors", () => {
    const onAccept = renderModal();
    fireEvent.click(screen.getByLabelText("Remove paragraph 3")); // INDEX, spans 3–5
    // The stats line counts the struck span plus the AI's own drop.
    expect(screen.getByText("4").closest("span")!.textContent).toContain("removed");
    fireEvent.click(screen.getByText("Accept & create"));
    expect(onAccept).toHaveBeenCalledWith([3, 4, 5]);
  });

  it("puts a struck section back from its own line", () => {
    const onAccept = renderModal();
    fireEvent.click(screen.getByLabelText("Remove paragraph 3"));
    expect(screen.queryByLabelText("Remove paragraph 4")).toBeNull(); // swallowed by the strike
    fireEvent.click(screen.getByLabelText("Put back paragraph 3"));
    expect(screen.queryByLabelText("Remove paragraph 4")).not.toBeNull();
    fireEvent.click(screen.getByText("Accept & create"));
    expect(onAccept).toHaveBeenCalledWith([]);
  });
});
