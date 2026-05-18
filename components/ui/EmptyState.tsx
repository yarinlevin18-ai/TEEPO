'use client'

/**
 * EmptyState — cream-themed "nothing here yet" placeholder.
 *
 * Use when a list/grid has zero items. Composes a centered icon, a
 * headline, an explanatory paragraph, and an optional CTA button or
 * link slot.
 *
 * Example:
 *   <EmptyState
 *     icon={<BookOpen size={28} />}
 *     title="אין קורסים עדיין"
 *     description="הוסף את הקורס הראשון שלך כדי להתחיל"
 *     action={<Link href="/courses/extract">הוסף קורס</Link>}
 *   />
 *
 * Pairs with `.ui-empty-state` block in globals.css. Drops cleanly
 * into any page wrapped in `.cream-page`.
 */

import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  /** Optional className appended to the root for one-off tweaks. */
  className?: string
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <section className={`ui-empty-state${className ? ` ${className}` : ''}`}>
      {icon && <div className="ui-empty-state-icon">{icon}</div>}
      <h2 className="ui-empty-state-title">{title}</h2>
      {description && <p className="ui-empty-state-desc">{description}</p>}
      {action && <div className="ui-empty-state-action">{action}</div>}
    </section>
  )
}
