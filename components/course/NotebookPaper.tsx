'use client'

/**
 * NotebookPaper — a presentational wrapper that makes whatever children
 * you pass it look like a page torn from a ruled notebook.
 *
 * Responsibilities:
 *  · Swap the dark-glass background for warm paper with blue ruled lines
 *    and a red right-side margin (RTL layout).
 *  · Expose user-controllable reading comfort: paper color, font family,
 *    text size, line spacing, lines on/off.
 *  · Keep the styling layer self-contained (CSS vars + one <style jsx>),
 *    so the parent only needs to render <NotebookPaper prefs=...>editor</NotebookPaper>.
 *
 * The prefs state is owned by the parent (so it can persist to
 * localStorage) — this component is a pure presenter + a settings panel.
 */

import { useState } from 'react'
import { Settings2, Check } from 'lucide-react'

export type PaperColor = 'white' | 'cream' | 'blush' | 'dark'
export type FontFamily = 'sans' | 'serif' | 'hand'
export type TextSize = 'sm' | 'md' | 'lg' | 'xl'
export type LineGap = 'tight' | 'normal' | 'roomy'

export interface NotebookPrefs {
  paper: PaperColor
  fontFamily: FontFamily
  textSize: TextSize
  lineGap: LineGap
  showLines: boolean
}

interface Props extends NotebookPrefs {
  children: React.ReactNode
  onChange: (patch: Partial<NotebookPrefs>) => void
  headerRight?: React.ReactNode
}

const PAPER_BG: Record<PaperColor, string> = {
  white: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)',
  cream: 'linear-gradient(180deg, #fffdf6 0%, #fbf6e8 100%)',
  blush: 'linear-gradient(180deg, #fffafb 0%, #fdf0f1 100%)',
  dark:  'linear-gradient(180deg, #1a1730 0%, #141023 100%)',
}

const PAPER_INK: Record<PaperColor, string> = {
  white: '#0f172a',
  cream: '#1f1a08',
  blush: '#2b1a20',
  dark:  '#e8e5fa',
}

const PAPER_MARGIN_LINE: Record<PaperColor, string> = {
  white: 'rgba(239,68,68,0.55)',
  cream: 'rgba(239,68,68,0.55)',
  blush: 'rgba(239,68,68,0.55)',
  dark:  'rgba(248,113,113,0.45)',
}

const PAPER_RULED: Record<PaperColor, string> = {
  white: 'rgba(59,130,246,0.32)',
  cream: 'rgba(138,180,232,0.45)',
  blush: 'rgba(129,140,248,0.4)',
  dark:  'rgba(139,127,240,0.18)',
}

const FONT_STACK: Record<FontFamily, string> = {
  sans:  '"Segoe UI", "Heebo", system-ui, sans-serif',
  serif: '"David", "David Libre", Georgia, serif',
  hand:  '"Assistant", "Segoe Script", "Comic Sans MS", cursive',
}

const TEXT_SIZE: Record<TextSize, number> = { sm: 14, md: 16, lg: 18, xl: 20 }
const LINE_GAP:  Record<LineGap,  number> = { tight: 28, normal: 32, roomy: 38 }

export default function NotebookPaper({
  children,
  paper, fontFamily, textSize, lineGap, showLines,
  onChange, headerRight,
}: Props) {
  const [open, setOpen] = useState(false)

  const gap = LINE_GAP[lineGap]
  const size = TEXT_SIZE[textSize]
  const fontStack = FONT_STACK[fontFamily]
  const bg = PAPER_BG[paper]
  const ink = PAPER_INK[paper]
  const margin = PAPER_MARGIN_LINE[paper]
  const ruled = PAPER_RULED[paper]
  const isDarkPaper = paper === 'dark'

  return (
    <div
      className="notebook-paper relative rounded-2xl overflow-hidden border"
      style={{
        background: bg,
        borderColor: isDarkPaper ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
        boxShadow: isDarkPaper
          ? '0 20px 50px -20px rgba(0,0,0,0.6)'
          : '0 18px 45px -18px rgba(15,23,42,0.25), inset 0 1px 0 rgba(255,255,255,0.7)',
        ['--np-ink' as any]: ink,
        ['--np-font' as any]: fontStack,
        ['--np-size' as any]: `${size}px`,
        ['--np-gap' as any]: `${gap}px`,
      }}
    >
      {/* Header strip (title label + settings button) */}
      <div
        className="flex items-center justify-between px-5 py-2.5 border-b"
        style={{ borderColor: isDarkPaper ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: isDarkPaper ? 'rgba(232,229,250,0.65)' : 'rgba(15,23,42,0.55)' }}
        >
          סיכום השיעור
        </span>
        <div className="flex items-center gap-2">
          {headerRight}
          <button
            onClick={() => setOpen(v => !v)}
            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full transition-colors"
            style={{
              background: isDarkPaper ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)',
              color: isDarkPaper ? '#e8e5fa' : '#334155',
            }}
            title="התאם עיצוב"
          >
            <Settings2 size={12} /> עיצוב
          </button>
        </div>
      </div>

      {/* Settings panel (collapsible) */}
      {open && (
        <div
          className="px-5 py-3 border-b text-[11px]"
          style={{
            background: isDarkPaper ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)',
            borderColor: isDarkPaper ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            color: isDarkPaper ? '#e8e5fa' : '#334155',
          }}
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            <PrefRow label="צבע דף">
              <Swatch active={paper === 'white'} onClick={() => onChange({ paper: 'white' })} color="#ffffff" label="לבן" />
              <Swatch active={paper === 'cream'} onClick={() => onChange({ paper: 'cream' })} color="#fbf6e8" label="שמנת" />
              <Swatch active={paper === 'blush'} onClick={() => onChange({ paper: 'blush' })} color="#fdf0f1" label="ורוד" />
              <Swatch active={paper === 'dark'}  onClick={() => onChange({ paper: 'dark' })}  color="#1a1730" label="כהה" />
            </PrefRow>

            <PrefRow label="פונט">
              <PrefChip active={fontFamily === 'serif'} onClick={() => onChange({ fontFamily: 'serif' })}>ספר</PrefChip>
              <PrefChip active={fontFamily === 'sans'}  onClick={() => onChange({ fontFamily: 'sans' })}>רגיל</PrefChip>
              <PrefChip active={fontFamily === 'hand'}  onClick={() => onChange({ fontFamily: 'hand' })}>כתב יד</PrefChip>
            </PrefRow>

            <PrefRow label="גודל טקסט">
              <PrefChip active={textSize === 'sm'} onClick={() => onChange({ textSize: 'sm' })}>קטן</PrefChip>
              <PrefChip active={textSize === 'md'} onClick={() => onChange({ textSize: 'md' })}>רגיל</PrefChip>
              <PrefChip active={textSize === 'lg'} onClick={() => onChange({ textSize: 'lg' })}>גדול</PrefChip>
              <PrefChip active={textSize === 'xl'} onClick={() => onChange({ textSize: 'xl' })}>ענק</PrefChip>
            </PrefRow>

            <PrefRow label="מרווח שורה">
              <PrefChip active={lineGap === 'tight'}  onClick={() => onChange({ lineGap: 'tight' })}>צר</PrefChip>
              <PrefChip active={lineGap === 'normal'} onClick={() => onChange({ lineGap: 'normal' })}>רגיל</PrefChip>
              <PrefChip active={lineGap === 'roomy'}  onClick={() => onChange({ lineGap: 'roomy' })}>רחב</PrefChip>
            </PrefRow>

            <PrefRow label="שורות מחברת">
              <PrefChip active={showLines}  onClick={() => onChange({ showLines: true })}>מוצגות</PrefChip>
              <PrefChip active={!showLines} onClick={() => onChange({ showLines: false })}>חבויות</PrefChip>
            </PrefRow>
          </div>
        </div>
      )}

      {/* The paper + lines */}
      <div className="relative" style={{ minHeight: 440 }}>
        {/* Red margin (RTL → on the right) */}
        <div
          className="absolute top-0 bottom-0 w-[1.5px] pointer-events-none"
          style={{ right: 42, background: margin }}
        />

        {/* Ruled lines */}
        {showLines && (
          <div
            className="absolute inset-x-[20px] top-[24px] bottom-[24px] pointer-events-none"
            style={{
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${gap - 1}px, ${ruled} ${gap - 1}px ${gap}px)`,
            }}
          />
        )}

        {/* Children (typically the TipTap editor) */}
        <div className="relative">
          {children}
        </div>
      </div>

      {/* Global-ish styles for the embedded editor */}
      <style jsx>{`
        .notebook-paper :global(.rich-editor-content),
        .notebook-paper :global(.ProseMirror) {
          color: var(--np-ink);
          font-family: var(--np-font);
          font-size: var(--np-size);
          line-height: var(--np-gap);
          min-height: 440px;
          padding: 24px 56px 24px 28px; /* right padding clears the red margin */
          background: transparent !important;
        }
        .notebook-paper :global(.ProseMirror p) {
          margin: 0;
          line-height: var(--np-gap);
        }
        .notebook-paper :global(.ProseMirror h1),
        .notebook-paper :global(.ProseMirror h2),
        .notebook-paper :global(.ProseMirror h3) {
          color: var(--np-ink);
          line-height: var(--np-gap);
        }
        .notebook-paper :global(.ProseMirror ::selection) {
          background: rgba(99,102,241,0.28);
        }
        .notebook-paper :global(.ProseMirror p.is-editor-empty:first-child::before) {
          color: rgba(100,116,139,0.75);
          content: attr(data-placeholder);
          float: right;
          pointer-events: none;
          height: 0;
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────

function PrefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 opacity-70">{label}</span>
      <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
    </div>
  )
}

function PrefChip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full border text-[11px] transition-all ${
        active
          ? 'bg-indigo-500 border-indigo-400 text-white shadow-sm'
          : 'bg-white/60 border-slate-300/60 text-slate-700 hover:bg-white'
      }`}
    >
      {children}
    </button>
  )
}

function Swatch({ active, onClick, color, label }: {
  active: boolean; onClick: () => void; color: string; label: string
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative w-6 h-6 rounded-full border-2 transition-all ${
        active ? 'border-indigo-500 scale-110' : 'border-slate-300/60 hover:border-slate-400'
      }`}
      style={{ background: color }}
    >
      {active && (
        <Check
          size={12}
          className="absolute inset-0 m-auto"
          color={color === '#1a1730' ? '#fff' : '#1e293b'}
        />
      )}
    </button>
  )
}
