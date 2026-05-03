'use client'

/**
 * TeepoCompanion — the dashboard greeting mascot with a rotating quote
 * speech bubble.
 *
 * - State (mood) reflects the weather.
 * - Bubble cycles through funny famous quotes every 14 seconds.
 * - Click TEEPO to advance to a new quote immediately.
 */

import { useEffect, useState } from 'react'
import Teepo, { type TeepoState } from '@/components/Teepo'
import { pickQuote, type TeepoQuote } from '@/lib/teepo-quotes'

interface Props {
  state: TeepoState
  weather?: string
  /** Pixel size for TEEPO. Defaults to a roomier 92 (was 68). */
  size?: number
}

export default function TeepoCompanion({ state, size = 92 }: Props) {
  const [{ index, quote }, setQuote] = useState<{ index: number; quote: TeepoQuote }>(
    () => pickQuote(),
  )

  // Rotate at irregular intervals between 9 and 22 seconds — picked
  // fresh after each quote change so the rhythm feels human, not a
  // metronome. setTimeout chain rather than setInterval since the
  // delay varies each cycle.
  useEffect(() => {
    let cancelled = false
    let timerId: ReturnType<typeof setTimeout> | null = null

    const schedule = () => {
      const delay = 9000 + Math.floor(Math.random() * 13_000) // 9–22 s
      timerId = setTimeout(() => {
        if (cancelled) return
        setQuote((prev) => pickQuote(prev.index))
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      cancelled = true
      if (timerId) clearTimeout(timerId)
    }
  }, [])

  return (
    <div className="teepo-companion" dir="rtl">
      {/* Speech bubble — sits to the LEFT of TEEPO in RTL flow.
       * key=index forces a fresh fade-in animation when the quote changes. */}
      <div className="teepo-companion__bubble" key={index}>
        <p className="teepo-companion__text">"{quote.text}"</p>
        <p className="teepo-companion__author">— {quote.author}</p>
      </div>

      <div className="teepo-companion__mascot" aria-label={`TEEPO: ${quote.text}`}>
        <Teepo state={state} size={size} />
      </div>

      <style jsx>{`
        .teepo-companion {
          display: flex;
          align-items: center;
          gap: 0.875rem;
          max-width: 360px;
        }

        .teepo-companion__mascot {
          flex-shrink: 0;
          line-height: 0;
        }

        .teepo-companion__bubble {
          flex: 1;
          min-width: 0;
          position: relative;
          background: linear-gradient(
            135deg,
            rgba(167, 145, 255, 0.18) 0%,
            rgba(99, 102, 241, 0.10) 100%
          );
          border: 1px solid rgba(167, 145, 255, 0.28);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          border-radius: 18px 18px 18px 6px;
          padding: 0.75rem 1rem;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
          animation: bubble-in 380ms cubic-bezier(0.22, 1, 0.36, 1);
          max-width: 260px;
        }

        /* Pointer arrow toward TEEPO (LTR-mirrored: arrow on the LEFT
         * because TEEPO sits LEFT of the bubble in RTL flow). */
        .teepo-companion__bubble::before {
          content: '';
          position: absolute;
          bottom: 12px;
          left: -7px;
          width: 14px;
          height: 14px;
          background: linear-gradient(
            135deg,
            rgba(167, 145, 255, 0.18) 0%,
            rgba(99, 102, 241, 0.10) 100%
          );
          border-left: 1px solid rgba(167, 145, 255, 0.28);
          border-bottom: 1px solid rgba(167, 145, 255, 0.28);
          transform: rotate(45deg);
        }

        .teepo-companion__text {
          margin: 0;
          font-size: 0.8125rem;
          line-height: 1.4;
          color: #f1f5f9;
          font-weight: 500;
        }

        .teepo-companion__author {
          margin: 0.375rem 0 0 0;
          font-size: 0.6875rem;
          color: rgb(167, 145, 255);
          font-weight: 600;
        }

        @keyframes bubble-in {
          0%   { opacity: 0; transform: translateY(4px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0)   scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .teepo-companion__bubble { animation: none; }
        }

        @media (max-width: 640px) {
          .teepo-companion__bubble { display: none; }
        }
      `}</style>
    </div>
  )
}
