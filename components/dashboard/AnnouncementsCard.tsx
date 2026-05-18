'use client'

/**
 * <AnnouncementsCard /> — dashboard widget showing recent Moodle
 * forum announcements.
 *
 * Data lives in `db.announcements` (persisted to Drive DB), populated
 * by `useAutoSync` via `mergeAnnouncements` after each successful
 * Moodle sync. Each row shows:
 *   - course color dot + course name tag
 *   - title
 *   - body preview (1 line, ellipsized)
 *   - author + relative "X min ago" timestamp
 *   - "פתח ב-Moodle" link
 *
 * Interaction:
 *   - Click row OR "פתח" → opens Moodle in new tab + marks as read
 *     (via the existing `acknowledgeAnnouncement` helper on useDB)
 *   - "סמן הכל כנקרא" header CTA → bulk-acknowledge unread
 *   - Collapsed "showing N of M, more →" when over the visible cap
 *
 * Empty states:
 *   - No announcements at all → "אין הודעות חדשות" hint with sync CTA
 *   - All-read state → quieter "כל ההודעות נקראו" copy
 *
 * Per the "swap visuals, keep mechanics" rule: the merge / acknowledge
 * functions are existing pure helpers (lib/announcements-merge); this
 * component is a leaf consumer that just renders + dispatches.
 */

import { useMemo } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, ExternalLink, MessageSquare } from 'lucide-react'
import { useDB } from '@/lib/db-context'
import { countUnread } from '@/lib/announcements-merge'
import type { Announcement } from '@/types'

/** Max rows rendered in the card. Older items are still in
 *  `db.announcements` (up to the global cap of 50) — they're just
 *  not shown to keep the dashboard tight. */
const VISIBLE_LIMIT = 5

export default function AnnouncementsCard() {
  const { db, acknowledgeAnnouncement, acknowledgeAllAnnouncements } = useDB() as any
  const all: Announcement[] = useMemo(
    () => (db?.announcements ?? []) as Announcement[],
    [db?.announcements],
  )
  // Unread-first; within each bucket sort by posted_at desc (already
  // sorted that way by mergeAnnouncements but be defensive in case
  // the user mutates the DB by hand).
  const sorted = useMemo(() => {
    return [...all].sort((a, b) => {
      // unread first
      const ua = a.acknowledged_at ? 1 : 0
      const ub = b.acknowledged_at ? 1 : 0
      if (ua !== ub) return ua - ub
      return (b.posted_at ?? '').localeCompare(a.posted_at ?? '')
    })
  }, [all])
  const visible = sorted.slice(0, VISIBLE_LIMIT)
  const unread = countUnread(all)
  const total = all.length

  // Open the announcement: navigate + mark as read. We don't block
  // navigation on the Drive write (optimistic UX); a failed ack just
  // means the badge stays for the next page load.
  const open = (a: Announcement) => {
    if (typeof acknowledgeAnnouncement === 'function') {
      void acknowledgeAnnouncement(a.id).catch(() => { /* non-fatal */ })
    }
    if (a.url) window.open(a.url, '_blank', 'noopener,noreferrer')
  }

  const markAllRead = () => {
    if (typeof acknowledgeAllAnnouncements === 'function') {
      void acknowledgeAllAnnouncements().catch(() => { /* non-fatal */ })
    }
  }

  if (total === 0) {
    return (
      <section
        className="dash-v2-announcements"
        style={{
          ['--w-color' as any]: '#fce7f3',
          ['--w-icon-color' as any]: '#be185d',
        }}
      >
        <header className="ann-head">
          <div className="ann-icon"><Bell size={16} /></div>
          <span className="ann-title">הודעות מהמרצים</span>
        </header>
        <div className="ann-empty">
          <MessageSquare size={28} aria-hidden />
          <p>אין הודעות חדשות לאחרונה.</p>
          <small>
            הודעות מפורומי "הודעות" ב-Moodle יופיעו כאן אוטומטית בסנכרון הבא.
          </small>
        </div>
      </section>
    )
  }

  return (
    <section
      className="dash-v2-announcements"
      style={{
        ['--w-color' as any]: '#fce7f3',
        ['--w-icon-color' as any]: '#be185d',
      }}
    >
      <header className="ann-head">
        <div className="ann-icon"><Bell size={16} /></div>
        <span className="ann-title">הודעות מהמרצים</span>
        <span className="ann-count">
          {unread > 0 ? `${unread} חדשות` : `${total} בסך הכל`}
        </span>
        {unread > 0 && (
          <button
            type="button"
            className="ann-mark-all"
            onClick={markAllRead}
            title="סמן את כל ההודעות כנקראו"
          >
            <CheckCheck size={13} />
            סמן הכל כנקרא
          </button>
        )}
      </header>

      <div className="ann-body">
        {visible.map((a) => (
          <AnnouncementRow key={a.id} ann={a} onOpen={() => open(a)} />
        ))}
      </div>

      {total > VISIBLE_LIMIT && (
        <footer className="ann-foot">
          <span>מציג {VISIBLE_LIMIT} מתוך {total} הודעות</span>
          {/* No dedicated /announcements page yet — link to /moodle which
              has the underlying connection status + sync trigger. */}
          <Link href="/moodle" className="ann-foot-link">
            לכל ההודעות ב-Moodle →
          </Link>
        </footer>
      )}
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────

function AnnouncementRow({ ann, onOpen }: { ann: Announcement; onOpen: () => void }) {
  const isUnread = !ann.acknowledged_at
  const relTime = useRelativePosted(ann.posted_at)
  return (
    <article
      className={`ann-row ${isUnread ? 'is-unread' : ''}`}
      style={{ ['--course-color' as any]: ann.course_color || 'var(--lp-accent)' }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      role="button"
      tabIndex={0}
      title={ann.url ? 'פתח את ההודעה ב-Moodle' : undefined}
    >
      <div className="ann-row-head">
        <span className="ann-course-tag">
          <span className="dot" />
          {ann.course_name}
        </span>
        {isUnread && <span className="ann-new-pill">חדש</span>}
        <span className="ann-time">{relTime}</span>
      </div>
      <h4 className="ann-row-title">{ann.title}</h4>
      {ann.body && <p className="ann-row-body">{ann.body}</p>}
      <div className="ann-row-foot">
        {ann.author && <span className="ann-author">{ann.author}</span>}
        {ann.url && (
          <a
            href={ann.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ann-open"
            onClick={(e) => {
              // Stop the row's onClick (would double-fire), still let
              // the anchor's default open the URL — acknowledge runs
              // here so the link doesn't have to.
              e.stopPropagation()
              onOpen()
            }}
          >
            פתח <ExternalLink size={11} />
          </a>
        )}
      </div>
    </article>
  )
}

/** "כרגע" / "לפני 5 דקות" / "אתמול" / "לפני 3 ימים" / "13 במאי". */
function useRelativePosted(iso: string | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (diffSec < 60) return 'כרגע'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `לפני ${diffMin} דק׳`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `לפני ${diffH} שע׳`
  const diffD = Math.round(diffH / 24)
  if (diffD === 1) return 'אתמול'
  if (diffD < 7) return `לפני ${diffD} ימים`
  // > 1 week → fall back to date
  const d = new Date(iso)
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
                  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  return `${d.getDate()} ב${months[d.getMonth()]}`
}
