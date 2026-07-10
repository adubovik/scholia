import { describe, it, expect } from "vitest";
import { htmlToParagraphs, htmlToBlocks } from "@/lib/import/html";

const ARTICLE = `<!doctype html><html><head><title>Site</title></head><body>
  <nav>Home · About · Donate</nav>
  <article>
    <h1>The Problems of Philosophy</h1>
    <p>Is there any knowledge in the world so certain that no reasonable man could doubt it?</p>
    <p>This question, which at first sight might not seem difficult, is really one of the most difficult that can be asked.</p>
    <p>In this book we shall consider whether any such certainty exists.</p>
  </article>
  <footer>Project Gutenberg License: this eBook is for the use of anyone anywhere at no cost.</footer>
</body></html>`;

describe("htmlToParagraphs", () => {
  it("extracts the article title and body paragraphs", () => {
    const { title, paragraphs } = htmlToParagraphs(ARTICLE);
    expect(title).toContain("Problems of Philosophy");
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(paragraphs[0]).toContain("no reasonable man could doubt it");
  });

  it("excludes nav/footer boilerplate", () => {
    const { paragraphs } = htmlToParagraphs(ARTICLE);
    const joined = paragraphs.join("\n");
    expect(joined).not.toContain("Donate");
    expect(joined).not.toContain("Gutenberg License");
  });
});

const BOOK = `<!doctype html><html><head><title>ignored</title></head><body>
  <article>
    <h1>The Problems of Philosophy | Project Gutenberg</h1>
    <h2>By Bertrand Russell</h2>
    <h2>Contents</h2>
    <table>
      <tr><td><a href="#c1">.</a></td><td>CHAPTER I</td></tr>
      <tr><td><a href="#c2">.</a></td><td>CHAPTER II</td></tr>
    </table>
    <h2>CHAPTER I. APPEARANCE AND REALITY</h2>
    <p>Is there any knowledge in the world which is so certain that no reasonable man could doubt it? This is the hardest question.</p>
    <p>In daily life we assume as certain many things which on closer scrutiny are full of apparent contradictions and doubt.</p>
    <h2>CHAPTER II. THE EXISTENCE OF MATTER</h2>
    <p>In this chapter we have to ask ourselves whether, in any sense at all, there is such a thing as matter that exists.</p>
  </article>
</body></html>`;

describe("htmlToBlocks", () => {
  it("resolves the book title, stripping the site suffix", () => {
    const { title } = htmlToBlocks(BOOK);
    expect(title).toBe("The Problems of Philosophy");
  });

  it("keeps chapter headings as heading blocks in document order", () => {
    const { blocks } = htmlToBlocks(BOOK);
    const headings = blocks.filter((b) => b.kind === "heading").map((b) => b.text);
    expect(headings).toEqual([
      "CHAPTER I. APPEARANCE AND REALITY",
      "CHAPTER II. THE EXISTENCE OF MATTER",
    ]);
  });

  it("drops the byline, the Contents heading, and the TOC table", () => {
    const { blocks } = htmlToBlocks(BOOK);
    const texts = blocks.map((b) => b.text).join("\n");
    expect(texts).not.toContain("By Bertrand Russell");
    expect(texts).not.toMatch(/Contents/);
    expect(texts).not.toMatch(/CHAPTER I$/m); // the bare TOC entry, not the heading
  });

  it("first content block is the first chapter heading, not boilerplate", () => {
    const { blocks } = htmlToBlocks(BOOK);
    expect(blocks[0]).toEqual({ kind: "heading", level: 2, text: "CHAPTER I. APPEARANCE AND REALITY" });
  });

  it("drops Project Gutenberg START/END markers", () => {
    const html = `<article><h2>CHAPTER I</h2><p>*** START OF THE PROJECT GUTENBERG EBOOK 5827 ***</p><p>Real prose that is long enough to be kept by the reader extractor here.</p></article>`;
    const { blocks } = htmlToBlocks(html);
    expect(blocks.some((b) => /START OF THE PROJECT GUTENBERG/.test(b.text))).toBe(false);
  });

  it("drops a run of link-dominated paragraphs (list-style TOC)", () => {
    const html = `<article>
      <p><a href="#a">First chapter</a></p>
      <p><a href="#b">Second chapter</a></p>
      <p><a href="#c">Third chapter</a></p>
      <h2>CHAPTER I</h2>
      <p>Real prose that is comfortably long enough to survive the reader extractor stage of import.</p>
    </article>`;
    const { blocks } = htmlToBlocks(html);
    expect(blocks.some((b) => b.text === "First chapter")).toBe(false);
    expect(blocks.some((b) => b.kind === "heading" && b.text === "CHAPTER I")).toBe(true);
  });
});
