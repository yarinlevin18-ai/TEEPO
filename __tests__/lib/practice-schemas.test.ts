import { describe, it, expect } from 'vitest'
import {
  GeneratedQuizSchema,
  GradeResultSchema,
  extractJsonObject,
} from '@/lib/practice/schemas'

describe('extractJsonObject', () => {
  it('parses a bare JSON object', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 })
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n{"score": 80, "feedback": "טוב"}\n```'
    expect(extractJsonObject(raw)).toEqual({ score: 80, feedback: 'טוב' })
  })

  it('ignores prose around the object', () => {
    const raw = 'הנה הבוחן:\n{"title":"t","questions":[]}\nבהצלחה!'
    expect(extractJsonObject(raw)).toEqual({ title: 't', questions: [] })
  })

  it('handles nested braces (rubric text containing {})', () => {
    const raw = '{"feedback":"קבוצה {a,b}","score":50,"strengths":[],"gaps":[]}'
    expect(extractJsonObject(raw)).toEqual({
      feedback: 'קבוצה {a,b}', score: 50, strengths: [], gaps: [],
    })
  })

  it('throws when there is no JSON object', () => {
    expect(() => extractJsonObject('sorry, cannot help')).toThrow()
  })

  it('throws on malformed JSON', () => {
    expect(() => extractJsonObject('{"a": }')).toThrow()
  })
})

describe('GeneratedQuizSchema', () => {
  const validQuestion = {
    question: 'הסבר את משפט הדגימה של נייקוויסט',
    rubric: 'הגדרת תדר דגימה (50), תנאי השחזור (50)',
    model_answer: 'יש לדגום בתדר כפול מהתדר המקסימלי.',
  }

  it('accepts a valid quiz', () => {
    const quiz = { title: 'עיבוד אותות — שבוע 3', questions: [validQuestion] }
    expect(GeneratedQuizSchema.parse(quiz)).toEqual(quiz)
  })

  it('accepts a question without model_answer', () => {
    const { model_answer: _omit, ...noModel } = validQuestion
    const quiz = { title: 't', questions: [noModel] }
    expect(GeneratedQuizSchema.parse(quiz).questions[0].model_answer).toBeUndefined()
  })

  it('rejects an empty questions array', () => {
    expect(() => GeneratedQuizSchema.parse({ title: 't', questions: [] })).toThrow()
  })

  it('rejects a question missing its rubric', () => {
    const quiz = { title: 't', questions: [{ question: validQuestion.question }] }
    expect(() => GeneratedQuizSchema.parse(quiz)).toThrow()
  })
})

describe('GradeResultSchema', () => {
  it('accepts a full verdict', () => {
    const grade = {
      score: 85,
      feedback: 'תשובה מדויקת ברובה.',
      strengths: ['הגדרה נכונה'],
      gaps: ['חסר תנאי השחזור'],
    }
    expect(GradeResultSchema.parse(grade)).toEqual(grade)
  })

  it('defaults strengths/gaps to empty arrays', () => {
    const parsed = GradeResultSchema.parse({ score: 10, feedback: 'לא לעניין' })
    expect(parsed.strengths).toEqual([])
    expect(parsed.gaps).toEqual([])
  })

  it('rejects out-of-range scores', () => {
    expect(() => GradeResultSchema.parse({ score: 130, feedback: 'x' })).toThrow()
    expect(() => GradeResultSchema.parse({ score: -5, feedback: 'x' })).toThrow()
  })
})
