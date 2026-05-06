/**
 * Landing-page product preview frame.
 *
 * Shows a scaled iframe of /demo so unauthenticated visitors see what the
 * dashboard looks like with realistic data. The /demo route renders the real
 * dashboard with `?demo=true` so it pulls from the demo-data fixture instead
 * of hitting Drive / Moodle / Google.
 */
export default function LandingPreview() {
  return (
    <div className="preview" aria-label="תצוגה מקדימה של לוח הבקרה">
      <div className="preview-frame">
        <div className="preview-bar">
          <span className="dot dot-r" />
          <span className="dot dot-y" />
          <span className="dot dot-g" />
        </div>
        <div className="preview-iframe-wrap">
          <iframe
            src="/demo"
            className="preview-iframe"
            scrolling="no"
            title="תצוגה מקדימה — TEEPO"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  )
}
