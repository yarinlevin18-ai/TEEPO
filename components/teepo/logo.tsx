import { BookOpen } from "lucide-react"

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <BookOpen className="h-6 w-6 text-primary" />
      <span className="text-xl font-bold text-primary tracking-tight" dir="ltr">
        teepo
      </span>
    </div>
  )
}
