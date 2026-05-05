'use client'

/**
 * Cold-start banner. Sits below DriveConnectionBanner in the dashboard layout
 * and auto-shows whenever the backend reports it's in a wakeup window.
 *
 * Self-contained — no props. The hook handles all state.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useWakeup } from '@/lib/use-wakeup'

export default function WakeupBanner() {
  const { starting, message } = useWakeup()

  return (
    <AnimatePresence>
      {starting && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          dir="rtl"
          className="mx-4 mt-3 rounded-xl flex items-center gap-2.5 px-3.5 py-2"
          style={{
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.20)',
          }}
        >
          <Loader2
            size={14}
            className="animate-spin flex-shrink-0"
            style={{ color: '#818cf8' }}
          />
          <span className="text-xs text-ink-muted">
            {message || 'TEEPO מתעורר...'}
          </span>
          <span className="text-[10px] text-ink-subtle mr-auto">
            השרת מתעורר אחרי תקופת חוסר פעילות. עוד רגע.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
