'use client'

/**
 * ErrorAlert — cream-themed inline error banner.
 *
 * Renders nothing when `message` is null/empty. Pairs with the shared
 * cream design system tokens (`--lp-*`) so it drops cleanly into any
 * page wrapped in `.cream-page`. Used across /credits, /moodle, etc.
 */

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
          role="alert"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="ui-error-alert"
        >
          <AlertTriangle size={16} className="ui-error-alert-icon" />
          <p className="ui-error-alert-msg">{message}</p>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="סגור התראה"
              className="ui-error-alert-close"
            >
              <X size={14} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
