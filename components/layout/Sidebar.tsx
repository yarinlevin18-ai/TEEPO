'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  BookOpen,
  CheckSquare,
  MessageCircle,
  LayoutDashboard,
  GraduationCap,
  FileText,
  PlusCircle,
  Wifi,
} from 'lucide-react'
import { clsx } from 'clsx'

const NAV = [
  { href: '/dashboard', label: 'לוח בקרה', icon: LayoutDashboard },
  { href: '/courses/extract', label: 'הקורסים שלי', icon: BookOpen },
  { href: '/tasks', label: 'משימות', icon: CheckSquare },
  { href: '/assignments', label: 'מטלות', icon: FileText },
  { href: '/study-buddy', label: 'עוזר הלימוד', icon: MessageCircle },
  { href: '/academic', label: 'ייעוץ BGU', icon: GraduationCap },
  { href: '/bgu-connect', label: 'חיבור BGU', icon: Wifi },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 min-h-screen bg-white border-l border-surface-200 flex flex-col shadow-sm">
      {/* Logo */}
      <div className="p-6 border-b border-surface-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center shadow-md">
            <GraduationCap size={20} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm leading-tight">מערכת לימודים</p>
            <p className="text-xs text-slate-400">עם בינה מלאכותית</p>
          </div>
        </div>
      </div>

      {/* Quick add */}
      <div className="px-4 py-3 border-b border-surface-200">
        <Link href="/courses/extract">
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-50 text-primary-600 text-sm font-medium hover:bg-primary-100 transition-colors">
            <PlusCircle size={16} />
            הוסף קורס חדש
          </button>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href}>
              <motion.div
                whileHover={{ x: -2 }}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                  active
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-600 hover:bg-surface-100 hover:text-slate-800'
                )}
              >
                <Icon size={18} className={active ? 'text-primary-500' : 'text-slate-400'} />
                {label}
                {active && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="mr-auto w-1.5 h-1.5 rounded-full bg-primary-500"
                  />
                )}
              </motion.div>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-surface-200">
        <p className="text-xs text-slate-400 text-center">מופעל על ידי Claude AI</p>
      </div>
    </aside>
  )
}
