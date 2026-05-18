'use client'

/**
 * PageSkeleton — generic loading placeholder for cream pages.
 *
 * Renders a centered cream-page layout with a header bar + N skeleton
 * cards stacked vertically (or as a grid of `statCount` stats first,
 * then `cardCount` full-width cards).
 *
 * Defaults to a layout that matches the structure used by /credits,
 * /assignments, and /todos when the DB is loading.
 *
 * Example:
 *   if (!ready) return <PageSkeleton statCount={4} cardCount={2} />
 *
 * Pairs with `.ui-page-skeleton` block in globals.css and reuses the
 * existing `.shimmer` keyframe.
 */

interface PageSkeletonProps {
  /** Number of stat cards to render in the top grid (4-up). 0 hides the grid. */
  statCount?: number
  /** Number of full-width skeleton cards to render below the stats. */
  cardCount?: number
  /** Optional className appended to the root for page-specific layout. */
  className?: string
}

export default function PageSkeleton({
  statCount = 4,
  cardCount = 2,
  className = '',
}: PageSkeletonProps) {
  return (
    <div className={`cream-page ui-page-skeleton${className ? ` ${className}` : ''}`}>
      <div className="ui-page-skeleton-main" dir="rtl" aria-busy="true" aria-live="polite">
        <div className="ui-page-skeleton-head">
          <div className="shimmer h-8 w-48 rounded-lg" />
          <div className="shimmer h-4 w-64 rounded-lg" />
        </div>
        {statCount > 0 && (
          <div className="ui-page-skeleton-stats">
            {Array.from({ length: statCount }, (_, i) => (
              <div key={i} className="shimmer h-24 rounded-2xl" />
            ))}
          </div>
        )}
        {cardCount > 0 && (
          <div className="ui-page-skeleton-cards">
            {Array.from({ length: cardCount }, (_, i) => (
              <div key={i} className="shimmer h-48 rounded-2xl" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
