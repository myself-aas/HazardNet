import React, { useCallback, useEffect, useRef, useState } from 'react';
import MaterialIcon from '../MaterialIcon';
import { readingTimeMinutes, wordCount } from '../../lib/blogArticles';

/**
 * Dependency-free rich text editor for the HazardNet blog studio.
 *
 * Built on contentEditable + document.execCommand (universally supported,
 * deprecated-but-stable) so no new packages are added to the lockfile.
 * Features: block formats (paragraph/H1–H3/quote/code), bold/italic/underline/
 * strikethrough, ordered & unordered lists, alignment, links, inline images,
 * horizontal rule, text color, clear formatting, undo/redo, an HTML source
 * view, and live word count / reading time.
 */

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  /** Minimum editor height class (tailwind). */
  minHeightClass?: string;
  disabled?: boolean;
}

type Tool =
  | 'undo'
  | 'redo'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'justifyLeft'
  | 'justifyCenter'
  | 'justifyRight'
  | 'justifyFull'
  | 'removeFormat';

const INLINE_TOOLS: Array<{ cmd: Tool; icon: string; label: string }> = [
  { cmd: 'undo', icon: 'history', label: 'Undo (Ctrl+Z)' },
  { cmd: 'redo', icon: 'autorenew', label: 'Redo (Ctrl+Y)' },
  { cmd: 'bold', icon: 'bolt', label: 'Bold (Ctrl+B)' },
  { cmd: 'italic', icon: 'article', label: 'Italic (Ctrl+I)' },
  { cmd: 'underline', icon: 'code', label: 'Underline (Ctrl+U)' },
  { cmd: 'strikeThrough', icon: 'x', label: 'Strikethrough' },
  { cmd: 'insertUnorderedList', icon: 'menu', label: 'Bulleted list' },
  { cmd: 'insertOrderedList', icon: 'menu_book', label: 'Numbered list' },
  { cmd: 'justifyLeft', icon: 'doc', label: 'Align left' },
  { cmd: 'justifyCenter', icon: 'folder', label: 'Align center' },
  { cmd: 'justifyRight', icon: 'event_note', label: 'Align right' },
  { cmd: 'justifyFull', label: 'Justify', icon: 'description' },
  { cmd: 'removeFormat', icon: 'clear', label: 'Clear formatting' },
];

const BLOCK_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'p', label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'blockquote', label: 'Blockquote' },
  { value: 'pre', label: 'Code block' },
];

const exec = (command: string, value?: string): boolean => {
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
};

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  minHeightClass = 'min-h-[380px]',
  disabled = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [sourceView, setSourceView] = useState(false);
  const [block, setBlock] = useState('p');

  // Keep the editable region in sync when the value is replaced externally
  // (article load, source-view round-trip) without clobbering the caret.
  useEffect(() => {
    const el = editorRef.current;
    if (el && !sourceView && el.innerHTML !== value) el.innerHTML = value || '';
  }, [value, sourceView]);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (el) onChange(el.innerHTML);
  }, [onChange]);

  const runTool = (cmd: Tool) => {
    if (disabled) return;
    editorRef.current?.focus();
    exec(cmd);
    emit();
  };

  const applyBlock = (tag: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    setBlock(tag);
    // formatBlock wraps the current block; browsers accept <h1>… forms.
    exec('formatBlock', tag === 'p' ? '<p>' : `<${tag}>`);
    emit();
  };

  const insertLink = () => {
    if (disabled) return;
    const url = window.prompt('Link URL (https://…)');
    if (!url) return;
    editorRef.current?.focus();
    exec('createLink', url);
    emit();
  };

  /**
   * Affiliate link: inserts an anchor already tagged with
   * rel="sponsored nofollow noopener" (Google's affiliate-link guideline) and
   * target="_blank", so monetized links never pass link equity.
   */
  const insertAffiliateLink = () => {
    if (disabled) return;
    const url = window.prompt('Affiliate URL (https://…)');
    if (!url) return;
    const selected = window.getSelection()?.toString() || '';
    const text = window.prompt('Link text', selected || 'Check price') || '';
    if (!text) return;
    editorRef.current?.focus();
    exec(
      'insertHTML',
      `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="sponsored nofollow noopener">${text.replace(/[<>]/g, '')}</a>&nbsp;`,
    );
    emit();
  };

  const insertImage = () => {
    if (disabled) return;
    const url = window.prompt('Image URL (https://…)');
    if (!url) return;
    editorRef.current?.focus();
    exec('insertImage', url);
    emit();
  };

  const insertHr = () => {
    if (disabled) return;
    editorRef.current?.focus();
    exec('insertHorizontalRule');
    emit();
  };

  const textColor = (color: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    exec('foreColor', color);
    emit();
  };

  const words = wordCount(value);

  const toolButton = (key: string, label: string, icon: string, onClick: () => void, active = false) => (
    <button
      key={key}
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep the text selection
      onClick={onClick}
      disabled={disabled}
      className={`h-8 min-w-8 px-1.5 rounded-lg text-[13px] font-black transition-colors cursor-pointer disabled:opacity-40 ${
        active ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'text-slate-600 hover:bg-slate-100 border border-transparent'
      }`}
    >
      <MaterialIcon name={icon} className="w-4 h-4" />
    </button>
  );

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs" data-testid="rich-text-editor">
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-1 p-2 border-b border-slate-200 bg-slate-50/80 sticky top-0 z-10"
        role="toolbar"
        aria-label="Formatting toolbar"
      >
        <select
          value={block}
          onChange={(e) => applyBlock(e.target.value)}
          disabled={disabled}
          aria-label="Block format"
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 cursor-pointer disabled:opacity-40"
        >
          {BLOCK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <span className="w-px h-6 bg-slate-200 mx-1" aria-hidden="true" />

        {INLINE_TOOLS.map((tool) => toolButton(tool.cmd, tool.label, tool.icon, () => runTool(tool.cmd)))}

        <span className="w-px h-6 bg-slate-200 mx-1" aria-hidden="true" />

        {toolButton('link', 'Insert link', 'share', insertLink)}
        {toolButton('affiliate', 'Insert affiliate link (rel=sponsored)', 'attach_money', insertAffiliateLink)}
        {toolButton('unlink', 'Remove link', 'cancel', () => runTool('unlink' as Tool))}
        {toolButton('image', 'Insert image from URL', 'camera', insertImage)}
        {toolButton('hr', 'Horizontal rule', 'expand_less', insertHr)}

        <span className="w-px h-6 bg-slate-200 mx-1" aria-hidden="true" />

        <div className="flex items-center gap-1" role="group" aria-label="Text color">
          {['#0f172a', '#b91c1c', '#1d4ed8', '#15803d', '#d08305'].map((color) => (
            <button
              key={color}
              type="button"
              title={`Text color ${color}`}
              aria-label={`Set text color ${color}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => textColor(color)}
              disabled={disabled}
              className="h-6 w-6 rounded-full border border-slate-300 hover:scale-110 transition-transform cursor-pointer disabled:opacity-40"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        <span className="flex-1" />

        <button
          type="button"
          onClick={() => setSourceView((v) => !v)}
          disabled={disabled}
          className={`h-8 px-2.5 rounded-lg text-[10px] font-black transition-colors cursor-pointer disabled:opacity-40 ${
            sourceView ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="Toggle HTML source view"
        >
          {sourceView ? 'VISUAL' : '</> HTML'}
        </button>
      </div>

      {/* Editable surface / source view */}
      {sourceView ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          aria-label="HTML source"
          className={`w-full ${minHeightClass} p-4 font-mono text-xs text-slate-800 outline-none resize-y bg-slate-950 text-slate-100`}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          role="textbox"
          aria-multiline="true"
          aria-label="Article body"
          data-placeholder="Write your article… use the toolbar for headings, lists, quotes, links and images."
          className={`w-full ${minHeightClass} p-4 sm:p-5 text-sm leading-relaxed text-slate-800 prose-blog outline-none overflow-y-auto max-h-[60vh] disabled:opacity-50`}
        />
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2 border-t border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-500">
        <span className="font-mono">{words} words · ~{readingTimeMinutes(value)} min read</span>
        <span className="font-mono">{sourceView ? 'SOURCE VIEW' : 'VISUAL EDITOR'}</span>
      </div>
    </div>
  );
};

export default RichTextEditor;
