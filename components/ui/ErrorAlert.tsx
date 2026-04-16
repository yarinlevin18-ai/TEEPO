'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'

interface ErrorAlertProps {
  message: string | null
  onDismiss?: () => void
}

export default function ErrorAlert({ message, onDismiss }: ErrorAlertProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="p-3 rounded-xl flex items-start gap-3"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-400 flex-1">{message}</p>
          {onDismiss && (
            <button onClick={onDismiss} className="text-red-400/60 hover:text-red-400 transition-colors">
              <X size={14} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
