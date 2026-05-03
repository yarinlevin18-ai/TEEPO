'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, BookOpen, CheckSquare,
  FileText, Wifi, LogOut, GraduationCap, Settings, StickyNote, X, Sparkles, Building2, Sun, Moon,
  ClipboardCheck, ChevronDown, ExternalLink,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useTheme } from '@/lib/theme-context'
import { useUniversityName, useUniversityCode } from '@/lib/use-university'
import { useEffect, useState } from 'react'
import Teepo from '@/components/Teepo'

const EXAM_MODULE_ENABLED = process.env.NEXT_PUBLIC_EXAM_MODULE_ENABLED === 'true'

/** Quick-launch tools surfaced inline under "כלי AI". The full catalogue
 * still lives at /ai-tools — these are the highest-impact ones for one-click
 * access from anywhere in the app. */
const AI_QUICK_TOOLS: { name: string; url: string; tag: string }[] = [
  { name: 'Consensus',   url: 'https://consensus.app',    tag: 'מחקר' },
  { name: 'Elicit',      url: 'https://elicit.com',       tag: 'מחקר' },
  { name: 'ChatPDF',     url: 'https://www.chatpdf.com',  tag: 'PDF' },
  { name: 'Gamma',       url: 'https://gamma.app',        tag: 'מצגות' },
  { name: 'NotebookLM',  url: 'https://notebooklm.google.com', tag: 'סיכומים' },
  { name: 'Perplexity',  url: 'https://www.perplexity.ai', tag: 'חיפוש' },
]

const NAV_GROUPS = [
  {
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'MyDesk' },
    ],
  },
  {
    label: 'לימודים',
    items: [
      { href: '/courses',     icon: BookOpen,    label: 'הקורסים שלי' },
      { href: '/tasks',       icon: CheckSquare, label: 'משימות' },
      { href: '/assignments', icon: FileText,    label: 'מטלות' },
      { href: '/notes',       icon: StickyNote,  label: 'הסיכומים שלי' },
      ...(EXAM_MODULE_ENABLED
        ? [{ href: '/exam', icon: ClipboardCheck, label: 'תקופת מבחנים' }]
        : []),
    ],
  },
  {
    label: 'כלים',
    items: [
      { href: '/credits',      icon: GraduationCap,  label: "מעקב נק\"ז" },
      { href: '/university',   icon: Building2,       label: 'על האוניברסיטה' },
      { href: '/ai-tools',     icon: Sparkles,        label: 'כלי AI', expandable: 'ai' as const },
      { href: '/moodle',       icon: Wifi,            label: 'חיבור Moodle' },
    ],
  },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const universityName = useUniversityName()
  const universityCode = useUniversityCode()

  const [aiOpen, setAiOpen] = useState(false)

  // Block body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  /* Shared sidebar content used by both desktop and mobile */
  function SidebarContent() {
    return (
      <>
        {/* Logo — live SVG mascot, bigger + happy state */}
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-16 h-16 flex items-center justify-center -my-2">
              <Teepo size={68} state="happy" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-ink text-base leading-tight">TEEPO</p>
              <p className="text-xs mt-0.5 gradient-text">מערכת לימודים חכמה</p>
              {universityCode && (
                <p className="text-[10px] mt-1 text-ink-subtle truncate" title={universityName}>
                  {universityName}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Nav — grouped */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p
                  className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: '#7dd3fc' }}
                >
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const { href, icon: Icon, label } = item
                  const expandable = 'expandable' in item ? item.expandable : undefined
                  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                  const isAI = expandable === 'ai'
                  const expanded = isAI && aiOpen

                  return (
                    <div key={href}>
                      <div className="relative flex items-stretch">
                        <Link href={href} onClick={onMobileClose} className="flex-1 min-w-0">
                          <motion.div
                            whileHover={{ x: -2 }}
                            whileTap={{ scale: 0.98 }}
                            className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                              active
                                ? 'text-white'
                                : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                            }`}
                          >
                            {active && (
                              <motion.div
                                layoutId="sidebar-active"
                                className="absolute inset-0 rounded-xl overflow-hidden"
                                style={{
                                  background:
                                    'linear-gradient(90deg, rgba(56, 189, 248, 0.26) 0%, rgba(56, 189, 248, 0.10) 100%)',
                                  boxShadow:
                                    'inset 0 0 0 1px rgba(125, 211, 252, 0.50), 0 6px 18px rgba(56, 189, 248, 0.22)',
                                }}
                                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                              >
                                <span
                                  className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full"
                                  style={{
                                    background: 'linear-gradient(180deg, #7dd3fc 0%, #38bdf8 100%)',
                                    boxShadow: '0 0 12px rgba(56, 189, 248, 0.75)',
                                  }}
                                />
                              </motion.div>
                            )}
                            <motion.div
                              className="relative z-10 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              animate={active ? { scale: 1.05 } : { scale: 1 }}
                              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                              style={
                                active
                                  ? { background: 'rgba(56, 189, 248, 0.22)' }
                                  : { background: 'rgba(255, 255, 255, 0.04)' }
                              }
                            >
                              <Icon
                                size={16}
                                style={active ? { color: '#bae6fd' } : { color: 'rgb(212, 212, 216)' }}
                              />
                            </motion.div>
                            <span className="relative z-10 flex-1">{label}</span>
                          </motion.div>
                        </Link>
                        {isAI && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); setAiOpen((v) => !v) }}
                            aria-expanded={expanded}
                            aria-label="הצג כלים מהירים"
                            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition"
                          >
                            <ChevronDown
                              size={14}
                              style={{
                                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 200ms ease',
                              }}
                            />
                          </button>
                        )}
                      </div>

                      {/* AI quick-launcher — inline external links */}
                      {isAI && (
                        <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.div
                              key="ai-quick"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-1 mr-9 ml-1 mb-1 space-y-0.5">
                                {AI_QUICK_TOOLS.map((tool) => (
                                  <a
                                    key={tool.name}
                                    href={tool.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={onMobileClose}
                                    className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/[0.06] transition"
                                  >
                                    <span className="w-1 h-1 rounded-full bg-indigo-400/70 flex-shrink-0" />
                                    <span className="flex-1 truncate font-medium">{tool.name}</span>
                                    <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 transition">
                                      {tool.tag}
                                    </span>
                                    <ExternalLink size={11} className="text-zinc-500 group-hover:text-indigo-300 transition" />
                                  </a>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User & Footer */}
        <div className="px-4 py-4 border-t border-white/5 space-y-3">
          {user && (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ink-muted truncate" dir="ltr">
                  {user.user_metadata?.display_name || user.email}
                </p>
              </div>
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-amber-400 transition-colors"
                title={theme === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <Link href="/settings" onClick={onMobileClose}>
                <button
                  className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-indigo-400 transition-colors"
                  title="הגדרות"
                >
                  <Settings size={16} />
                </button>
              </Link>
              <button
                onClick={() => signOut()}
                className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-red-400 transition-colors"
                title="התנתק"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
          <div className="text-center space-y-0.5">
            <p className="text-[10px] text-ink-subtle">&copy; 2026 Yarin Levin</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Desktop sidebar — always visible at lg+ */}
      <div className="hidden lg:block">
        <aside
          className="w-64 min-h-screen flex flex-col"
          style={{
            background:
              'linear-gradient(180deg, rgba(20, 24, 36, 0.96) 0%, rgba(13, 16, 24, 0.96) 100%)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow:
              'inset 1px 0 0 rgba(255, 255, 255, 0.06), ' +
              '-8px 0 32px rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(16px) saturate(140%)',
            WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          }}
        >
          <SidebarContent />
        </aside>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={onMobileClose}
            />
            {/* Drawer panel — slides in from RIGHT (RTL) */}
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="lg:hidden fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col"
              style={{
                background: 'linear-gradient(180deg, #1a1f2c 0%, #121620 100%)',
                borderLeft: '1px solid rgba(255,255,255,0.04)',
                boxShadow:
                  'inset -1px 0 2px rgba(255,255,255,0.04), ' +
                  'inset 0 1px 2px rgba(255,255,255,0.04), ' +
                  '-8px 0 40px rgba(0,0,0,0.5)',
              }}
            >
              {/* Close button at top */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-sm font-bold text-ink">TEEPO</span>
                <button onClick={onMobileClose} className="p-2 rounded-lg hover:bg-white/5 text-ink-muted">
                  <X size={18} />
                </button>
              </div>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
