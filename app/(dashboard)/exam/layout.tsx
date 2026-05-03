import './exam.css'

export default function ExamLayout({ children }: { children: React.ReactNode }) {
  // Lightweight scope wrapper. The site-wide SkyScene (rendered by the
  // dashboard layout) provides the background atmosphere — exam pages
  // inherit it directly. The .teepo-exam class only carries the scoped
  // utility retints + identity primitives in exam.css.
  return <div className="teepo-exam">{children}</div>
}
