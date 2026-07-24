"use client";

import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from "react";

/** A splice to apply to a textarea: replace [from,to) with text, then select [selStart,selEnd). */
export type MdEdit = { text: string; from: number; to: number; selStart: number; selEnd: number };

/** Cmd/Ctrl + key → the markdown marker wrapped around the selection. */
const WRAP: Record<string, string> = { b: "**", i: "_", e: "`" };

/** Wrap the selection in `marker`, or unwrap it when the markers are already there
 * (so Cmd+B on bold text un-bolds instead of producing ****text****). */
export function wrapEdit(value: string, start: number, end: number, marker: string): MdEdit {
  const n = marker.length;
  const inner = value.slice(start, end);
  if (start >= n && value.slice(start - n, start) === marker && value.slice(end, end + n) === marker) {
    return { text: inner, from: start - n, to: end + n, selStart: start - n, selEnd: end - n };
  }
  return { text: marker + inner + marker, from: start, to: end, selStart: start + n, selEnd: end + n };
}

/** Turn the selection into `[selection](url)`. `selectUrl` leaves the url part selected
 * (Cmd+K, where "url" is a placeholder to type over); otherwise the caret lands at the end. */
export function linkEdit(value: string, start: number, end: number, url: string, selectUrl: boolean): MdEdit {
  const label = value.slice(start, end);
  const text = `[${label}](${url})`;
  const urlStart = start + label.length + 3; // "[" + label + "]("
  return {
    text,
    from: start,
    to: end,
    selStart: selectUrl ? urlStart : start + text.length,
    selEnd: selectUrl ? urlStart + url.length : start + text.length,
  };
}

/**
 * Does this clipboard text look like a link worth swallowing the paste for?
 * Absolute http(s) only — a bare host has no scheme to parse, and anything with
 * whitespace in it is prose. Deliberately strict: a paste that silently stops
 * being a paste should be an obvious call, not a guess.
 */
export function isUrl(text: string): boolean {
  if (/\s/.test(text)) return false;
  try {
    const { protocol } = new URL(text);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** execCommand is deprecated but is still the only mutation that keeps the textarea's
 * native undo stack (Cmd+Z) working; setRangeText is the fallback for jsdom/tests. */
function apply(el: HTMLTextAreaElement, edit: MdEdit) {
  el.setSelectionRange(edit.from, edit.to);
  if (!document.execCommand?.("insertText", false, edit.text)) {
    el.setRangeText(edit.text, edit.from, edit.to, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  el.setSelectionRange(edit.selStart, edit.selEnd);
}

/** A plain <textarea> plus the markdown shortcuts people expect from GitHub's editor:
 * Cmd/Ctrl+B/I/E wrap the selection, Cmd+K links it, and pasting a URL over a
 * selection turns it into [selection](url). */
export function MarkdownTextarea(props: ComponentPropsWithoutRef<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the content. CSS owns the floor and the ceiling (min-height /
  // max-height on .note-textarea); this just tracks the text in between, so the
  // scrollbar appears exactly when the cap is hit and never before. Height is
  // zeroed first so scrollHeight reports the content, not the current box, and
  // the border delta is added back because box-sizing here is border-box.
  // Layout effect, not effect: reopening a long note must not paint short first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [props.value]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const el = e.currentTarget;
    const key = e.key.toLowerCase();
    if (WRAP[key]) {
      e.preventDefault();
      apply(el, wrapEdit(el.value, el.selectionStart, el.selectionEnd, WRAP[key]));
    } else if (key === "k") {
      e.preventDefault();
      apply(el, linkEdit(el.value, el.selectionStart, el.selectionEnd, "url", true));
    }
    props.onKeyDown?.(e);
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const text = e.clipboardData.getData("text/plain").trim();
    if (el.selectionStart !== el.selectionEnd && isUrl(text)) {
      e.preventDefault();
      apply(el, linkEdit(el.value, el.selectionStart, el.selectionEnd, text, false));
    }
    props.onPaste?.(e);
  }

  return <textarea {...props} ref={ref} onKeyDown={onKeyDown} onPaste={onPaste} />;
}
