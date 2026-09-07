import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TreePreviewModal, type PreviewTurn } from "@/components/TreePreviewModal";
import type { AiPreviewResult } from "@/lib/actions/ai-preview";

// Anchors 1–6: a PREFACE section (1, body 2), an INDEX heading (3) whose subtree
// runs to 5, and one line the AI already dropped (6).
const result: AiPreviewResult = {
  tree: [{ h: 1, id: "Preface", alias: null, cut: null, body: [1, 2], children: null }],
  usage: { totalTokens: 1234, promptTokens: 1000, completionTokens: 234 },
  model: "gpt-5.4",
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

// A second reply, as if a follow-up had asked for the index to go.
const trimmed: AiPreviewResult = {
  ...result,
  tree: [{ h: 1, id: "Preface", alias: null, cut: null, body: [1, 2], children: null }],
  usage: { totalTokens: 900, promptTokens: 800, completionTokens: 100 },
  lines: result.lines.map((l) => (l.anchor >= 3 ? { ...l, kind: "dropped" as const } : l)),
};

const opening: PreviewTurn = { prompt: null, result };

const renderModal = (turns: PreviewTurn[] = [opening], handlers: { onAccept?: () => void; onSend?: () => void } = {}) => {
  const onAccept = handlers.onAccept ?? vi.fn();
  const onSend = handlers.onSend ?? vi.fn();
  render(
    <TreePreviewModal turns={turns} busy={false} error={null} onAccept={onAccept} onSend={onSend} onCancel={vi.fn()} />,
  );
  return { onAccept, onSend };
};

describe("TreePreviewModal manual removal", () => {
  it("offers a strike button on kept lines only — an AI-dropped line has no node to restore", () => {
    renderModal();
    expect(screen.queryByLabelText("Remove paragraph 3")).not.toBeNull();
    expect(screen.queryByLabelText("Remove paragraph 6")).toBeNull();
    expect(screen.queryByLabelText("Put back paragraph 6")).toBeNull();
  });

  it("striking a heading takes its whole subtree, and Accept reports those anchors", () => {
    const { onAccept } = renderModal();
    fireEvent.click(screen.getByLabelText("Remove paragraph 3")); // INDEX, spans 3–5
    // The stats line counts the struck span plus the AI's own drop.
    expect(screen.getByText("4").closest("span")!.textContent).toContain("removed");
    fireEvent.click(screen.getByText("Accept & create"));
    expect(onAccept).toHaveBeenCalledWith([3, 4, 5]);
  });

  it("puts a struck section back from its own line", () => {
    const { onAccept } = renderModal();
    fireEvent.click(screen.getByLabelText("Remove paragraph 3"));
    expect(screen.queryByLabelText("Remove paragraph 4")).toBeNull(); // swallowed by the strike
    fireEvent.click(screen.getByLabelText("Put back paragraph 3"));
    expect(screen.queryByLabelText("Remove paragraph 4")).not.toBeNull();
    fireEvent.click(screen.getByText("Accept & create"));
    expect(onAccept).toHaveBeenCalledWith([]);
  });
});

describe("TreePreviewModal conversation", () => {
  const two: PreviewTurn[] = [opening, { prompt: "Remove the index", result: trimmed }];

  it("sends a follow-up as a new turn at the end of the conversation", () => {
    const { onSend } = renderModal();
    fireEvent.change(screen.getByLabelText("Ask for a change"), { target: { value: "  Remove the index  " } });
    fireEvent.click(screen.getByText("Send"));
    expect(onSend).toHaveBeenCalledWith(1, "Remove the index");
  });

  it("keeps every reply, folds the older ones, and strikes only on the newest", () => {
    renderModal(two);
    const replies = document.querySelectorAll<HTMLDetailsElement>(".tprev-resp");
    expect(replies.length).toBe(2);
    expect(replies[0].open).toBe(false); // the original reply, contracted
    expect(replies[1].open).toBe(true);
    // Anchor 1 is kept in both replies, but only the newest offers the strike.
    expect(within(replies[0] as HTMLElement).queryByLabelText("Remove paragraph 1")).toBeNull();
    expect(within(replies[1] as HTMLElement).queryByLabelText("Remove paragraph 1")).not.toBeNull();
  });

  it("resends an edited message from that turn, discarding what followed", () => {
    const { onSend } = renderModal(two);
    fireEvent.click(screen.getByLabelText("Edit request 1"));
    fireEvent.change(screen.getByLabelText("Edit request 1"), { target: { value: "Remove the index and the notes" } });
    fireEvent.click(screen.getByText("Resend"));
    expect(onSend).toHaveBeenCalledWith(1, "Remove the index and the notes");
  });

  it("copies a reply as rendered text, and its structure as JSON", () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderModal();

    fireEvent.click(screen.getByLabelText("Copy reply 1 as text"));
    const text = writeText.mock.calls[0][0] as string;
    expect(text.split("\n")[0]).toBe("Preface");
    expect(text).toContain("  Preface prose."); // depth indent
    expect(text).toContain("[removed] Produced by a volunteer");
    expect(text).not.toContain('"h"');

    fireEvent.click(screen.getByLabelText("Copy reply 1 as JSON"));
    expect(JSON.parse(writeText.mock.calls[1][0] as string)).toEqual({ nodes: result.tree });
  });

  it("counts tokens across the whole conversation", () => {
    renderModal(two);
    expect(screen.getByText("2,134").closest("span")!.textContent).toContain("tokens");
  });
});
