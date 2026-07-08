import { describe, it, expect } from "vitest";
import { htmlToParagraphs } from "@/lib/import/html";

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
