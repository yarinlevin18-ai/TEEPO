// Temporary simulation persistence in localStorage.
// Replaced by Drive-side storage once the Drive client is wired.

import type { Simulation } from '@/types'

const KEY = (examId: string) => `teepo_exam_simulations_${examId}`

export function loadSimulations(examId: string): Simulation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY(examId))
    return raw ? (JSON.parse(raw) as Simulation[]) : []
  } catch {
    return []
  }
}

export function saveSimulation(examId: string, sim: Simulation): void {
  if (typeof window === 'undefined') return
  const existing = loadSimulations(examId)
  const next = [...existing.filter((s) => s.id !== sim.id), sim]
  window.localStorage.setItem(KEY(examId), JSON.stringify(next))
}
