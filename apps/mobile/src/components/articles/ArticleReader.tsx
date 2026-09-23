/**
 * ArticleReader — tiny dependency-free Markdown-ish renderer for bundled
 * long-form articles. We deliberately avoid react-native-render-html or
 * native-markdown to keep Phase 7 native-module count at zero (both would
 * need native linking in expo-dev-client). The renderer handles:
 *
 *   - `# H1`, `## H2`, `### H3`
 *   - Blank lines → paragraph breaks
 *   - `- ` bullet list items
 *   - `| a | b |` Markdown tables → grid of Cells
 *   - `**bold**` inline spans
 *
 * That is enough for About/Methodology/Privacy/Contact. Bangla content
 * renders correctly because we don't mangle line metrics.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Pressable } from 'react-native';
import { safeOpenUrl } from '../../lib/security/openUrl';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { DisplayLarge, Title1, Title3, Body, BodyBold, Caption, Metadata } from '../../design-system/Text';
import { Divider } from '../../design-system/primitives';
import { Card } from '../../design-system/Card';
import { SCREEN_H_PADDING } from '../../theme/nativeTokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useNavigation } from '@react-navigation/native';

interface ArticleProps {
  articleId: string;
}

const ARTICLES: Record<string, { title: string; source: string; raw: string }> = {};

// Metro bundler treats `require()` statically — enumerate articles here.
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports */
const REGISTRY: { id: string; title: string; source: any }[] = [
  { id: 'about', title: 'About HazardNet', source: require('../../assets/articles/about.md') },
  { id: 'methodology', title: 'Methodology', source: require('../../assets/articles/methodology.md') },
  { id: 'privacy', title: 'Privacy', source: require('../../assets/articles/privacy.md') },
  { id: 'contact', title: 'Contact', source: require('../../assets/articles/contact.md') },
];
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports */

async function loadArticle(id: string): Promise<{ title: string; raw: string } | null> {
  const meta = REGISTRY.find((r) => r.id === id);
  if (!meta) return null;
  // In a native build, require() on a .md file resolves via Metro to a module
  // whose default export is the asset URI; in Jest/jsdom environments we fall
  // back to returning a minimal string.
  try {
    const mod = meta.source;
    // If bundler resolved as a string (some transformers), use it directly.
    if (typeof mod === 'string') return { title: meta.title, raw: mod };
    // expo/metro returns { default: <uri> } for non-JS assets.
    const uri = (mod as any)?.default ?? (mod as any)?.uri ?? null;
    if (typeof uri === 'string' && (uri.startsWith('http') || uri.startsWith('file') || uri.startsWith('asset') || uri.startsWith('/'))) {
      const resp = await fetch(uri);
      const text = await resp.text();
      return { title: meta.title, raw: text };
    }
    // Fallback: try to read default as string (jest transform).
    if (typeof (mod as any)?.default === 'string') return { title: meta.title, raw: (mod as any).default };
    return { title: meta.title, raw: '(article content not available)' };
  } catch {
    return { title: meta.title, raw: '(article content not available)' };
  }
}

function renderInline(text: string, theme: any, keyPrefix: string): React.ReactNode[] {
  // Bold **xx** spans. Very small parser, no nesting.
  const out: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      out.push(<BodyBold key={`${keyPrefix}-${i}`} color="textPrimary">{p.slice(2, -2)}</BodyBold>);
    } else {
      if (!p) return;
      // Auto-link URLs.
      const urlMatch = p.match(/(https?:\/\/[^\s)]+)/);
      if (urlMatch) {
        const idx = p.indexOf(urlMatch[0]);
        if (idx > 0) out.push(<Body key={`${keyPrefix}-${i}-a`} color="textSecondary">{p.slice(0, idx)}</Body>);
        out.push(
          <Pressable key={`${keyPrefix}-${i}-b`} onPress={() => { safeOpenUrl(urlMatch[0], 'article').catch(() => {}); }}>
            <Body color="primaryAction" style={{ textDecorationLine: 'underline' as const }}>{urlMatch[0]}</Body>
          </Pressable>
        );
        if (idx + urlMatch[0].length < p.length) {
          out.push(<Body key={`${keyPrefix}-${i}-c`} color="textSecondary">{p.slice(idx + urlMatch[0].length)}</Body>);
        }
      } else {
        out.push(<Body key={`${keyPrefix}-${i}`} color="textSecondary">{p}</Body>);
      }
    }
  });
  return out;
}

interface Block { type: 'h1'|'h2'|'h3'|'p'|'li'|'table'; content: string; rows?: string[][]; }

export function parseMarkdown(raw: string): Block[] {
  const blocks: Block[] = [];
  const lines = raw.split(/\r?\n/);
  let tableBuf: string[][] | null = null;
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length) { blocks.push({ type: 'p', content: paraBuf.join(' ') }); paraBuf = []; }
  };
  const flushTable = () => {
    if (tableBuf) {
      // Drop separator row (second row of |---|---|).
      const cleaned = tableBuf.filter((row) => !row.every((c) => /^[-:\s]+$/.test(c)));
      blocks.push({ type: 'table', content: '', rows: cleaned });
      tableBuf = null;
    }
  };

  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (!tableBuf) tableBuf = [];
      tableBuf.push(cells);
      continue;
    } else {
      flushTable();
    }
    if (/^\s*$/.test(line)) { flushPara(); continue; }
    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
    if (h1) { flushPara(); blocks.push({ type: 'h1', content: h1[1] }); }
    else if (h2) { flushPara(); blocks.push({ type: 'h2', content: h2[1] }); }
    else if (h3) { flushPara(); blocks.push({ type: 'h3', content: h3[1] }); }
    else if (li) { flushPara(); blocks.push({ type: 'li', content: li[1] }); }
    else paraBuf.push(line.trim());
  }
  flushPara(); flushTable();
  return blocks;
}

export function ArticleReader({ articleId }: ArticleProps) {
  const { theme } = useTheme();
  const nav = useNavigation();
  const [article, setArticle] = useState<{ title: string; raw: string } | null>(null);
  const blocks = useMemo(() => (article ? parseMarkdown(article.raw) : []), [article]);

  useEffect(() => {
    let mounted = true;
    loadArticle(articleId).then((a) => { if (mounted && a) { setArticle(a); nav.setOptions({ title: a.title }); } });
    return () => { mounted = false; };
  }, [articleId, nav]);

  if (!article) {
    return (
      <Box flex={1} py={32} px={SCREEN_H_PADDING}>
        <Metadata color="textMuted">Loading…</Metadata>
      </Box>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: SCREEN_H_PADDING, paddingBottom: 64 }}>
      <VStack space={12}>
        {blocks.map((b, i) => {
          if (b.type === 'h1') return <DisplayLarge key={i}>{b.content}</DisplayLarge>;
          if (b.type === 'h2') return <Title1 key={i}>{b.content}</Title1>;
          if (b.type === 'h3') return <Title3 key={i}>{b.content}</Title3>;
          if (b.type === 'li') return (
            <HStack key={i} space={8} align="flex-start">
              <Metadata color="textMuted">•</Metadata>
              <Box flex={1}>{renderInline(b.content, theme, `li-${i}`)}</Box>
            </HStack>
          );
          if (b.type === 'table' && b.rows) {
            const [head, ...rest] = b.rows;
            return (
              <Card key={i} padded={false}>
                <Box px={14} py={10}>
                  <HStack space={12}><Box flex={1}><BodyBold>{head?.[0] ?? ''}</BodyBold></Box>{(head?.slice(1) ?? []).map((c, j) => <Box flex={1} key={j}><BodyBold>{c}</BodyBold></Box>)}</HStack>
                  <Divider />
                  {rest.map((row, ri) => (
                    <HStack space={12} key={ri} py={6}>
                      {row.map((c, j) => <Box flex={1} key={j}>{renderInline(c, theme, `t-${i}-${ri}-${j}`)}</Box>)}
                    </HStack>
                  ))}
                </Box>
              </Card>
            );
          }
          return <Box key={i}>{renderInline(b.content, theme, `p-${i}`)}</Box>;
        })}
      </VStack>
    </ScrollView>
  );
}

export const ARTICLE_INDEX = REGISTRY.map((r) => ({ id: r.id, title: r.title }));
