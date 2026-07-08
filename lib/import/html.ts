import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export interface ExtractedText {
  title?: string;
  paragraphs: string[];
}

function collectParagraphs(html: string): string[] {
  const { document } = parseHTML(`<body>${html}</body>`);
  // If an <article> exists, scope to its <p> elements to exclude nav/footer leakage.
  const root = document.querySelector("article") ?? document;
  return [...root.querySelectorAll("p")]
    .map((p) => (p.textContent ?? "").trim())
    .filter((t) => t.length > 0);
}

/** Extract the most descriptive title from Readability output.
 *  Readability often returns the site name from <title>; prefer the first
 *  heading found inside the extracted content when available. */
function extractTitle(
  readabilityTitle: string | null,
  content: string,
): string | undefined {
  const { document } = parseHTML(`<body>${content}</body>`);
  const heading = document.querySelector("h1, h2, h3");
  if (heading) {
    const text = (heading.textContent ?? "").trim();
    if (text.length > 0) return text;
  }
  return readabilityTitle ?? undefined;
}

/** Server-only: extract a clean title + body paragraphs from arbitrary HTML. */
export function htmlToParagraphs(html: string): ExtractedText {
  const { document } = parseHTML(html);
  // Readability mutates the document; linkedom's document is compatible.
  const article = new Readability(document as unknown as Document).parse();
  if (article?.content) {
    return {
      title: extractTitle(article.title, article.content),
      paragraphs: collectParagraphs(article.content),
    };
  }
  // Fallback: naive <p> extraction from the original document.
  // When an <article> element is present, collectParagraphs scopes to it
  // automatically, excluding nav/footer boilerplate.
  const { document: doc2 } = parseHTML(html);
  return {
    title: doc2.querySelector("title")?.textContent?.trim() || undefined,
    paragraphs: collectParagraphs(html),
  };
}
