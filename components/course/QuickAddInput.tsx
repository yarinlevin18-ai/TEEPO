'use client'

/**
 * Always-visible one-line quick-add input.
 *
 * Design goals:
 * - Zero friction: input is always visible, Enter submits.
 * - No modals, no toggle, no "+ click → form" flow.
 * - Tiny "added ✓" pulse after submit so the user knows it worked.
 */

import { useState } from 'react'
import { Plus, Loader2, Check } from 'lucide-react'

interface Props {
  placeholder: string
  /** Called with the raw trimmed text. Return a Promise — we show a saving state during it. */
  onAdd: (text: string) => Promise<unknown>
  /** Optional color accent (used for the "+" icon and focus ring). */
  accent?: 'indigo' | 'amber' | 'violet'
}

export default function QuickAddInput({ placeholder, onAdd, accent = 'indigo' }: Props) {
  const [value, setValue] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'added'>('idle')

  const accentColor = {
    indigo: '#818cf8',
    amber:  '#f59e0b',
    violet: '#a78bfa',
  }[accent]

  const submit = async () => {
    const text = value.trim()
    if (!text) return
    setState('saving')
    try {
      await onAdd(text)
      setValue('')
      setState('added')
      setTimeout(() => setState('idle'), 1200)
    } catch {
      setState('idle')
    }
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${state === 'added' ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <span className="flex-shrink-0 flex items-center justify-center w-5 h-5">
        {state === 'saving' ? (
          <Loader2 size={13} className="animate-spin" style={{ color: accentColor }} />
        ) : state === 'added' ? (
          <Check size={13} style={{ color: '#4ade80' }} />
        ) : (
          <Plus size={13} style={{ color: accentColor }} />
        )}
      </span>

      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        placeholder={placeholder}
        disabled={state === 'saving'}
        className="flex-1 bg-transparent border-0 outline-none text-sm text-ink placeholder:text-ink-subtle disabled:opacity-50"
      />

      <span className="text-[10px] text-ink-subtle font-mono tracking-tight hidden sm:inline">
        ↵
      </span>
    </div>
  )
}
