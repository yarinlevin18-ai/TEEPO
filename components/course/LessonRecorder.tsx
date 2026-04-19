'use client'

/**
 * LessonRecorder — a self-contained card that captures or uploads a lesson
 * recording, runs it through the server-side Whisper-chunking pipeline,
 * displays the Claude summary, and lets the user choose which chapter to
 * attach it to and whether to insert the summary into the notebook body.
 *
 * Pipeline states mirror the backend job stages:
 *   idle → (recording | picking) → uploading → processing → done | error
 *
 * The "processing" phase polls /api/transcribe/jobs/<id> every 2 s and
 * shows a stage label + progress (chunks done / total). When done it
 * displays the summary in a result card; user can insert it into the
 * selected chapter's notebook or view the full transcript.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Mic, Square, Upload, FileAudio, ChevronDown, Loader2,
  CheckCircle2, AlertCircle, FileText, Sparkles, X,
} from 'lucide-react'
import { api } from '@/lib/api-client'

type Stage = 'queued' | 'chunking' | 'transcribing' | 'summarizing' | 'saving' | 'done' | 'error'

interface LessonOption {
  id: string
  title: string
}

interface Props {
  lessons: LessonOption[]
  /** Chapter that's currently focused in the notebook — preselects the picker. */
  defaultLessonId?: string | null
  /** Called when the user hits "הוסף למחברת" — parent handles appending HTML. */
  onInsertSummary?: (lessonId: string, summary: string) => void
  /** Called whenever the pipeline finishes successfully (for toasts etc.). */
  onDone?: (lessonId: string, summary: string, transcript: string) => void
}

// Human-readable stage labels used in the progress row.
const STAGE_LABEL: Record<Stage, string> = {
  queued:       'בתור…',
  chunking:     'מחלק את הקובץ לחתיכות קצרות…',
  transcribing: 'מתמלל את ההקלטה…',
  summarizing:  'מסכם את מה שנאמר…',
  saving:       'שומר לפרק…',
  done:         'מוכן ✓',
  error:        'נכשל',
}

export default function LessonRecorder({
  lessons,
  defaultLessonId,
  onInsertSummary,
  onDone,
}: Props) {
  // ── Picker ────────────────────────────────────────────────
  const [lessonId, setLessonId] = useState<string>(
    defaultLessonId || lessons[0]?.id || '',
  )
  useEffect(() => {
    if (!lessonId && defaultLessonId) setLessonId(defaultLessonId)
    else if (!lessonId && lessons[0]) setLessonId(lessons[0].id)
  }, [defaultLessonId, lessons, lessonId])

  // ── Mic recording ─────────────────────────────────────────
  const [recording, setRecording] = useState(false)
  const [recordedMs, setRecordedMs] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recStartRef = useRef<number>(0)

  // ── Queued blob waiting to be processed (either recorded or picked) ──
  const [pending, setPending] = useState<{ blob: Blob; name: string } | null>(null)

  // ── Upload + job progress ────────────────────────────────
  const [uploadPct, setUploadPct] = useState(0)
  const [jobId, setJobId] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ summary: string; transcript: string } | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clear all timers on unmount so we don't poll after the user leaves.
  useEffect(() => {
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      recorderRef.current?.state === 'recording' && recorderRef.current.stop()
    }
  }, [])

  // ─────────────────────────────────────────────────────────
  //  Mic capture
  // ─────────────────────────────────────────────────────────
  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const mr = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mime })
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
        setPending({ blob, name: `recording-${stamp}.webm` })
      }
      mr.start()
      recorderRef.current = mr
      recStartRef.current = Date.now()
      setRecordedMs(0)
      setRecording(true)
      recTimerRef.current = setInterval(() => {
        setRecordedMs(Date.now() - recStartRef.current)
      }, 250)
    } catch (e: any) {
      const msg = String(e?.message || e || '')
      setError(msg.toLowerCase().includes('permission')
        ? 'אין הרשאה למיקרופון. פתח את הגדרות הדפדפן כדי לאשר.'
        : 'שגיאה בהתחלת ההקלטה.')
    }
  }

  const stopRecording = () => {
    const mr = recorderRef.current
    if (mr && mr.state !== 'inactive') mr.stop()
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    setRecording(false)
  }

  // ─────────────────────────────────────────────────────────
  //  File picker
  // ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 500 * 1024 * 1024) {
      setError('הקובץ גדול מדי (מעל 500MB). המר לפורמט MP3 או חתוך את ההקלטה.')
      return
    }
    setError(null)
    setPending({ blob: f, name: f.name })
  }

  // ─────────────────────────────────────────────────────────
  //  Start the server-side pipeline
  // ─────────────────────────────────────────────────────────
  const startPipeline = async () => {
    if (!pending || !lessonId) return
    setError(null)
    setResult(null)
    setShowTranscript(false)
    setUploadPct(0)
    setStage('queued')
    setProgress({ done: 0, total: 0 })

    try {
      const { job_id } = await api.lessons.startTranscribe(
        lessonId,
        pending.blob,
        pending.name,
        (pct) => setUploadPct(pct),
      )
      setJobId(job_id)
      // Begin polling immediately so the first frame after upload is accurate.
      pollRef.current = setInterval(() => pollJob(job_id), 2000)
      // And do one poll right away.
      pollJob(job_id)
    } catch (e: any) {
      setStage('error')
      setError(e?.message || 'העלאה נכשלה.')
    }
  }

  const pollJob = async (id: string) => {
    try {
      const j = await api.lessons.transcribeJob(id)
      setStage(j.stage)
      setProgress({ done: j.progress || 0, total: j.total || 0 })
      if (j.stage === 'done') {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        setResult({ summary: j.summary || '', transcript: j.transcript || '' })
        onDone?.(lessonId, j.summary || '', j.transcript || '')
      } else if (j.stage === 'error') {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        setError(j.error || 'העיבוד נכשל.')
      }
    } catch (e: any) {
      // Transient polling error — don't fail the job, just try again next tick.
      // If it's a 404 on the job id, stop polling.
      if (String(e?.message || '').includes('job_not_found')) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        setStage('error')
        setError('הג׳וב אבד בצד שרת. נסה שוב.')
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  //  Reset so the user can record again
  // ─────────────────────────────────────────────────────────
  const reset = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setPending(null)
    setJobId(null)
    setStage(null)
    setProgress({ done: 0, total: 0 })
    setUploadPct(0)
    setError(null)
    setResult(null)
    setShowTranscript(false)
  }

  // ─────────────────────────────────────────────────────────
  //  Derived view state
  // ─────────────────────────────────────────────────────────
  const processing = stage && stage !== 'done' && stage !== 'error'
  const showSelector = !recording && !processing && !result
  const selectedLessonTitle =
    lessons.find(l => l.id === lessonId)?.title || 'ללא פרק'

  // ─────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────
  return (
    <div
      className="glass rounded-2xl p-4 md:p-5 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(184,169,255,0.05), rgba(255,255,255,0.02))',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
          <Mic size={14} className="text-violet-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            הקלטת שיעור → תמלול → סיכום
          </h2>
          <p className="text-[11px] text-ink-muted">
            הקלט בדפדפן או העלה הקלטת Zoom (עד 500MB). החתיכות מעובדות
            אוטומטית; שיעור של 90 דק׳ בערך 2-3 דקות.
          </p>
        </div>
        {result && (
          <button
            onClick={reset}
            className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-white/5"
            title="הקלט עוד שיעור"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Lesson picker — always visible so the user sees where it'll land */}
      <div className="mb-3">
        <label className="block text-[11px] text-ink-muted mb-1">לאיזה פרק לצרף את ההקלטה?</label>
        <div className="relative">
          <select
            value={lessonId}
            onChange={e => setLessonId(e.target.value)}
            disabled={!!processing || recording}
            className="w-full appearance-none rounded-lg bg-white/5 border border-white/10 text-sm text-ink px-3 py-2 pr-8 focus:outline-none focus:border-violet-400/50 disabled:opacity-60"
            style={{ direction: 'rtl' }}
          >
            {lessons.length === 0 && <option value="">אין פרקים עדיין</option>}
            {lessons.map((l, i) => (
              <option key={l.id} value={l.id}>
                {i + 1}. {l.title}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted"
          />
        </div>
      </div>

      {/* ── Action area ─────────────────────────────────────── */}
      {showSelector && !pending && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={startRecording}
            disabled={!lessonId}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-400/30 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Mic size={14} /> הקלט עכשיו
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!lessonId}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-ink border border-white/10 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Upload size={14} /> העלה קובץ (MP3/MP4/M4A…)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="audio/*,video/*,.mp3,.m4a,.wav,.webm,.ogg,.mp4,.mov"
            onChange={onPickFile}
          />
        </div>
      )}

      {/* Recording in progress */}
      {recording && (
        <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-rose-500/10 border border-rose-400/25">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
          </span>
          <span className="text-sm text-rose-200 font-medium flex-1">
            מקליט… {formatDuration(recordedMs)}
          </span>
          <button
            onClick={stopRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 text-xs font-medium"
          >
            <Square size={11} /> עצור
          </button>
        </div>
      )}

      {/* Pending (queued blob — ready to send) */}
      {pending && !processing && !result && !recording && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10">
            <FileAudio size={14} className="text-violet-300" />
            <div className="flex-1 min-w-0">
              <div className="text-xs truncate text-ink">{pending.name}</div>
              <div className="text-[10.5px] text-ink-muted">
                {(pending.blob.size / (1024 * 1024)).toFixed(1)} MB
                {pending.blob.size > 24 * 1024 * 1024 && ' · יחולק לחתיכות בשרת'}
              </div>
            </div>
            <button
              onClick={reset}
              className="p-1 rounded text-ink-muted hover:text-ink"
              title="בטל"
            >
              <X size={12} />
            </button>
          </div>
          <button
            onClick={startPipeline}
            disabled={!lessonId}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-500/25 hover:bg-indigo-500/35 text-indigo-100 border border-indigo-400/40 text-sm font-medium disabled:opacity-50"
          >
            <Sparkles size={14} /> תמלל וסכם → פרק "{selectedLessonTitle}"
          </button>
        </div>
      )}

      {/* Processing — live pipeline progress */}
      {processing && stage && (
        <div className="space-y-2 px-3 py-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 text-sm text-ink">
            <Loader2 size={14} className="animate-spin text-violet-300" />
            <span>{STAGE_LABEL[stage]}</span>
            {stage === 'transcribing' && progress.total > 0 && (
              <span className="text-ink-muted text-xs">
                ({progress.done}/{progress.total})
              </span>
            )}
          </div>
          {/* Progress bar — upload pct during upload, then chunk pct */}
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-400 transition-all duration-500"
              style={{
                width:
                  stage === 'queued' && uploadPct < 100
                    ? `${uploadPct * 0.2}%`  // cap at 20% until upload finishes
                    : stage === 'chunking'
                      ? '25%'
                      : stage === 'transcribing'
                        ? `${25 + (progress.total ? (progress.done / progress.total) * 60 : 0)}%`
                        : stage === 'summarizing'
                          ? '90%'
                          : stage === 'saving'
                            ? '97%'
                            : '100%',
              }}
            />
          </div>
          {stage === 'queued' && uploadPct < 100 && (
            <p className="text-[10.5px] text-ink-muted">מעלה… {uploadPct}%</p>
          )}
        </div>
      )}

      {/* Error */}
      {error && !processing && (
        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-400/25 text-rose-200 text-xs">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={reset} className="text-rose-200/70 hover:text-rose-100">
            <X size={11} />
          </button>
        </div>
      )}

      {/* Result — summary + actions */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-400/25 text-emerald-200 text-xs">
            <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1">
              התמלול נשמר לפרק. להלן סיכום שנוצר ע״י Claude —
              תוכל להוסיף אותו למחברת כפי שהוא או לערוך.
            </span>
          </div>

          {result.summary ? (
            <div className="px-3.5 py-3 rounded-lg bg-white/5 border border-white/10 text-sm text-ink leading-relaxed whitespace-pre-wrap">
              {result.summary}
            </div>
          ) : (
            <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-400/25 text-amber-200 text-xs">
              לא התקבל סיכום מ-Claude (התמלול עצמו נשמר).
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {result.summary && onInsertSummary && (
              <button
                onClick={() => onInsertSummary(lessonId, result.summary)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-100 border border-indigo-400/30 text-xs font-medium"
              >
                <Sparkles size={12} /> הוסף למחברת של "{selectedLessonTitle}"
              </button>
            )}
            <button
              onClick={() => setShowTranscript(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-ink-muted hover:text-ink border border-white/10 text-xs"
            >
              <FileText size={12} /> {showTranscript ? 'הסתר תמלול מלא' : 'צפה בתמלול המלא'}
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-ink-muted hover:text-ink border border-white/10 text-xs"
            >
              <Mic size={12} /> הקלטה חדשה
            </button>
          </div>

          {showTranscript && (
            <div className="px-3.5 py-3 rounded-lg bg-white/[0.03] border border-white/8 text-xs text-ink-muted leading-relaxed max-h-64 overflow-auto whitespace-pre-wrap">
              {result.transcript}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
