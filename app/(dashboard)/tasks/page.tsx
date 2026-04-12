'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, CheckSquare, Trash2, Calendar } from 'lucide-react'
import { api } from '@/lib/api-client'
import type { StudyTask } from '@/types'
import { format, addDays, subDays } from 'date-fns'
import { he } from 'date-fns/locale'

export default function TasksPage() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [tasks, setTasks] = useState<StudyTask[]>([])
  const [loading, setLoading] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  const loadTasks = async (date: string) => {
    setLoading(true)
    try {
      const data = await api.tasks.list(date)
      setTasks(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadTasks(selectedDate) }, [selectedDate])

  const addTask = async () => {
    if (!newTitle.trim()) return
    const task = await api.tasks.create({
      title: newTitle.trim(),
      scheduled_date: selectedDate,
      category: 'study',
    })
    setTasks((prev) => [...prev, task])
    setNewTitle('')
    setAddingTask(false)
  }

  const toggleTask = async (id: string, done: boolean) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, is_completed: done } : t))
    await api.tasks.update(id, { is_completed: done })
  }

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await api.tasks.delete(id)
  }

  // Build a 7-day strip around selectedDate
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(subDays(today, 3), i)
    return { date: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE', { locale: he }), num: format(d, 'd') }
  })

  const completed = tasks.filter((t) => t.is_completed).length

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-800">משימות</h1>

      {/* Date strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d.date}
            onClick={() => setSelectedDate(d.date)}
            className={`flex flex-col items-center min-w-[52px] py-2 px-3 rounded-xl transition-colors ${
              d.date === selectedDate
                ? 'bg-primary-500 text-white shadow-md'
                : 'bg-white border border-surface-200 text-slate-600 hover:border-primary-300'
            }`}
          >
            <span className="text-xs">{d.label}</span>
            <span className="text-lg font-bold">{d.num}</span>
          </button>
        ))}
      </div>

      {/* Progress */}
      {tasks.length > 0 && (
        <div className="bg-white rounded-2xl border border-surface-200 p-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>התקדמות יומית</span>
              <span>{completed}/{tasks.length}</span>
            </div>
            <div className="h-2 bg-surface-200 rounded-full">
              <div
                className="h-2 bg-primary-500 rounded-full transition-all"
                style={{ width: `${tasks.length ? (completed / tasks.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <span className="text-2xl font-bold text-primary-500">
            {tasks.length ? Math.round((completed / tasks.length) * 100) : 0}%
          </span>
        </div>
      )}

      {/* Task list */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-surface-100">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-primary-500" />
            <span className="font-semibold text-slate-700 text-sm">
              {format(new Date(selectedDate), 'EEEE, d בMMM', { locale: he })}
            </span>
          </div>
          <button
            onClick={() => setAddingTask(true)}
            className="flex items-center gap-1.5 text-xs text-primary-500 hover:text-primary-600 font-medium"
          >
            <Plus size={14} /> משימה חדשה
          </button>
        </div>

        {/* New task input */}
        <AnimatePresence>
          {addingTask && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-b border-surface-100 overflow-hidden"
            >
              <div className="p-4 flex gap-3">
                <input
                  autoFocus
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAddingTask(false) }}
                  placeholder="שם המשימה..."
                  className="flex-1 text-sm border border-surface-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
                <button onClick={addTask} className="px-3 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600">
                  הוסף
                </button>
                <button onClick={() => setAddingTask(false)} className="px-3 py-2 text-slate-400 hover:text-slate-600 text-sm">
                  ביטול
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tasks */}
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-100 rounded-lg animate-pulse" />)}
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-10 text-center">
            <CheckSquare size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">אין משימות ליום זה</p>
            <button
              onClick={() => setAddingTask(true)}
              className="mt-3 text-sm text-primary-500 hover:underline"
            >
              הוסף משימה ראשונה
            </button>
          </div>
        ) : (
          <AnimatePresence>
            {tasks.map((task) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 p-4 border-b border-surface-50 last:border-0 group hover:bg-surface-50 transition-colors"
              >
                <button
                  onClick={() => toggleTask(task.id, !task.is_completed)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    task.is_completed
                      ? 'bg-green-500 border-green-500'
                      : 'border-slate-300 hover:border-primary-400'
                  }`}
                >
                  {task.is_completed && <CheckSquare size={11} className="text-white" />}
                </button>
                <span className={`flex-1 text-sm ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {task.title}
                </span>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-400 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
