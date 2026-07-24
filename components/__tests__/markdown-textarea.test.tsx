import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarkdownTextarea, wrapEdit, linkEdit, isUrl } from "../MarkdownTextarea";

describe("isUrl", () => {
  it("accepts absolute http(s) urls", () => {
    expect(isUrl("https://www.jstor.org/stable/123")).toBe(true);
    expect(isUrl("http://a.co")).toBe(true);
    expect(isUrl("HTTPS://A.CO")).toBe(true);
  });

  it("rejects bare hosts, other schemes, and prose", () => {
    for (const s of ["www.jstor.org/stable/123", "arxiv.org", "mailto:a@b.co", "note:", "javascript:alert(1)", "see https://a.co", "", "cf. p. 12"]) {
      expect(isUrl(s), s).toBe(false);
    }
  });
});

describe("wrapEdit", () => {
  it("wraps the selection and keeps it selected", () => {
    // "one two" with "two" selected
    expect(wrapEdit("one two", 4, 7, "**")).toEqual({
      text: "**two**", from: 4, to: 7, selStart: 6, selEnd: 9,
    });
  });

  it("unwraps when the markers are already around the selection", () => {
    // "one **two**" with "two" selected → toggling off widens the splice to eat the markers
    expect(wrapEdit("one **two**", 6, 9, "**")).toEqual({
      text: "two", from: 4, to: 11, selStart: 4, selEnd: 7,
    });
  });

  it("does not mistake a short prefix for a marker at the start of the value", () => {
    expect(wrapEdit("hi", 0, 2, "**").text).toBe("**hi**");
  });
});

describe("linkEdit", () => {
  it("selects the url placeholder for Cmd+K", () => {
    expect(linkEdit("see docs", 4, 8, "url", true)).toEqual({
      // "see [docs](url)" — "url" sits at 11..14
      text: "[docs](url)", from: 4, to: 8, selStart: 11, selEnd: 14,
    });
  });

  it("leaves the caret after the link when pasting a real url", () => {
    const e = linkEdit("see docs", 4, 8, "https://a.co", false);
    expect(e.text).toBe("[docs](https://a.co)");
    expect(e.selStart).toBe(e.selEnd);
    expect(e.selStart).toBe(4 + e.text.length);
  });
});

function Harness() {
  const [v, setV] = useState("one two");
  return <MarkdownTextarea value={v} onChange={(e) => setV(e.target.value)} />;
}

describe("MarkdownTextarea", () => {
  it("bolds the selection on Cmd+B", () => {
    render(<Harness />);
    const el = screen.getByRole("textbox") as HTMLTextAreaElement;
    el.setSelectionRange(4, 7);
    fireEvent.keyDown(el, { key: "b", metaKey: true });
    expect(el.value).toBe("one **two**");
  });

  it("links the selection when a url is pasted over it", () => {
    render(<Harness />);
    const el = screen.getByRole("textbox") as HTMLTextAreaElement;
    el.setSelectionRange(4, 7);
    fireEvent.paste(el, { clipboardData: { getData: () => "https://a.co" } });
    expect(el.value).toBe("one [two](https://a.co)");
  });

  it("leaves a non-url paste alone", () => {
    render(<Harness />);
    const el = screen.getByRole("textbox") as HTMLTextAreaElement;
    el.setSelectionRange(4, 7);
    fireEvent.paste(el, { clipboardData: { getData: () => "three" } });
    expect(el.value).toBe("one two"); // jsdom does not perform the default paste
  });

  it("ignores Cmd+B with modifiers that mean something else", () => {
    render(<Harness />);
    const el = screen.getByRole("textbox") as HTMLTextAreaElement;
    el.setSelectionRange(4, 7);
    fireEvent.keyDown(el, { key: "b", metaKey: true, shiftKey: true });
    expect(el.value).toBe("one two");
  });
});
