'use client'

/**
 * <SlidingPuzzle /> — 3×3 daily sliding puzzle.
 *
 * Source: teepo-design/mockup_dashboard.html (.puzzle-mini block + the JS
 * IIFE at the bottom). Behavior mirrors the mockup verbatim:
 *   - Tiles 1-8 + one empty slot.
 *   - Initial state is the solved board, then 200 random valid moves are
 *     applied (guarantees solvable, plus consistently hard). This avoids
 *     the classic "shuffled but unsolvable" bug.
 *   - Clicking a tile adjacent to the empty cell swaps them.
 *   - Live timer starts on first move; counts up MM:SS.
 *   - Move counter increments per swap.
 *   - On win: every tile flashes green in sequence, then an alert (matches
 *     mockup; future could be a toast).
 *
 * The 'solve' button resets to the solved board so the user can see what
 * the goal looks like.
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const SIZE = 3
const TOTAL = SIZE * SIZE
const SOLVED = [1, 2, 3, 4, 5, 6, 7, 8, 0] as const

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Apply 200 random valid swaps starting from the solved state. */
function scramble(): number[] {
  const tiles = [...SOLVED]
  let lastDir = -1
  for (let n = 0; n < 200; n++) {
    const empty = tiles.indexOf(0)
    const eRow = Math.floor(empty / SIZE)
    const eCol = empty % SIZE
    const neighbors: { i: number; dir: number }[] = []
    if (eRow > 0)        neighbors.push({ i: empty - SIZE, dir: 0 })
    if (eRow < SIZE - 1) neighbors.push({ i: empty + SIZE, dir: 1 })
    if (eCol > 0)        neighbors.push({ i: empty - 1,    dir: 2 })
    if (eCol < SIZE - 1) neighbors.push({ i: empty + 1,    dir: 3 })
    // Avoid undoing the previous move so the scramble doesn't collapse.
    const choices = neighbors.filter(x => x.dir !== (lastDir ^ 1))
    const pick = choices[Math.floor(Math.random() * choices.length)]
    ;[tiles[empty], tiles[pick.i]] = [tiles[pick.i], tiles[empty]]
    lastDir = pick.dir
  }
  return tiles
}

function isSolved(tiles: readonly number[]): boolean {
  for (let i = 0; i < TOTAL - 1; i++) {
    if (tiles[i] !== i + 1) return false
  }
  return tiles[TOTAL - 1] === 0
}

export default function SlidingPuzzle() {
  const [tiles, setTiles] = useState<number[]>(() => [...SOLVED])
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [won, setWon] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedRef = useRef(false)
  const hydratedRef = useRef(false)

  // Initial scramble — must happen on the client to avoid SSR mismatch
  // (Math.random differs between server and client renders).
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    setTiles(scramble())
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    if (timerRef.current) return
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }, [])

  useEffect(() => () => stopTimer(), [stopTimer])

  function reshuffle() {
    setTiles(scramble())
    setMoves(0)
    setSeconds(0)
    setWon(false)
    startedRef.current = false
    stopTimer()
  }

  function showSolved() {
    if (!confirm('להציג את הפתרון? זה יאפס את הניסיון.')) return
    setTiles([...SOLVED])
    setMoves(0)
    setSeconds(0)
    setWon(false)
    startedRef.current = false
    stopTimer()
  }

  function tryMove(idx: number) {
    if (won) return
    const empty = tiles.indexOf(0)
    const row = Math.floor(idx / SIZE)
    const col = idx % SIZE
    const eRow = Math.floor(empty / SIZE)
    const eCol = empty % SIZE
    const adjacent = Math.abs(row - eRow) + Math.abs(col - eCol) === 1
    if (!adjacent) return
    const next = [...tiles]
    ;[next[idx], next[empty]] = [next[empty], next[idx]]
    setTiles(next)
    setMoves(m => m + 1)
    if (!startedRef.current) {
      startedRef.current = true
      startTimer()
    }
    if (isSolved(next)) {
      stopTimer()
      setWon(true)
      // Defer alert so the user sees the final tile slide first.
      setTimeout(() => {
        alert(`כל הכבוד! פתרת ב-${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)} עם ${moves + 1} מהלכים.`)
      }, 600)
    }
  }

  return (
    <div className="puzzle-mini" title="חידת היום">
      <div className="pm-head">
        <span className="pm-label">חידת היום</span>
        <span className="pm-difficulty">★★★★☆</span>
      </div>
      <div className="pm-grid" role="grid" aria-label="חידת הזזה 3 על 3">
        {tiles.map((v, i) => (
          <button
            key={i}
            type="button"
            className={`slide-tile ${v === 0 ? 'empty' : ''} ${won && v !== 0 ? 'solved' : ''}`}
            onClick={() => v !== 0 && tryMove(i)}
            disabled={v === 0}
            aria-label={v === 0 ? 'ריק' : `משבצת ${v}`}
            style={{
              transitionDelay: won && v !== 0 ? `${i * 50}ms` : undefined,
            }}
          >
            {v !== 0 ? v : ''}
          </button>
        ))}
      </div>
      <div className="pm-foot">
        <div className="pm-info">
          <strong>{pad2(Math.floor(seconds / 60))}:{pad2(seconds % 60)}</strong>
          <small>{moves} מהלכים</small>
        </div>
        <div className="pm-controls">
          <button
            type="button"
            className="pm-shuffle"
            onClick={reshuffle}
            title="ערבב מחדש"
            aria-label="ערבב"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M16 3h5v5" /><path d="M4 20L21 3" />
              <path d="M21 16v5h-5" /><path d="M15 15l6 6" />
              <path d="M4 4l5 5" />
            </svg>
          </button>
          <button
            type="button"
            className="pm-shuffle"
            onClick={showSolved}
            title="פתרון"
            aria-label="פתרון"
          >
            ⚐
          </button>
        </div>
      </div>
    </div>
  )
}
