'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, BellRing, X, Check, CheckCheck,
  AlertTriangle, Clock, CalendarClock, ListChecks,
  Info, ChevronLeft,
} from 'lucide-react'
import Link from 'next/link'
import type { AppNotification, NotifType } from '@/lib/use-notifications'

// ── Icon + color per type ───────────────────────────────────

const TYPE_META: Record<NotifType, { icon: typeof Bell; color: string; bg: string }> = {
  deadline: { icon: CalendarClock, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  event:    { icon: Clock,         color: '#818cf8', bg: 'rgba(99,102,241,0.12)' },
  task:     { icon: ListChecks,    color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  overdue:  { icon: AlertTriangle, color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  info:     { icon: Info,          color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
}

const URGENCY_BORDER: Record<string, string> = {
  critical: 'rgba(239,68,68,0.25)',
  high:     'rgba(245,158,11,0.2)',
  medium:   'rgba(255,255,255,0.06)',
  low:      'rgba(255,255,255,0.04)',
}

// ── Component ───────────────────────────────────────────────

interface NotificationCenterProps {
  notifications: AppNotification[]
  unreadCount: number
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onRequestPermission: () => Promise<boolean>
  hasPermission: boolean
}

export default function NotificationCenter({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onRequestPermission,
  hasPermission,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen])

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-white/5 transition-all"
      >
        {unreadCount > 0 ? (
          <BellRing size={18} className="text-amber-400" />
        ) : (
          <Bell size={18} />
        )}

        {/* Badge */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="absolute left-0 top-full mt-2 w-[360px] max-h-[480px] flex flex-col z-50 rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(15,17,23,0.98)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(99,102,241,0.08)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-ink-muted" />
                <h3 className="text-sm font-semibold text-ink">התראות</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium">
                    {unreadCount} חדשות
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllRead}
                    className="p-1.5 rounded-lg text-ink-subtle hover:text-indigo-400 hover:bg-white/5 transition-colors"
                    title="סמן הכל כנקרא"
                  >
                    <CheckCheck size={14} />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-white/5 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Browser notification permission prompt */}
            {!hasPermission && notifications.length > 0 && (
              <button
                onClick={async () => { await onRequestPermission() }}
                className="flex items-center gap-2 px-4 py-2.5 text-xs border-b border-white/5 transition-colors hover:bg-white/[0.03]"
                style={{ color: '#818cf8' }}
              >
                <BellRing size={12} />
                <span>הפעל התראות דסקטופ לתזכורות בזמן אמת</span>
                <ChevronLeft size={12} className="mr-auto" />
              </button>
            )}

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto" style={{ direction: 'rtl' }}>
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.08)' }}>
                    <Bell size={20} className="text-ink-subtle" />
                  </div>
                  <p className="text-sm text-ink-muted">אין התראות</p>
                  <p className="text-xs text-ink-subtle mt-1">נעדכן אותך על מטלות, אירועים ומשימות</p>
                </div>
              ) : (
                <div className="py-1">
                  {notifications.map((notif, i) => {
                    const meta = TYPE_META[notif.type]
                    const Icon = meta.icon
                    const content = (
                      <motion.div
                        key={notif.id}
                        initial={i < 5 ? { opacity: 0, x: 8 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => {
                          onMarkRead(notif.id)
                          if (notif.href) setIsOpen(false)
                        }}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-white/[0.03] ${
                          !notif.read ? '' : 'opacity-60'
                        }`}
                        style={{
                          borderRight: notif.read ? 'none' : `2px solid ${meta.color}`,
                        }}
                      >
                        {/* Icon */}
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: meta.bg }}
                        >
                          <Icon size={14} style={{ color: meta.color }} />
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] leading-snug ${notif.read ? 'text-ink-muted' : 'text-ink font-medium'}`}>
                            {notif.title}
                          </p>
                          <p className="text-[11px] text-ink-subtle mt-0.5 truncate">{notif.body}</p>
                        </div>

                        {/* Read indicator */}
                        {!notif.read && (
                          <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0 mt-2" />
                        )}
                      </motion.div>
                    )

                    if (notif.href) {
                      return <Link key={notif.id} href={notif.href}>{content}</Link>
                    }
                    return content
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2.5 border-t border-white/5 text-center">
                <p className="text-[10px] text-ink-subtle">
                  {unreadCount === 0 ? 'הכל נקרא' : `${unreadCount} התראות שלא נקראו`}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
