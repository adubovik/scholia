import { SourcePassage } from "./SourcePassage";

export interface ParagraphRange { charStart: number; charEnd: number }

export function ReadingSurface({
  title, sourceText, paragraphs,
}: { title: string; sourceText: string; paragraphs: ParagraphRange[] }) {
  return (
    <article className="reading">
      <h1 className="reading-title">{title}</h1>
      {paragraphs.map((p, i) => (
        <SourcePassage key={i} text={sourceText.slice(p.charStart, p.charEnd)} />
      ))}
    </article>
  );
}
