'use client'

/**
 * RichTextEditor — TipTap-based editor with optional AI affordances:
 *  · Slash menu (press "/" on an empty line) — 5 inline actions that call
 *    Claude and insert the response at the caret (continue, summarize,
 *    expand, fix grammar, bulletize).
 *  · Bubble menu (select text) — 3 AI actions that replace the selection
 *    (improve, shorten, explain).
 *  · Character / word count via @tiptap/extension-character-count —
 *    streamed back to the parent via onStats.
 *
 * The editor stays fully usable without `aiActions` — nothing AI renders
 * if no handlers are provided. The parent owns the transport (socket.io
 * or HTTP to the notebook backend) and passes in async callbacks that
 * return either a text payload or a user-facing error.
 */

import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Heading1, Heading2, Heading3,
  AlignRight, AlignCenter, AlignLeft, Highlighter,
  Undo2, Redo2, Minus, Sparkles, Wand2, Scissors, BookOpen,
  Loader2, ArrowRight, FileText, ListChecks, Pencil, AlignJustify,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────

export type AiResult = { ok: true; text: string } | { ok: false; error: string }

export interface AiActionsAPI {
  /** Slash menu — insert at caret. */
  continue?: (context: string) => Promise<AiResult>
  summarize?: (context: string) => Promise<AiResult>
  expand?: (paragraph: string, context: string) => Promise<AiResult>
  fix?: (paragraph: string, context: string) => Promise<AiResult>
  toList?: (paragraph: string, context: string) => Promise<AiResult>
  /** Bubble menu — replace selection. */
  improve?: (selection: string, context: string) => Promise<AiResult>
  shorten?: (selection: string, context: string) => Promise<AiResult>
  explain?: (selection: string, context: string) => Promise<AiResult>
}

export interface EditorStats {
  words: number
  chars: number
}

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  editable?: boolean
  /** AI affordances. If omitted, editor is plain. */
  aiActions?: AiActionsAPI
  /** Streams word / char counts every keystroke. */
  onStats?: (s: EditorStats) => void
}

// ─────────────────────────────────────────────────────────────────────
// Slash menu items
// ─────────────────────────────────────────────────────────────────────

type SlashKey = 'continue' | 'summarize' | 'expand' | 'fix' | 'toList'

interface SlashItem {
  key: SlashKey
  label: string
  hint: string
  keywords: string // lowercased, used for fuzzy match against the query after "/"
  icon: React.ComponentType<any>
}

const SLASH_ITEMS: SlashItem[] = [
  { key: 'continue',  label: 'המשך מכאן',       hint: 'AI ממשיך לכתוב במקום שעצרת',      keywords: 'המשך continue המשיך משך',       icon: ArrowRight },
  { key: 'summarize', label: 'סכם עד כאן',      hint: 'סיכום של מה שנכתב עד כה בנקודות', keywords: 'סכם summarize תקציר סיכום',    icon: FileText },
  { key: 'expand',    label: 'הרחב פסקה',       hint: 'מרחיב את הפסקה הנוכחית',          keywords: 'הרחב expand רחב הרחבה פתח',    icon: Wand2 },
  { key: 'fix',       label: 'תקן ניסוח',       hint: 'מתקן דקדוק וזרימה',               keywords: 'תקן fix ניסוח דקדוק',           icon: Pencil },
  { key: 'toList',    label: 'הפוך לרשימה',    hint: 'ממיר את הפסקה לנקודות',           keywords: 'רשימה list bullets בולט',       icon: ListChecks },
]

// ─────────────────────────────────────────────────────────────────────

export default function RichTextEditor({
  content,
  onChange,
  placeholder,
  editable = true,
  aiActions,
  onStats,
}: RichTextEditorProps) {
  // ── Editor ──────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || 'התחל לכתוב...' }),
      CharacterCount.configure({}),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
      if (onStats) {
        const storage = editor.storage.characterCount as { words(): number; characters(): number }
        onStats({ words: storage.words(), chars: storage.characters() })
      }
    },
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
        dir: 'rtl',
      },
    },
  })

  // Sync external content changes.
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  // ── Slash menu state ───────────────────────────────────────────
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null)
  /** Absolute doc position where the "/" was inserted (so we know what to
   *  delete when a command runs). */
  const slashFromRef = useRef<number | null>(null)

  const filteredSlash = useMemo(() => {
    const q = slashQuery.trim().toLowerCase()
    if (!q) return SLASH_ITEMS
    return SLASH_ITEMS.filter(
      it => it.label.toLowerCase().includes(q) || it.keywords.includes(q)
    )
  }, [slashQuery])

  // Reset selected index if the filtered list shrinks.
  useEffect(() => {
    if (slashIndex >= filteredSlash.length) setSlashIndex(0)
  }, [filteredSlash, slashIndex])

  const closeSlash = useCallback(() => {
    setSlashOpen(false)
    setSlashQuery('')
    setSlashIndex(0)
    setSlashPos(null)
    slashFromRef.current = null
  }, [])

  // ── Inline AI run state (spinner + error feedback) ─────────────
  const [busy, setBusy] = useState<null | string>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  useEffect(() => {
    if (!aiError) return
    const id = setTimeout(() => setAiError(null), 4500)
    return () => clearTimeout(id)
  }, [aiError])

  // ── Helpers operating on the current editor state ──────────────

  /** Plain-text dump of the entire doc (what we send as `context`). */
  const getContext = useCallback(() => editor?.getText() || '', [editor])

  /** Plain-text of the paragraph the caret currently sits in. */
  const getCurrentParagraph = useCallback((): { text: string; from: number; to: number } | null => {
    if (!editor) return null
    const { $from } = editor.state.selection
    // Find the nearest block node (paragraph / heading) above the cursor.
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d)
      if (node.isBlock) {
        const from = $from.before(d) + 1
        const to = from + node.content.size
        return { text: node.textContent, from, to }
      }
    }
    return null
  }, [editor])

  // ── Slash menu position tracking ───────────────────────────────
  // Listen to every selection change — if the doc has a solo "/" at the
  // caret start of a word, open the menu. Otherwise, keep querying.
  useEffect(() => {
    if (!editor) return
    const handler = () => {
      if (!editable) return
      const { from } = editor.state.selection
      // Walk backwards to find the nearest "/" that starts the command.
      const line = editor.state.doc.textBetween(
        Math.max(0, from - 80),
        from,
        '\n',
        '\n',
      )
      // Match "/" optionally followed by any non-space chars — we allow
      // Hebrew letters etc. since we're not using unicode property escapes
      // (those would require a newer TS target).
      const m = line.match(/(^|\s)\/([^\s/]*)$/)
      if (!m) {
        if (slashOpen) closeSlash()
        return
      }
      const query = m[2] || ''
      const slashOffset = line.length - m[0].length + (m[1] ? 1 : 0) // pos of "/"
      const absFrom = from - (line.length - slashOffset)
      slashFromRef.current = absFrom

      // Compute caret coords for the floating menu.
      try {
        const coords = editor.view.coordsAtPos(from)
        const container = editor.view.dom.getBoundingClientRect()
        setSlashPos({
          top: coords.bottom - container.top + 6,
          left: coords.left - container.left,
        })
      } catch {
        setSlashPos(null)
      }

      setSlashQuery(query)
      if (!slashOpen) setSlashOpen(true)
    }
    editor.on('selectionUpdate', handler)
    editor.on('update', handler)
    return () => {
      editor.off('selectionUpdate', handler)
      editor.off('update', handler)
    }
  }, [editor, editable, slashOpen, closeSlash])

  // Keyboard navigation inside the slash menu.
  useEffect(() => {
    if (!editor || !slashOpen) return
    const dom = editor.view.dom
    const onKey = (e: KeyboardEvent) => {
      if (!slashOpen) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex(i => Math.min(filteredSlash.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex(i => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = filteredSlash[slashIndex]
        if (item) runSlashCommand(item.key)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeSlash()
      }
    }
    dom.addEventListener('keydown', onKey, true)
    return () => dom.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, slashOpen, slashIndex, filteredSlash])

  // ── Run a slash command ─────────────────────────────────────────
  const runSlashCommand = useCallback(async (key: SlashKey) => {
    if (!editor || !aiActions) { closeSlash(); return }
    const from = slashFromRef.current
    const to = editor.state.selection.from
    closeSlash()
    // Remove the "/query" we typed.
    if (from !== null) {
      editor.chain().focus().deleteRange({ from, to }).run()
    }

    // Insert a subtle ephemeral marker? We'll just show a spinner banner.
    setBusy(key)
    setAiError(null)
    try {
      const ctx = getContext()
      const para = getCurrentParagraph()
      let res: AiResult | undefined

      if (key === 'continue' && aiActions.continue) res = await aiActions.continue(ctx)
      else if (key === 'summarize' && aiActions.summarize) res = await aiActions.summarize(ctx)
      else if (key === 'expand' && aiActions.expand) res = await aiActions.expand(para?.text || '', ctx)
      else if (key === 'fix' && aiActions.fix) res = await aiActions.fix(para?.text || '', ctx)
      else if (key === 'toList' && aiActions.toList) res = await aiActions.toList(para?.text || '', ctx)

      if (!res) { setAiError('פעולה זו לא זמינה.'); return }
      if (!res.ok) { setAiError(res.error); return }

      if (key === 'toList' && para) {
        // Replace the paragraph's content with a bullet list of lines.
        const lines = res.text.split('\n').map(s => s.replace(/^[-•·]\s?/, '').trim()).filter(Boolean)
        if (lines.length > 0) {
          editor.chain().focus()
            .deleteRange({ from: para.from - 1, to: para.to + 1 })
            .insertContent({
              type: 'bulletList',
              content: lines.map(l => ({
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: l }] }],
              })),
            })
            .run()
          return
        }
      }

      if ((key === 'expand' || key === 'fix') && para) {
        editor.chain().focus().setTextSelection({ from: para.from, to: para.to }).insertContent(res.text).run()
        return
      }

      if (key === 'continue' || key === 'summarize') {
        // Insert as plain text at caret, keeping line breaks.
        const text = res.text
        editor.chain().focus().insertContent(text.replace(/\n/g, '<br/>')).run()
        return
      }
    } catch (err) {
      setAiError(`שגיאה: ${String(err)}`)
    } finally {
      setBusy(null)
    }
  }, [editor, aiActions, closeSlash, getContext, getCurrentParagraph])

  // ── Bubble menu action runner ──────────────────────────────────
  const runBubbleAction = useCallback(async (key: 'improve' | 'shorten' | 'explain') => {
    if (!editor || !aiActions) return
    const { from, to, empty } = editor.state.selection
    if (empty) return
    const selection = editor.state.doc.textBetween(from, to, '\n', '\n')
    setBusy(key)
    setAiError(null)
    try {
      const ctx = getContext()
      let res: AiResult | undefined
      if (key === 'improve' && aiActions.improve) res = await aiActions.improve(selection, ctx)
      else if (key === 'shorten' && aiActions.shorten) res = await aiActions.shorten(selection, ctx)
      else if (key === 'explain' && aiActions.explain) res = await aiActions.explain(selection, ctx)

      if (!res) { setAiError('פעולה זו לא זמינה.'); return }
      if (!res.ok) { setAiError(res.error); return }

      if (key === 'explain') {
        // Append explanation on a new line after the selection, styled as a quote-ish block.
        editor.chain().focus()
          .setTextSelection({ from: to, to })
          .insertContent(`<p><em>${escapeHtml(res.text)}</em></p>`)
          .run()
      } else {
        editor.chain().focus()
          .setTextSelection({ from, to })
          .insertContent(res.text)
          .run()
      }
    } catch (err) {
      setAiError(`שגיאה: ${String(err)}`)
    } finally {
      setBusy(null)
    }
  }, [editor, aiActions, getContext])

  // ───────────────────────────────────────────────────────────────

  if (!editor) return null

  const ToolButton = ({
    onClick, active, children, title,
  }: { onClick: () => void; active?: boolean; children: React.ReactNode; title: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-all ${
        active ? 'bg-indigo-500/20 text-indigo-400' : 'text-ink-muted hover:text-ink hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )
  const Divider = () => <div className="w-px h-5 bg-white/10 mx-0.5" />

  return (
    <div
      className="rich-editor-root rounded-xl overflow-hidden relative"
      style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
    >
      {/* Toolbar */}
      {editable && (
        <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-white/5"
             style={{ background: 'rgba(255,255,255,0.03)' }}>
          <ToolButton onClick={() => editor.chain().focus().undo().run()} title="בטל"><Undo2 size={14} /></ToolButton>
          <ToolButton onClick={() => editor.chain().focus().redo().run()} title="בצע שוב"><Redo2 size={14} /></ToolButton>
          <Divider />
          <ToolButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="כותרת 1"><Heading1 size={14} /></ToolButton>
          <ToolButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="כותרת 2"><Heading2 size={14} /></ToolButton>
          <ToolButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="כותרת 3"><Heading3 size={14} /></ToolButton>
          <Divider />
          <ToolButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="מודגש"><Bold size={14} /></ToolButton>
          <ToolButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="נטוי"><Italic size={14} /></ToolButton>
          <ToolButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="קו תחתון"><UnderlineIcon size={14} /></ToolButton>
          <ToolButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="קו חוצה"><Strikethrough size={14} /></ToolButton>
          <ToolButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="סימון"><Highlighter size={14} /></ToolButton>
          <Divider />
          <ToolButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="רשימת נקודות"><List size={14} /></ToolButton>
          <ToolButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="רשימה ממוספרת"><ListOrdered size={14} /></ToolButton>
          <Divider />
          <ToolButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="ימין"><AlignRight size={14} /></ToolButton>
          <ToolButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="מרכז"><AlignCenter size={14} /></ToolButton>
          <ToolButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="שמאל"><AlignLeft size={14} /></ToolButton>
          <Divider />
          <ToolButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="קו מפריד"><Minus size={14} /></ToolButton>
          {aiActions && (
            <>
              <div className="flex-1" />
              <span className="text-[10px] text-indigo-300/70 flex items-center gap-1 pr-1" title="הקלד / בתוך הטקסט כדי לקבל פעולות AI">
                <Sparkles size={11} /> AI — הקלד /
              </span>
            </>
          )}
        </div>
      )}

      {/* Editor area */}
      <EditorContent editor={editor} />

      {/* Bubble menu (AI actions on selection) */}
      {aiActions && editable && (
        <BubbleMenu
          editor={editor}
          options={{ placement: 'top' }}
          updateDelay={120}
          shouldShow={(props: { state: any; from: number; to: number }) => {
            const { state, from, to } = props
            if (from === to) return false
            const text = state.doc.textBetween(from, to, '\n', '\n').trim()
            return text.length >= 2
          }}
        >
          <div
            className="flex items-center gap-0.5 rounded-xl shadow-xl border px-1 py-1"
            style={{
              background: 'rgba(15, 17, 28, 0.96)',
              borderColor: 'rgba(184,169,255,0.22)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(184,169,255,0.1)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <BubbleBtn onClick={() => runBubbleAction('improve')} busy={busy === 'improve'} icon={<Wand2 size={12} />} label="שפר" />
            <BubbleBtn onClick={() => runBubbleAction('shorten')} busy={busy === 'shorten'} icon={<Scissors size={12} />} label="קצר" />
            <BubbleBtn onClick={() => runBubbleAction('explain')} busy={busy === 'explain'} icon={<BookOpen size={12} />} label="הסבר" />
          </div>
        </BubbleMenu>
      )}

      {/* Slash menu (AI actions at caret) */}
      {aiActions && slashOpen && slashPos && filteredSlash.length > 0 && (
        <div
          className="absolute z-50 rounded-xl border shadow-2xl py-1"
          style={{
            top: slashPos.top,
            left: slashPos.left,
            minWidth: 260,
            background: 'rgba(15, 17, 28, 0.97)',
            borderColor: 'rgba(184,169,255,0.25)',
            boxShadow: '0 18px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(184,169,255,0.12)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-indigo-300/70 flex items-center gap-1.5">
            <Sparkles size={10} /> פעולות AI
          </div>
          {filteredSlash.map((item, idx) => {
            const Icon = item.icon
            const active = idx === slashIndex
            return (
              <button
                key={item.key}
                type="button"
                onMouseEnter={() => setSlashIndex(idx)}
                onMouseDown={e => { e.preventDefault(); runSlashCommand(item.key) }}
                className={`w-full flex items-start gap-2.5 px-3 py-2 text-right transition-colors ${
                  active ? 'bg-indigo-500/18' : 'hover:bg-white/5'
                }`}
                style={{ color: active ? '#E2DEFF' : '#C9C4E3' }}
              >
                <span
                  className="mt-0.5 shrink-0 rounded-md p-1"
                  style={{ background: active ? 'rgba(184,169,255,0.18)' : 'rgba(255,255,255,0.04)' }}
                >
                  <Icon size={12} />
                </span>
                <span className="flex flex-col items-end">
                  <span className="text-[13px] leading-tight">{item.label}</span>
                  <span className="text-[11px] text-[#8A8FA8] leading-tight">{item.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Busy banner — floats bottom-left (RTL) */}
      {busy && (
        <div
          className="absolute bottom-3 right-3 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] border"
          style={{
            background: 'rgba(15, 17, 28, 0.92)',
            borderColor: 'rgba(184,169,255,0.3)',
            color: '#E2DEFF',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Loader2 size={12} className="animate-spin" />
          <span>AI חושב...</span>
        </div>
      )}

      {/* Error toast */}
      {aiError && (
        <div
          className="absolute bottom-3 right-3 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] border"
          style={{
            background: 'rgba(40, 15, 20, 0.96)',
            borderColor: 'rgba(248,113,113,0.35)',
            color: '#fecaca',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span>⚠ {aiError}</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────

function BubbleBtn({
  onClick, busy, icon, label,
}: { onClick: () => void; busy: boolean; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      disabled={busy}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors disabled:opacity-60"
      style={{ color: '#E2DEFF' }}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : icon}
      <span>{label}</span>
    </button>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
