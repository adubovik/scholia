"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkSectionRefs, refFromHref } from "@/lib/annotations/refs";
import { useNotesActions } from "./NotesContext";

// Module constant — a fresh array each render would make react-markdown rebuild the
// processor every time.
const REMARK_PLUGINS = [remarkGfm, remarkSectionRefs];

/**
 * A note's markdown body. Beyond GFM, §-references (`§1.1`, `§1.1_1`) are auto-linked:
 * clicking one scrolls the reading prose to that block / highlight and selects it.
 * Real markdown links stay real links (opened in a new tab).
 */
export function NoteMarkdown({ note }: { note: string }) {
  const { scrollToSection } = useNotesActions();
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      components={{
        a({ href, children }) {
          const ref = refFromHref(href);
          if (ref === null) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          }
          // Pretty-print the inline index as a subscript, matching the panel's 1.1₁ ids:
          // §1.1_1 → §1.1<sub>1</sub>. `_` only ever separates the index (numbers are
          // dot-joined alnum), so the last `_` is the split point.
          const us = ref.lastIndexOf("_");
          const base = us >= 0 ? ref.slice(0, us) : ref;
          const idx = us >= 0 ? ref.slice(us + 1) : null;
          return (
            <button type="button" className="xref" onClick={() => scrollToSection(ref)}>
              §{base}
              {idx && <sub>{idx}</sub>}
            </button>
          );
        },
      }}
    >
      {note}
    </ReactMarkdown>
  );
}
