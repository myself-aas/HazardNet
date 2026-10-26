/**
 * Regression suite for `sanitizeBlogHtml`.
 *
 * Every payload below was run against the previous hand-rolled blocklist and
 * recorded as SURVIVING it. They must not survive DOMPurify.
 *
 * The dangerous ones were:
 *   • <meta http-equiv="refresh"> — not in the old removal list at all, so a
 *     crafted article could silently redirect every reader.
 *   • `\u0001javascript:` — the old check used `value.trim().startsWith(...)`,
 *     and trim() does not strip C0 control characters, but browsers do strip
 *     them when resolving the URL.
 *   • <svg><a xlink:href="javascript:…"> — xlink:href was never inspected.
 *   • `style="background:url(javascript:…)"` — the style attribute was not
 *     filtered; only `href`/`src` were.
 *   • the `catch { return html }` path returned the input UNSANITISED.
 */

import { readFileSync } from 'node:fs';

jest.mock('../../services/firebase', () => ({
  db: {},
}));

import { BLOG_TEXT_COLORS, sanitizeBlogHtml } from '../blogArticles';

describe('sanitizeBlogHtml — payloads that defeated the previous blocklist', () => {
  it('strips <meta http-equiv="refresh"> (silent redirect of every reader)', () => {
    const out = sanitizeBlogHtml('<p>Article</p><meta http-equiv="refresh" content="0;url=https://evil.example">');
    expect(out).not.toMatch(/<meta/i);
    expect(out).not.toContain('evil.example');
    expect(out).toContain('Article');
  });

  it('strips javascript: behind a leading C0 control character', () => {
    const out = sanitizeBlogHtml('<a href="\u0001javascript:alert(1)">click</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out).not.toContain('alert(1)');
  });

  it('strips javascript: hidden behind other C0/whitespace characters', () => {
    // \u0000 is deliberately NOT in this list: the HTML parser turns it into
    // U+FFFD, which browsers do not strip when resolving a URL, so the result
    // is an inert relative URL rather than a javascript: one (verified against
    // the DOM: the href does not resolve to a JS URL). The characters below
    // ARE stripped by the browser, which is what made them dangerous.
    for (const ch of ['\u0001', '\u0008', '\u000b', '\u000c', '\u001f', '\u00a0']) {
      const out = sanitizeBlogHtml(`<a href="${ch}javascript:alert(1)">x</a>`);
      expect(out.toLowerCase()).not.toContain('javascript:');
    }
  });

  it('removes the href entirely rather than rewriting it', () => {
    // Belt-and-braces on the fix: DOMPurify drops the attribute outright.
    const out = sanitizeBlogHtml('<a href="\u0001javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/href/i);
  });

  it('strips svg xlink:href', () => {
    const out = sanitizeBlogHtml('<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>');
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out.toLowerCase()).not.toContain('xlink:href');
    expect(out.toLowerCase()).not.toContain('<svg');
  });

  it('strips CSS url(javascript:) inside a style attribute', () => {
    const out = sanitizeBlogHtml('<p style="background:url(javascript:alert(1))">text</p>');
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out.toLowerCase()).not.toContain('url(');
    expect(out).toContain('text');
  });

  it('strips CSS expression() and escaped url() payloads', () => {
    for (const css of [
      'width:expression(alert(1))',
      'background:url\\28javascript:alert(1)\\29',
      'behavior:url(#default#time2)',
      'background:url("https://evil.example/x.png")',
    ]) {
      const out = sanitizeBlogHtml(`<p style="${css}">t</p>`);
      expect(out.toLowerCase()).not.toContain('expression');
      expect(out.toLowerCase()).not.toContain('url(');
      expect(out.toLowerCase()).not.toContain('behavior');
      expect(out).toContain('t');
    }
  });

  it('strips data:text/html URLs', () => {
    const out = sanitizeBlogHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(out.toLowerCase()).not.toContain('data:text/html');
    expect(out.toLowerCase()).not.toContain('script');
  });

  it('strips iframe, object, embed, style, form and input elements', () => {
    const out = sanitizeBlogHtml(
      '<iframe src="https://evil.example"></iframe>' +
        '<object data="x"></object><embed src="x">' +
        '<style>body{display:none}</style>' +
        '<form action="https://evil.example"><input name="a"></form><p>keep</p>',
    );
    for (const tag of ['iframe', 'object', 'embed', '<style', 'form', 'input']) {
      expect(out.toLowerCase()).not.toContain(tag);
    }
    expect(out).toContain('keep');
  });

  it('drops non-image data: URIs but keeps inline images', () => {
    // DOMPurify hard-allows data: on <img>; the app-level hook narrows it back
    // to image payloads only (the previous sanitizer blocked data:text/html).
    const bad = sanitizeBlogHtml('<img src="data:text/html,<script>alert(1)</script>">');
    expect(bad.toLowerCase()).not.toContain('data:text/html');
    expect(bad.toLowerCase()).not.toContain('script');

    const good = sanitizeBlogHtml('<img src="data:image/png;base64,iVBORw0KGgo=" alt="ok">');
    expect(good).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(good).toContain('alt="ok"');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeBlogHtml('<p onclick="alert(1)" onmouseover="alert(2)" onerror="alert(3)">ok</p>');
    expect(out).not.toMatch(/\son[a-z]+=/i);
    expect(out).toContain('ok');
  });

  it('strips <script> in all its casing and nesting', () => {
    const out = sanitizeBlogHtml('<p>a</p><SCRIPT>alert(1)</SCRIPT><scr<script>ipt>alert(2)</script>');
    expect(out.toLowerCase()).not.toContain('<script');
    // The nested payload survives only as ESCAPED TEXT ("ipt&gt;alert(2)"),
    // which renders as visible characters and cannot execute. Assert the
    // structure, not the word: assert no executable markup is left.
    expect(out).not.toMatch(/<[a-z/]*script/i);
    expect(out).not.toMatch(/\son[a-z]+\s*=/i);
    expect(out).toContain('&gt;');
  });
});

describe('sanitizeBlogHtml — must not break legitimate article markup', () => {
  it('preserves the formatting the editor produces', () => {
    const html =
      '<h2>Heading</h2><p><strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s></p>' +
      '<blockquote>quote</blockquote><pre><code>code()</code></pre>' +
      '<ul><li>one</li></ul><ol><li>two</li></ol><hr>' +
      '<a href="https://hazardnet.live">link</a>' +
      '<img src="https://hazardnet.live/a.png" alt="alt">';
    const out = sanitizeBlogHtml(html);
    for (const fragment of [
      '<h2>Heading</h2>',
      '<strong>bold</strong>',
      '<em>italic</em>',
      '<u>under</u>',
      '<s>strike</s>',
      '<blockquote>quote</blockquote>',
      '<code>',
      '<ul>',
      '<ol>',
      '<hr>',
      'https://hazardnet.live',
      'alt="alt"',
    ]) {
      expect(out).toContain(fragment);
    }
  });

  it('preserves the alignment and weight styles the toolbar writes', () => {
    expect(sanitizeBlogHtml('<p style="text-align: center">c</p>')).toContain('text-align: center');
    expect(sanitizeBlogHtml('<span style="font-weight: 700">b</span>')).toContain('font-weight: 700');
    expect(sanitizeBlogHtml('<span style="font-style: italic; text-decoration: underline">i</span>')).toMatch(
      /font-style: italic/,
    );
  });

  // The colour an author picks is a design-system decision, so it is a closed set: the four
  // values `BLOG_TEXT_COLORS` names, normalised to hex whichever way the browser serialised
  // them. Everything else is dropped rather than passed into a page the palette test trusts.
  it('keeps only the four editor colours, in either serialisation', () => {
    expect(sanitizeBlogHtml('<p style="color: rgb(0, 102, 204)">link blue</p>')).toContain('color: #0066cc');
    expect(sanitizeBlogHtml('<p style="color: #C01F1F">alert red</p>')).toContain('color: #c01f1f');
    expect(sanitizeBlogHtml('<font color="#1d1d1f">body</font>')).toContain('color="#1d1d1f"');
  });

  it('drops colours outside the palette and legacy font colours', () => {
    const magenta = sanitizeBlogHtml('<p style="color: rgb(255, 0, 255)">m</p>');
    expect(magenta).not.toMatch(/color/i);
    const named = sanitizeBlogHtml('<p style="color: white">m</p>');
    expect(named).not.toMatch(/color/i);
    const legacy = sanitizeBlogHtml('<font color="#ff00ff">m</font>');
    expect(legacy.toLowerCase()).not.toContain('#ff00ff');
    expect(legacy).not.toMatch(/color=/i);
    expect(legacy).toContain('m');
  });

  // Canvas, layout and type-scale properties are not typography the editor owns: an article
  // cannot repaint the page it sits on, move its own text, or opt out of the type ramp.
  it('drops inline properties that paint, move or resize', () => {
    const out = sanitizeBlogHtml(
      '<p style="background: #fff; color: #fff; font-size: 40px; font-family: var(--ap-font-mono); position: fixed; width: 1px">t</p>',
    );
    for (const property of ['background', 'font-size', 'font-family', 'position', 'width']) {
      expect(out.toLowerCase()).not.toContain(property);
    }
    expect(out).toContain('t');
  });

  it('preserves tables', () => {
    const out = sanitizeBlogHtml('<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>d</td></tr></tbody></table>');
    expect(out).toContain('<table>');
    expect(out).toContain('<th>h</th>');
    expect(out).toContain('<td>d</td>');
  });

  it('keeps the text of a removed element rather than dropping it', () => {
    const out = sanitizeBlogHtml('<p>before</p><form>inner text</form>');
    expect(out).toContain('before');
    expect(out).toContain('inner text');
    expect(out).not.toContain('<form');
  });
});

describe('sanitizeBlogHtml — fail-closed contract', () => {
  it('returns an empty string for empty input', () => {
    expect(sanitizeBlogHtml('')).toBe('');
  });

  it('never returns the raw input when sanitising is impossible', () => {
    // Simulate the no-DOM path (the old code returned `html` here, and also
    // from its catch block, leaking unsanitised markup).
    const html = '<script>alert(1)</script><p>x</p>';
    const original = globalThis.DOMParser;
    // @ts-expect-error — deliberately removing the global for this probe
    delete globalThis.DOMParser;
    try {
      const out = sanitizeBlogHtml(html);
      expect(out).toBe('');
      expect(out).not.toContain('script');
    } finally {
      globalThis.DOMParser = original;
    }
  });
});

describe('the editor text palette', () => {
  // An authored colour is the only ink on the site the design system does not decide, so it is
  // the one place a contrast floor has to be checked against the value itself. The four values
  // are read from the exported list, so adding a swatch means adding a value that passes here.
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  it('clears 4.5:1 on the white article surface it is rendered on', () => {
    for (const colour of BLOG_TEXT_COLORS) {
      const ratio = 1.05 / (luminance(colour) + 0.05);
      expect({ colour, ratio: Number(ratio.toFixed(2)) }).toEqual({
        colour,
        ratio: expect.any(Number),
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is declared once, so the toolbar cannot offer a colour the sanitizer drops', () => {
    const editor = readFileSync(new URL('../../components/blog/RichTextEditor.tsx', import.meta.url), 'utf8');
    expect(editor).toMatch(/BLOG_TEXT_COLORS\.map/);
    expect(editor).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
