/**
 * Moodle "my courses" discoverer — on-demand content script.
 *
 * Injected from the popup when the user clicks "גלה את הקורסים שלי" while
 * on a Moodle homepage. Scans every <a href> that looks like a course view
 * URL (`/course/view.php?id=NNN`) and reports a deduped list with title +
 * Moodle ID + any inline metadata (e.g. shortname from data-attr).
 *
 * Lives in its own file (not bundled into content/moodle.js) because:
 *   - Auto-injection on every page load is wasteful — discovery only runs
 *     on demand.
 *   - It returns a different shape than TEEPO_SCAN (no file list, just
 *     courses), so a single handler would be muddled.
 *
 * Result is stashed on window.__teepoCourses so the popup can pull it
 * with a follow-up scripting.executeScript that returns the value.
 */
;(() => {
  const seen = new Set()
  const courses = []

  // Moodle renders the same course in several places (header dropdown, dashboard
  // tiles, "my courses" block, sidebar). Dedupe by the canonical id.
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href || ''
    const m = href.match(/\/course\/view\.php\?id=(\d+)/i)
    if (!m) continue
    const id = m[1]
    if (seen.has(id)) continue

    // Title: anchor text first, then aria-label, then nearby heading.
    let title = (a.textContent || '').trim()
    if (!title || title.length < 2) {
      title = (a.getAttribute('aria-label') || '').trim()
    }
    if (!title || title.length < 2) {
      // Walk up to a card/list-item and look for a heading inside it.
      const parent = a.closest('[role="listitem"], li, .coursebox, .dashboard-card, article')
      if (parent) {
        const h = parent.querySelector('h2, h3, h4, .coursename, [class*="title"]')
        if (h && h.textContent) title = h.textContent.trim()
      }
    }
    // Fall back to the URL itself if we still have nothing — better than dropping the row.
    if (!title || title.length < 2) title = `קורס ${id}`

    // shortname — Moodle often puts it on a data-attr or in parens after the title.
    let shortname = a.getAttribute('data-shortname') || ''
    if (!shortname) {
      const sm = title.match(/\(([^)]+)\)\s*$/)
      if (sm) shortname = sm[1].trim()
    }

    seen.add(id)
    courses.push({
      moodle_id: id,
      title: title.length > 200 ? title.slice(0, 200) + '…' : title,
      url: href.split('#')[0],
      shortname: shortname || undefined,
    })
  }

  // Stash on window so the caller (popup → scripting.executeScript)
  // can return it back to the popup runtime.
  window.__teepoCourses = {
    source: location.hostname,
    courses,
    scannedAt: new Date().toISOString(),
  }
})()
