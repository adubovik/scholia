import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { epubToSource } from "@/lib/import/epub";

/** A minimal but realistically messy epub: the container.xml is missing the
 * spaces between attributes exactly like the Penguin file in `.assets/books`. */
function makeEpub(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = { mimetype: strToU8("application/epub+zip") };
  for (const [path, body] of Object.entries(files)) entries[path] = strToU8(body);
  return zipSync(entries);
}

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Language, Truth and Logic</dc:title>
    <dc:creator opf:role="aut">A.J. Ayer</dc:creator>
  </metadata>
  <manifest>
    <item href="cover.html" id="cover" media-type="application/xhtml+xml"/>
    <item href="ch01.html" id="ch01" media-type="application/xhtml+xml"/>
    <item href="ch02.html" id="ch02" media-type="application/xhtml+xml"/>
    <item href="style.css" id="css" media-type="text/css"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="cover" linear="no"/>
    <itemref idref="ch01"/>
    <itemref idref="ch02"/>
  </spine>
</package>`;

const EPUB = makeEpub({
  "META-INF/container.xml":
    `<?xml version="1.0"?><container version="1.0"xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
    `<rootfiles><rootfile full-path="OEBPS/book.opf"media-type="application/oebps-package+xml"/></rootfiles></container>`,
  "OEBPS/book.opf": OPF,
  "OEBPS/cover.html": `<html><body><p>COVER ART</p></body></html>`,
  "OEBPS/ch01.html":
    `<html><head><title>ignored</title></head><body>` +
    `<h1><strong>CHAPTER 1</strong><br/><br/>THE ELIMINATION OF METAPHYSICS</h1>` +
    `<p>The traditional disputes of philosophers are unwarranted.</p></body></html>`,
  "OEBPS/ch02.html":
    `<html><body><h1>CHAPTER 2</h1><p>The function of philosophy is analysis.</p></body></html>`,
});

describe("epubToSource", () => {
  it("reads title and author from the package metadata", () => {
    const { title, author } = epubToSource(EPUB);
    expect(title).toBe("Language, Truth and Logic");
    expect(author).toBe("A.J. Ayer");
  });

  it("keeps each file's own h1 as a heading (unlike the web-page extractor)", () => {
    const { text, headingLevels } = epubToSource(EPUB);
    const paras = text.split("\n\n");
    expect(headingLevels).toEqual([1, null, 1, null]);
    // <br> becomes a space rather than mashing the words either side together.
    expect(paras[0]).toBe("CHAPTER 1 THE ELIMINATION OF METAPHYSICS");
    expect(paras[2]).toBe("CHAPTER 2");
  });

  it("follows the spine in order and skips linear=\"no\" matter", () => {
    const { text } = epubToSource(EPUB);
    expect(text).not.toContain("COVER ART");
    expect(text.indexOf("CHAPTER 1")).toBeLessThan(text.indexOf("CHAPTER 2"));
  });

  it("rejects a file that is not an epub", () => {
    expect(() => epubToSource(strToU8("not a zip at all"))).toThrow(/readable epub/);
    expect(() => epubToSource(makeEpub({ "a.txt": "x" }))).toThrow(/container\.xml/);
  });
});
