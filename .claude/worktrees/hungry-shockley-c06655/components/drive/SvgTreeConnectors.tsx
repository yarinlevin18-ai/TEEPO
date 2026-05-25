'use client'

/**
 * <SvgTreeConnectors /> — declarative wrapper around `useSvgTreeConnectors`.
 *
 * Why both a hook *and* a component? The hook is the workhorse — it
 * needs the wrap+svg refs from the *parent* so it can `querySelector`
 * sibling node elements. A pure rendered component can't reach into a
 * sibling's DOM tree, so the hook stays the primary API.
 *
 * This wrapper exists for two ergonomic reasons:
 *   1. It owns the `<svg>` element itself, so callers don't have to
 *      remember the className + aria-hidden boilerplate.
 *   2. It accepts the wrap ref + a draw callback, hiding the svg ref
 *      from the parent entirely. Callers only deal with one ref.
 *
 * Per teepo-design/CLAUDE_CODE_HANDOFF.md §11, the connector geometry
 * lives in the rendered `<path>` elements (NOT CSS pseudo-elements), so
 * they can be measured against actual DOM box positions on every layout
 * change. Stroke styling stays in CSS via `.tree-svg path { stroke: ... }`.
 */

import { useRef, type RefObject } from 'react'
import {
  useSvgTreeConnectors,
  type ConnectorHelpers,
} from '@/lib/use-svg-tree-connectors'

export interface SvgTreeConnectorsProps {
  /**
   * Wrap element ref — the SVG covers this box and the draw callback
   * uses it as the root for `querySelector` lookups.
   */
  wrapRef: RefObject<HTMLElement | null>
  /**
   * Paints the connectors. Called on mount, on every layout change
   * (ResizeObserver), and after the post-mount stagger ticks. Receives
   * helpers bound to the wrap + svg.
   */
  draw: (helpers: ConnectorHelpers) => void
  /**
   * Re-paint trigger — pass anything that, when changed, should force
   * a redraw (e.g. the courses array). The hook tracks identity, not
   * deep equality, so memoize stable refs when needed.
   */
  deps?: ReadonlyArray<unknown>
  /**
   * Extra class name appended to the rendered svg. The default
   * `tree-svg` class is always applied so the cream stroke styling
   * from globals.css kicks in.
   */
  className?: string
}

export default function SvgTreeConnectors({
  wrapRef,
  draw,
  deps = [],
  className,
}: SvgTreeConnectorsProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useSvgTreeConnectors(wrapRef, svgRef, draw, [...deps])
  return (
    <svg
      ref={svgRef}
      className={`tree-svg${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    />
  )
}
