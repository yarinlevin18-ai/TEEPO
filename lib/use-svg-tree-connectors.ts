/**
 * useSvgTreeConnectors — measure DOM node positions + paint SVG connectors
 * between them, on every layout change.
 *
 * Source: ported from the inline <script> blocks at the bottom of
 *   teepo-design/mockup_drive_organize.html
 *   teepo-design/mockup_summaries.html
 *
 * Why JS + SVG, not CSS::before/::after — the connector shape depends on
 * the *actual* measured positions of sibling nodes (which themselves shift
 * with viewport width, font load, animation completion, etc.). Pseudo-
 * elements can only know their own parent's box and the static stylesheet,
 * so they end up either misaligned (the old approach) or restricted to
 * trivial parent-child layouts. SVG lets us draw a free-form path between
 * any two boxes.
 *
 * Lifecycle:
 *   1. On mount + every time `deps` changes, schedule a redraw.
 *   2. The redraw runs inside `requestAnimationFrame` (post-layout).
 *   3. After 80 ms, 250 ms, and 800 ms we re-run — to catch any node
 *      whose final position only settles after the fadeUp/slideIn
 *      entry animations finish (the v3 mockups stagger nodes up to 0.8s).
 *   4. A `ResizeObserver` on the wrap re-draws whenever any layout reflows.
 *   5. `document.fonts.ready` resolves → re-draw once more, in case font
 *      metrics shift the text widths.
 *
 * Consumer API — pass refs + a `draw` callback. The callback receives
 * helpers that already know the wrap + svg bindings:
 *   - `wrap`   : the wrapper element (for `querySelector` shorthand)
 *   - `center` : measure a DOM node's edge midpoint, in wrap-local coords
 *   - `path`   : add a <path d="..."> to the svg
 *   - `line`   : add a <line> with the four endpoint attrs
 *   - `dot`    : add a junction <circle> (the small filled circles
 *                that visually anchor branching parents in the mockup)
 *   - `elbow`  : build a rounded-corner elbow path string between two
 *                points (matches the drive-organize curves exactly)
 *
 * The hook clears the SVG before every redraw, so the `draw` callback
 * just emits the full connector set fresh every time — no diffing,
 * no stale state.
 */
import { type DependencyList, type RefObject, useLayoutEffect } from 'react'

const NS = 'http://www.w3.org/2000/svg'

export interface ConnectorPoint {
  x: number
  y: number
}

/**
 * Build a rounded-corner elbow path between two points. Exported as a
 * pure function so the geometry is unit-testable without a DOM. The
 * shape is: vertical drop to mid-Y → quarter-circle curve → horizontal
 * traverse → quarter-circle curve → vertical drop to target.
 *
 * Stacked vertical (|x1-x2| < 0.5px) returns a straight line — without
 * this check, the elbow would degenerate into a tiny dot at the midpoint
 * that some renderers paint as visible noise.
 *
 * @param x1,y1 origin (typically a node's bottom-center)
 * @param x2,y2 target (typically the next node's top-center)
 * @param r corner radius. Default 8 matches the drive-organize mockup.
 */
export function buildElbowPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r = 8,
): string {
  if (Math.abs(x1 - x2) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`
  const midY = (y1 + y2) / 2
  const goingRight = x2 > x1
  const dx = goingRight ? r : -r
  return `M ${x1} ${y1}
              L ${x1} ${midY - r}
              Q ${x1} ${midY} ${x1 + dx} ${midY}
              L ${x2 - dx} ${midY}
              Q ${x2} ${midY} ${x2} ${midY + r}
              L ${x2} ${y2}`
}

/**
 * Helpers exposed to the `draw` callback. All coordinates are in the
 * wrap's local space (0,0 = wrap's top-left, after subtracting its
 * bounding rect).
 */
export interface ConnectorHelpers {
  /** The wrap element — use this as the root for `querySelector`. */
  wrap: HTMLElement
  /**
   * Measure a node's edge midpoint relative to the wrap.
   * `side='top'` → midpoint of the node's top edge (where a connector
   * coming down from above should land). `'bottom'` likewise. Default:
   * the node's geometric center.
   */
  center: (node: Element, side?: 'top' | 'bottom' | 'middle') => ConnectorPoint
  /** Append a `<path d="...">` to the svg. */
  path: (d: string, attrs?: Record<string, string>) => void
  /** Append a `<line>` with the given endpoints. */
  line: (x1: number, y1: number, x2: number, y2: number, attrs?: Record<string, string>) => void
  /** Append a junction `<circle class="junction">` at the given point. */
  dot: (x: number, y: number, r?: number) => void
  /**
   * Build a rounded-corner elbow path string between two points: drop
   * halfway, curve 90°, traverse horizontally, curve 90°, drop to the
   * target. If the two x's are within 0.5 px of each other, returns a
   * straight vertical line instead (so siblings stacked vertically
   * don't get a wonky tiny elbow).
   */
  elbow: (x1: number, y1: number, x2: number, y2: number, cornerRadius?: number) => string
}

export interface UseSvgTreeConnectorsOptions {
  /**
   * Extra delays (in ms, after mount or `deps` change) to re-run the
   * draw. Default `[80, 250, 800]` catches the v3 fadeUp/slideIn
   * stagger which can run up to 0.8s after the parent renders.
   * Pass `[]` to disable post-mount re-runs (e.g., for non-animated trees).
   */
  settleDelays?: number[]
  /**
   * If true, also re-run once `document.fonts.ready` resolves. Default
   * true — Hebrew web fonts (Heebo, Assistant, Frank Ruhl Libre) load
   * async and their final glyph widths shift node measurements.
   */
  waitForFonts?: boolean
}

const DEFAULT_SETTLE_DELAYS = [80, 250, 800] as const

/**
 * Bind an SVG connector overlay to a DOM wrap. Each time the deps or
 * the wrap's layout change, the SVG is cleared and `draw(helpers)` is
 * called to repaint it.
 *
 * @example
 * function MyTree() {
 *   const wrapRef = useRef<HTMLDivElement>(null)
 *   const svgRef = useRef<SVGSVGElement>(null)
 *
 *   useSvgTreeConnectors(wrapRef, svgRef, (h) => {
 *     const root = h.wrap.querySelector('.tree-root .node')
 *     const degrees = h.wrap.querySelectorAll('.degree-header .node')
 *     if (!root) return
 *     const rb = h.center(root, 'bottom')
 *     degrees.forEach(d => {
 *       const dt = h.center(d, 'top')
 *       h.path(h.elbow(rb.x, rb.y, dt.x, dt.y))
 *     })
 *     h.dot(rb.x, rb.y)
 *   }, [data])
 *
 *   return (
 *     <div ref={wrapRef} className="tree-wrap">
 *       <svg ref={svgRef} className="tree-svg" />
 *       ...nodes...
 *     </div>
 *   )
 * }
 */
export function useSvgTreeConnectors(
  wrapRef: RefObject<HTMLElement | null>,
  svgRef: RefObject<SVGSVGElement | null>,
  draw: (helpers: ConnectorHelpers) => void,
  deps: DependencyList = [],
  options: UseSvgTreeConnectorsOptions = {},
): void {
  const { settleDelays = DEFAULT_SETTLE_DELAYS, waitForFonts = true } = options

  // We use useLayoutEffect (not useEffect) so the first paint happens
  // synchronously after the consumer's nodes mount — avoids a one-frame
  // flash where the cards are visible but the lines aren't.
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const svg = svgRef.current
    if (!wrap || !svg) return

    function makeEl<K extends 'path' | 'line' | 'circle'>(tag: K, attrs: Record<string, string>) {
      const e = document.createElementNS(NS, tag)
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
      return e
    }

    function center(node: Element, side: 'top' | 'bottom' | 'middle' = 'middle'): ConnectorPoint {
      // wrap is captured by closure; the early-return above guarantees non-null
      const wr = wrap!.getBoundingClientRect()
      const r = node.getBoundingClientRect()
      const cx = r.left + r.width / 2 - wr.left
      let y: number
      if (side === 'top') y = r.top - wr.top
      else if (side === 'bottom') y = r.bottom - wr.top
      else y = r.top + r.height / 2 - wr.top
      return { x: cx, y }
    }

    const helpers: ConnectorHelpers = {
      wrap: wrap!,
      center,
      elbow: buildElbowPath,
      path: (d, attrs = {}) => svg!.appendChild(makeEl('path', { d, ...attrs })),
      line: (x1, y1, x2, y2, attrs = {}) =>
        svg!.appendChild(
          makeEl('line', { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2), ...attrs }),
        ),
      dot: (x, y, r = 3) =>
        svg!.appendChild(
          makeEl('circle', { class: 'junction', cx: String(x), cy: String(y), r: String(r) }),
        ),
    }

    function redraw() {
      const wr = wrap!.getBoundingClientRect()
      // viewBox matches the wrap exactly, so the integer coords from
      // `center()` map 1:1 onto SVG user units. `overflow:visible` on the
      // SVG (set in CSS) lets connectors that stretch outside the wrap
      // bounds still paint (e.g., the connector-line below the tree).
      svg!.setAttribute('viewBox', `0 0 ${wr.width} ${wr.height}`)
      // Clear and repaint fresh — no diffing.
      while (svg!.firstChild) svg!.removeChild(svg!.firstChild)
      try {
        draw(helpers)
      } catch (err) {
        // Don't let a transient measurement glitch kill the render —
        // we'll just paint nothing this frame and try again on the
        // next resize/settle tick.
        // eslint-disable-next-line no-console
        console.warn('[useSvgTreeConnectors] draw threw — skipping this frame', err)
      }
    }

    // Initial paint, then a sequence of catch-up paints to cover the
    // fadeUp/slideIn stagger (mockups go up to 0.8s) + font load.
    let timeouts: ReturnType<typeof setTimeout>[] = []
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(redraw)
    }
    schedule()
    settleDelays.forEach((ms) => {
      timeouts.push(setTimeout(schedule, ms))
    })

    if (waitForFonts && typeof document !== 'undefined' && document.fonts?.ready) {
      // .ready is a Promise that resolves once all loaded fonts are
      // available; we re-measure once metrics finalize.
      document.fonts.ready.then(schedule).catch(() => {
        /* font load failed — initial paint still applies */
      })
    }

    // Layout-driven redraws: any size change in the wrap (window resize,
    // sidebar toggle, content reflow…) re-runs the draw. RO is debounced
    // by the browser on coalesced frames, so we don't need our own RAF
    // wrap here — the rAF inside `schedule` already covers it.
    const ro = new ResizeObserver(schedule)
    ro.observe(wrap!)

    // Window resize as a safety net (handles cases where the wrap size
    // doesn't change but children do — rare, but cheap to subscribe).
    window.addEventListener('resize', schedule)

    return () => {
      cancelAnimationFrame(raf)
      timeouts.forEach(clearTimeout)
      timeouts = []
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
    // The `draw` function captures its own deps via closure — we rely
    // on the caller passing them explicitly via `deps` rather than
    // tracking the function identity (which would re-bind every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
