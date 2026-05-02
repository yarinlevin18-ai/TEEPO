// Offline sample past exams for simulation runs.

export type SimQuestionType = 'mcq' | 'open'

export interface SimQuestion {
  id: string
  type: SimQuestionType
  topic_id: string
  topic_title: string
  content: string
  // mcq
  options?: Array<{ label: 'א' | 'ב' | 'ג' | 'ד'; text: string; is_correct: boolean }>
  correct_label?: 'א' | 'ב' | 'ג' | 'ד'
  // open
  reference_answer?: string
  key_points?: string[]
  // both
  source_ref: string
  points: number
}

const ALGORITHMS_EXAM: SimQuestion[] = [
  {
    id: 'q1',
    type: 'mcq',
    topic_id: 't_dfs',
    topic_title: 'DFS',
    content: 'מהי סיבוכיות הזמן של DFS על גרף עם V קודקודים ו-E קשתות (ייצוג רשימת שכנויות)?',
    options: [
      { label: 'א', text: 'O(V)', is_correct: false },
      { label: 'ב', text: 'O(V + E)', is_correct: true },
      { label: 'ג', text: 'O(V·E)', is_correct: false },
      { label: 'ד', text: 'O(V²)', is_correct: false },
    ],
    correct_label: 'ב',
    source_ref: 'past-exam-2024, q1',
    points: 10,
  },
  {
    id: 'q2',
    type: 'mcq',
    topic_id: 't_dp',
    topic_title: 'תכנון דינמי',
    content: 'איזה אלגוריתם מתאים ביותר לבעיית התרמיל 0/1?',
    options: [
      { label: 'א', text: 'אלגוריתם חמדן', is_correct: false },
      { label: 'ב', text: 'BFS', is_correct: false },
      { label: 'ג', text: 'תכנון דינמי', is_correct: true },
      { label: 'ד', text: 'חיפוש בינארי', is_correct: false },
    ],
    correct_label: 'ג',
    source_ref: 'past-exam-2024, q2',
    points: 10,
  },
  {
    id: 'q3',
    type: 'mcq',
    topic_id: 't_graphs',
    topic_title: 'גרפים',
    content: 'איזה אלגוריתם פותר נכון בעיית מסלול קצר עם משקלים שליליים (ללא מעגלים שליליים)?',
    options: [
      { label: 'א', text: 'דייקסטרה', is_correct: false },
      { label: 'ב', text: 'Bellman-Ford', is_correct: true },
      { label: 'ג', text: 'BFS', is_correct: false },
      { label: 'ד', text: 'Topological Sort', is_correct: false },
    ],
    correct_label: 'ב',
    source_ref: 'past-exam-2024, q3',
    points: 10,
  },
  {
    id: 'q4',
    type: 'mcq',
    topic_id: 't_np',
    topic_title: 'NP-Completeness',
    content: 'איזו בעיה הוכחה ראשונה כ-NP-Complete (משפט קוק-לווין)?',
    options: [
      { label: 'א', text: 'מיון', is_correct: false },
      { label: 'ב', text: 'מסלול קצר ביותר', is_correct: false },
      { label: 'ג', text: 'SAT', is_correct: true },
      { label: 'ד', text: 'בדיקת ראשוניות', is_correct: false },
    ],
    correct_label: 'ג',
    source_ref: 'past-exam-2024, q4',
    points: 10,
  },
  {
    id: 'q5',
    type: 'open',
    topic_id: 't_dp',
    topic_title: 'תכנון דינמי',
    content:
      'הסבר במילים שלך מהם שני התנאים שצריכים להתקיים כדי שניתן יהיה להשתמש בתכנון דינמי. תן דוגמה לבעיה שמקיימת אותם.',
    reference_answer:
      'תכנון דינמי דורש שני תנאים: (1) תת-בעיות חופפות — אותה תת-בעיה מופיעה שוב ושוב במהלך החישוב, (2) תכונה אופטימלית תת-מבנית — הפתרון האופטימלי לבעיה הכוללת מורכב מפתרונות אופטימליים של תת-הבעיות. דוגמה: בעיית התרמיל 0/1, או חישוב ערכי פיבונאצ׳י עם מטמון.',
    key_points: ['תת-בעיות חופפות', 'תכונה אופטימלית תת-מבנית', 'דוגמה רלוונטית'],
    source_ref: 'past-exam-2024, q5',
    points: 30,
  },
  {
    id: 'q6',
    type: 'open',
    topic_id: 't_graphs',
    topic_title: 'גרפים',
    content:
      'תאר אלגוריתם למיון טופולוגי של גרף מכוון חסר מעגלים (DAG). מה הסיבוכיות שלו ולמה?',
    reference_answer:
      'אלגוריתם בסיסי: DFS על הגרף, ובסיום ביקור בקודקוד דוחפים אותו למחסנית. בסוף הגרף, היסטוריית הדחיפות במחסנית בסדר הפוך נותנת מיון טופולוגי. הסיבוכיות O(V + E) — DFS עובר על כל קודקוד פעם אחת ועל כל קשת פעם אחת.',
    key_points: ['DFS', 'דחיפה למחסנית בסיום ביקור', 'O(V + E)'],
    source_ref: 'past-exam-2024, q6',
    points: 30,
  },
]

const SOCIOLOGY_EXAM: SimQuestion[] = [
  {
    id: 'q1',
    type: 'mcq',
    topic_id: 't_durkheim',
    topic_title: 'דורקהיים',
    content: 'מי הוא אבי הסוציולוגיה הפונקציונליסטית?',
    options: [
      { label: 'א', text: 'קרל מרקס', is_correct: false },
      { label: 'ב', text: 'אמיל דורקהיים', is_correct: true },
      { label: 'ג', text: 'מקס ובר', is_correct: false },
      { label: 'ד', text: 'ארווינג גופמן', is_correct: false },
    ],
    correct_label: 'ב',
    source_ref: 'past-exam-2024, q1',
    points: 10,
  },
  {
    id: 'q2',
    type: 'mcq',
    topic_id: 't_conflict',
    topic_title: 'קונפליקט',
    content: 'תיאוריית הקונפליקט מתמקדת ב:',
    options: [
      { label: 'א', text: 'הסכמה חברתית', is_correct: false },
      { label: 'ב', text: 'מאבק על משאבים', is_correct: true },
      { label: 'ג', text: 'אינטראקציה יומיומית', is_correct: false },
      { label: 'ד', text: 'פסיכולוגיה של פרט', is_correct: false },
    ],
    correct_label: 'ב',
    source_ref: 'past-exam-2024, q2',
    points: 10,
  },
  {
    id: 'q3',
    type: 'open',
    topic_id: 't_weber',
    topic_title: 'ובר',
    content: 'הסבר את מושג הרציונליזציה לפי מקס ובר ותן דוגמה למימוש שלו במוסד מודרני.',
    reference_answer:
      'רציונליזציה לפי ובר היא תהליך שבו הפעולה החברתית הופכת מבוססת יותר על חישוב, חוקים פורמליים ויעילות, ופחות על מסורת או רגש. היא מתבטאת בעיקר בביורוקרטיה — מערכת הבנויה על היררכיה ברורה, חלוקת תפקידים, וכללים פורמליים. דוגמה: משרד ממשלתי או חברה גדולה שמטפלת בבקשות לפי טפסים סטנדרטיים, ולא לפי שיקול דעת אישי.',
    key_points: ['חישוב/יעילות', 'חוקים פורמליים', 'ביורוקרטיה', 'דוגמה רלוונטית'],
    source_ref: 'past-exam-2024, q3',
    points: 40,
  },
  {
    id: 'q4',
    type: 'open',
    topic_id: 't_goffman',
    topic_title: 'גופמן',
    content: 'מה המשמעות של "ניהול רושם" (impression management) בתיאוריה הדרמטורגית של גופמן? תן דוגמה מהחיים האקדמיים.',
    reference_answer:
      'ניהול רושם הוא הפעולה האקטיבית של אדם לשלוט בדרך שבה אחרים תופסים אותו, באמצעות בחירת לבוש, שפה, וגוון. בחיים האקדמיים: סטודנט שמתלבש בצורה רשמית יותר לפני ראיון או שמדגיש ידע מסוים בשיחה עם מרצה — הוא מנהל רושם של "סטודנט רציני".',
    key_points: ['שליטה בתפיסה של אחרים', 'בחירת סימנים (לבוש/שפה)', 'דוגמה רלוונטית'],
    source_ref: 'past-exam-2024, q4',
    points: 40,
  },
]

const GENERIC_EXAM: SimQuestion[] = [
  {
    id: 'q1',
    type: 'mcq',
    topic_id: 't_intro',
    topic_title: 'מבוא',
    content: 'איזו מהאפשרויות תקפה?',
    options: [
      { label: 'א', text: 'אפשרות א', is_correct: true },
      { label: 'ב', text: 'אפשרות ב', is_correct: false },
      { label: 'ג', text: 'אפשרות ג', is_correct: false },
      { label: 'ד', text: 'אפשרות ד', is_correct: false },
    ],
    correct_label: 'א',
    source_ref: 'demo',
    points: 25,
  },
  {
    id: 'q2',
    type: 'mcq',
    topic_id: 't_intro',
    topic_title: 'מבוא',
    content: 'הגדרה נכונה של המושג היא:',
    options: [
      { label: 'א', text: 'הגדרה שגויה', is_correct: false },
      { label: 'ב', text: 'הגדרה נכונה', is_correct: true },
      { label: 'ג', text: 'הגדרה שגויה', is_correct: false },
      { label: 'ד', text: 'הגדרה שגויה', is_correct: false },
    ],
    correct_label: 'ב',
    source_ref: 'demo',
    points: 25,
  },
  {
    id: 'q3',
    type: 'open',
    topic_id: 't_intro',
    topic_title: 'מבוא',
    content: 'הסבר את הרעיון המרכזי של הקורס במשפט-שניים.',
    reference_answer: 'תשובה לדוגמה: הסבר תמציתי של הרעיון המרכזי.',
    key_points: ['הסבר תמציתי', 'דוגמה'],
    source_ref: 'demo',
    points: 50,
  },
]

export function sampleExam(courseName: string): SimQuestion[] {
  const lower = courseName.toLowerCase()
  if (
    lower.includes('algo') ||
    lower.includes('אלגו') ||
    lower.includes('dfs') ||
    lower.includes('np') ||
    lower.includes('סיבוכ')
  ) {
    return ALGORITHMS_EXAM
  }
  if (
    lower.includes('socio') ||
    lower.includes('סוצ') ||
    lower.includes('דורקה') ||
    lower.includes('ובר') ||
    lower.includes('גופמן')
  ) {
    return SOCIOLOGY_EXAM
  }
  return GENERIC_EXAM
}

export function totalPoints(questions: SimQuestion[]): number {
  return questions.reduce((s, q) => s + q.points, 0)
}
