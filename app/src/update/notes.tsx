// The notes of a new version (the first section of CHANGELOG.md, Markdown in French) as plain text blocks: titles,
// lists, paragraphs, **bold**. Nothing else is interpreted: no links, no images, no HTML (it all reads as text).

import type { ReactNode } from 'react';

export type NoteBlock = { kind: 'title'; text: string } | { kind: 'list'; items: string[] } | { kind: 'para'; text: string };

/** The blocks of the notes. A list item continued on the next lines (indented) stays one item. */
export function noteBlocks(markdown: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: 'para', text: para.join(' ') });
    para = [];
    if (list) blocks.push({ kind: 'list', items: list });
    list = null;
  };
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const title = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!line.trim()) flush();
    else if (title) {
      flush();
      blocks.push({ kind: 'title', text: title[1]!.trim() });
    } else if (item) {
      if (para.length) flush();
      list = list ?? [];
      list.push(item[1]!.trim());
    } else if (list && /^\s+\S/.test(raw)) list[list.length - 1] += ` ${line.trim()}`;
    else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** `**gras**` as <strong>, links as their text, backquotes dropped. */
function inline(text: string): ReactNode[] {
  const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`([^`]*)`/g, '$1');
  return plain.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

export function Notes({ markdown, testId }: { markdown: string; testId?: string }) {
  const blocks = noteBlocks(markdown);
  return (
    <div className="maj-notes" data-testid={testId} tabIndex={0}>
      {blocks.map((b, i) =>
        b.kind === 'title' ? (
          <h4 key={i}>{inline(b.text)}</h4>
        ) : b.kind === 'list' ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(b.text)}</p>
        ),
      )}
    </div>
  );
}
