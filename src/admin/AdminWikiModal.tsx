import { useMemo, useState } from 'react';
import { adminWikiDocs, type AdminWikiDocId } from './wikiContent';

interface AdminWikiModalProps {
  open: boolean;
  onClose: () => void;
}

function inlineMarkdown(text: string) {
  const segments = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return segments.map((segment, index) => {
    if (segment.startsWith('`') && segment.endsWith('`')) {
      return (
        <code
          key={index}
          style={{
            borderRadius: 6,
            padding: '1px 5px',
            background: 'rgba(255,210,133,0.14)',
            color: '#ffe4b3',
            fontSize: '0.92em',
          }}
        >
          {segment.slice(1, -1)}
        </code>
      );
    }
    if (segment.startsWith('**') && segment.endsWith('**')) {
      return <strong key={index}>{segment.slice(2, -2)}</strong>;
    }
    return segment;
  });
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split('\n');
  const blocks: JSX.Element[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list_${blocks.length}`} style={{ margin: '4px 0 12px 20px', padding: 0, display: 'grid', gap: 6 }}>
        {listItems.map((item, index) => (
          <li key={`${item}_${index}`} style={{ lineHeight: 1.7 }}>
            {inlineMarkdown(item)}
          </li>
        ))}
      </ul>
    );
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    const bulletMatch = line.match(/^-\s+(.*)$/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1] ?? '');
      continue;
    }

    flushList();

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      const text = headingMatch[2] ?? '';
      const style =
        level === 1
          ? { fontSize: 30, margin: '0 0 10px' }
          : level === 2
            ? { fontSize: 20, margin: '22px 0 8px' }
            : { fontSize: 16, margin: '16px 0 6px', opacity: 0.92 };
      blocks.push(
        <div key={`heading_${blocks.length}`} style={{ ...style, fontWeight: 800 }}>
          {inlineMarkdown(text)}
        </div>
      );
      continue;
    }

    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (numberedMatch) {
      blocks.push(
        <p key={`number_${blocks.length}`} style={{ margin: '6px 0', lineHeight: 1.75 }}>
          {inlineMarkdown(line)}
        </p>
      );
      continue;
    }

    blocks.push(
      <p key={`p_${blocks.length}`} style={{ margin: '8px 0 12px', lineHeight: 1.75, opacity: 0.88 }}>
        {inlineMarkdown(line)}
      </p>
    );
  }

  flushList();
  return blocks;
}

export function AdminWikiModal({ open, onClose }: AdminWikiModalProps) {
  const [activeDocId, setActiveDocId] = useState<AdminWikiDocId>('operator');
  const activeDoc = adminWikiDocs.find(doc => doc.id === activeDocId) ?? adminWikiDocs[0]!;
  const renderedContent = useMemo(() => renderMarkdown(activeDoc.content), [activeDoc.content]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(8, 6, 9, 0.68)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        padding: 28,
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: 'min(1080px, 100%)',
          height: 'min(820px, 92vh)',
          display: 'grid',
          gridTemplateColumns: '260px minmax(0, 1fr)',
          minHeight: 0,
          overflow: 'hidden',
          borderRadius: 28,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'linear-gradient(180deg, rgba(27,22,28,0.98) 0%, rgba(15,12,17,0.98) 100%)',
          color: '#fff8ef',
          boxShadow: '0 30px 80px rgba(0,0,0,0.42)',
        }}
      >
        <aside
          style={{
            padding: 22,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            overflow: 'auto',
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', opacity: 0.62, marginBottom: 8 }}>
            Admin Wiki
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 18 }}>操作手册</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {adminWikiDocs.map(doc => {
              const active = doc.id === activeDoc.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setActiveDocId(doc.id)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 16,
                    border: `1px solid ${active ? 'rgba(255,210,133,0.28)' : 'rgba(255,255,255,0.1)'}`,
                    background: active ? 'rgba(255,210,133,0.14)' : 'rgba(255,255,255,0.04)',
                    color: '#fff8ef',
                    padding: 14,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>{doc.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.68 }}>{doc.audience}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <main style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minWidth: 0, minHeight: 0 }}>
          <header
            style={{
              padding: '20px 26px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 13, opacity: 0.66 }}>{activeDoc.audience}</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{activeDoc.title}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff8ef',
                padding: '10px 14px',
                cursor: 'pointer',
              }}
            >
              关闭
            </button>
          </header>

          <article
            style={{
              padding: '24px 30px 34px',
              overflowY: 'auto',
              overflowX: 'hidden',
              minHeight: 0,
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {renderedContent}
          </article>
        </main>
      </div>
    </div>
  );
}
