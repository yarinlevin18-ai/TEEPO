// Offline sample MCQs used when the backend is unreachable.
// Picks a topic-flavored bank when possible.

import type { Question } from '@/types'

interface RawMcq {
  content: string
  options: Array<{ label: 'א' | 'ב' | 'ג' | 'ד'; text: string; is_correct: boolean; explanation: string }>
  source_ref: string
}

const ALGORITHMS_BANK: RawMcq[] = [
  {
    content: 'מהי הסיבוכיות הזמנית של DFS על גרף עם V קודקודים ו-E קשתות?',
    source_ref: 'lecture-3, slide 12',
    options: [
      { label: 'א', text: 'O(V)', is_correct: false, explanation: 'מתעלם מהצורך לעבור על כל הקשתות.' },
      { label: 'ב', text: 'O(V + E)', is_correct: true, explanation: 'כל קודקוד נסרק פעם אחת וכל קשת נסקרת פעם אחת.' },
      { label: 'ג', text: 'O(V·E)', is_correct: false, explanation: 'זה הגדל מדי — DFS לא חוזר על קשתות.' },
      { label: 'ד', text: 'O(V²)', is_correct: false, explanation: 'נכון רק לייצוג של מטריצת שכנויות, לא לרשימת שכנויות.' },
    ],
  },
  {
    content: 'איזו טכניקה מתאימה ביותר לבעיית "התרמיל" (Knapsack) הקלאסית?',
    source_ref: 'lecture-7, slide 4',
    options: [
      { label: 'א', text: 'אלגוריתם חמדן', is_correct: false, explanation: 'חמדן עובד רק לתרמיל שברים, לא ל-0/1.' },
      { label: 'ב', text: 'תכנון דינמי', is_correct: true, explanation: 'בעיה עם תת-בעיות חופפות ותכונה אופטימלית.' },
      { label: 'ג', text: 'חיפוש בינארי', is_correct: false, explanation: 'לא רלוונטי — אין סדר חד-ממדי.' },
      { label: 'ד', text: 'BFS', is_correct: false, explanation: 'BFS לא ממדל את משתני ההחלטה.' },
    ],
  },
  {
    content: 'בעיית NP-Complete ידועה היא:',
    source_ref: 'lecture-11, slide 8',
    options: [
      { label: 'א', text: 'מיון מערך', is_correct: false, explanation: 'נפתר ב-O(n log n).' },
      { label: 'ב', text: 'מציאת מסלול קצר ביותר', is_correct: false, explanation: 'דייקסטרה פותר ב-P.' },
      { label: 'ג', text: 'SAT', is_correct: true, explanation: 'משפט קוק-לווין — SAT היא הראשונה שהוכחה NP-Complete.' },
      { label: 'ד', text: 'בדיקת ראשוניות', is_correct: false, explanation: 'AKS פותר ב-P.' },
    ],
  },
  {
    content: 'BFS משתמש במבנה נתונים:',
    source_ref: 'lecture-3, slide 15',
    options: [
      { label: 'א', text: 'מחסנית (Stack)', is_correct: false, explanation: 'מחסנית מתאימה ל-DFS.' },
      { label: 'ב', text: 'תור (Queue)', is_correct: true, explanation: 'BFS עובד FIFO כדי לסרוק לפי שכבות.' },
      { label: 'ג', text: 'ערימה (Heap)', is_correct: false, explanation: 'Heap משמש בדייקסטרה.' },
      { label: 'ד', text: 'עץ אדום-שחור', is_correct: false, explanation: 'מבנה למפות ממוינות, לא ל-BFS.' },
    ],
  },
  {
    content: 'תכנון דינמי דורש:',
    source_ref: 'lecture-7, slide 1',
    options: [
      { label: 'א', text: 'תת-בעיות חופפות בלבד', is_correct: false, explanation: 'חסר התכונה האופטימלית.' },
      { label: 'ב', text: 'תכונה אופטימלית בלבד', is_correct: false, explanation: 'בלי תת-בעיות חופפות, חמדן עדיף.' },
      { label: 'ג', text: 'גם תת-בעיות חופפות וגם תכונה אופטימלית', is_correct: true, explanation: 'שתי התכונות יחד הן הקריטריון לתכנון דינמי.' },
      { label: 'ד', text: 'גרף ממושקל בלבד', is_correct: false, explanation: 'תכנון דינמי לא מוגבל לגרפים.' },
    ],
  },
  {
    content: 'אלגוריתם חמדן מובטח להחזיר פתרון אופטימלי כאשר:',
    source_ref: 'lecture-9, slide 6',
    options: [
      { label: 'א', text: 'הבעיה היא NP-Complete', is_correct: false, explanation: 'לא ניתן בזמן פולינומי.' },
      { label: 'ב', text: 'הבעיה היא NP-Hard', is_correct: false, explanation: 'אותה בעיה.' },
      { label: 'ג', text: 'הבעיה מקיימת תכונת בחירה חמדנית ואופטימליות תת-מבנית', is_correct: true, explanation: 'שני התנאים יחד מבטיחים נכונות של אלגוריתם חמדן.' },
      { label: 'ד', text: 'מספיק קלט קטן', is_correct: false, explanation: 'גודל הקלט אינו מבטיח אופטימליות.' },
    ],
  },
  {
    content: 'מהי סיבוכיות מיון מיזוג (Merge Sort)?',
    source_ref: 'lecture-1, slide 22',
    options: [
      { label: 'א', text: 'O(n)', is_correct: false, explanation: 'אין מיון השוואתי בזמן ליניארי.' },
      { label: 'ב', text: 'O(n log n)', is_correct: true, explanation: 'log n רמות של מיזוג, בכל אחת O(n) פעולות.' },
      { label: 'ג', text: 'O(n²)', is_correct: false, explanation: 'זה Bubble Sort, לא Merge.' },
      { label: 'ד', text: 'O(log n)', is_correct: false, explanation: 'אי אפשר למיין ב-log בלבד.' },
    ],
  },
  {
    content: 'איזה אלגוריתם מתאים למציאת מסלול קצר ביותר בגרף עם משקלים שליליים (אך ללא מעגל שלילי)?',
    source_ref: 'lecture-5, slide 18',
    options: [
      { label: 'א', text: 'דייקסטרה', is_correct: false, explanation: 'דייקסטרה לא נכונה עם משקלים שליליים.' },
      { label: 'ב', text: 'BFS', is_correct: false, explanation: 'BFS עובד רק על קשתות בעלות משקל אחיד.' },
      { label: 'ג', text: 'Bellman-Ford', is_correct: true, explanation: 'תומך במשקלים שליליים ומגלה מעגלים שליליים.' },
      { label: 'ד', text: 'Floyd-Warshall', is_correct: false, explanation: 'נכון, אך נועד למסלולים בין כל הזוגות — בזבזני לבעיה ממוצא יחיד.' },
    ],
  },
]

const SOCIOLOGY_BANK: RawMcq[] = [
  {
    content: 'מהי תיאוריית הקונפליקט בסוציולוגיה?',
    source_ref: 'lecture-4, slide 7',
    options: [
      { label: 'א', text: 'גישה שמדגישה הסכמה חברתית', is_correct: false, explanation: 'זוהי הגישה הפונקציונליסטית.' },
      { label: 'ב', text: 'גישה שמתמקדת במאבק על משאבים בין קבוצות', is_correct: true, explanation: 'מקסיסט במקור — מבט על המבנה החברתי כזירת מאבק.' },
      { label: 'ג', text: 'מחקר על אינטראקציה יומיומית', is_correct: false, explanation: 'זוהי האינטראקציוניזם הסימבולי.' },
      { label: 'ד', text: 'תיאוריה פסיכולוגית', is_correct: false, explanation: 'סוציולוגיה לא פסיכולוגיה.' },
    ],
  },
  {
    content: 'מי נחשב לאבי הסוציולוגיה הפונקציונליסטית?',
    source_ref: 'lecture-2, slide 11',
    options: [
      { label: 'א', text: 'קרל מרקס', is_correct: false, explanation: 'מרקס שייך לתיאוריית הקונפליקט.' },
      { label: 'ב', text: 'מקס ובר', is_correct: false, explanation: 'ובר ידוע בעיקר על תיאוריית הביורוקרטיה והפעולה החברתית.' },
      { label: 'ג', text: 'אמיל דורקהיים', is_correct: true, explanation: 'דורקהיים פיתח את הגישה הפונקציונליסטית והכניס את "העובדה החברתית".' },
      { label: 'ד', text: 'ארווינג גופמן', is_correct: false, explanation: 'גופמן שייך לאינטראקציוניזם הסימבולי.' },
    ],
  },
  {
    content: '"דרמטורגיה" של גופמן עוסקת בעיקר ב:',
    source_ref: 'lecture-6, slide 3',
    options: [
      { label: 'א', text: 'ניתוח מבני של חברות', is_correct: false, explanation: 'זוהי גישה פונקציונליסטית או סטרוקטורליסטית.' },
      { label: 'ב', text: 'הצגת העצמי באינטראקציה יומיומית', is_correct: true, explanation: 'גופמן השווה אינטראקציה חברתית להצגה תיאטרלית.' },
      { label: 'ג', text: 'מאבק מעמדי', is_correct: false, explanation: 'זוהי תיאוריית הקונפליקט.' },
      { label: 'ד', text: 'משבר זהות מודרני', is_correct: false, explanation: 'נושא קרוב אך לא הליבה של "דרמטורגיה".' },
    ],
  },
  {
    content: 'מודרניזציה לפי גישתו של ובר מתאפיינת בעיקר ב:',
    source_ref: 'lecture-9, slide 14',
    options: [
      { label: 'א', text: 'התעצמות של דת', is_correct: false, explanation: 'הפוך — חילון.' },
      { label: 'ב', text: 'רציונליזציה וביורוקרטיזציה', is_correct: true, explanation: 'ובר זיהה את הרציונליזציה כתהליך מרכזי במעבר למודרניות.' },
      { label: 'ג', text: 'חיזוק קשרים שבטיים', is_correct: false, explanation: 'תהליך הפוך — דה-טריבליזציה.' },
      { label: 'ד', text: 'ירידה בחלוקת עבודה', is_correct: false, explanation: 'לפי דורקהיים, חלוקת העבודה דווקא גוברת.' },
    ],
  },
  {
    content: 'מהי "עובדה חברתית" לפי דורקהיים?',
    source_ref: 'lecture-2, slide 14',
    options: [
      { label: 'א', text: 'תופעה פסיכולוגית של פרט בודד', is_correct: false, explanation: 'דורקהיים התעקש על התרכזות בקיבוץ ולא בפרט.' },
      { label: 'ב', text: 'דרך חשיבה ופעולה החיצונית לפרט ובעלת כוח כפייה', is_correct: true, explanation: 'ההגדרה הקלאסית של דורקהיים בספרו "כללי השיטה הסוציולוגית".' },
      { label: 'ג', text: 'נתון סטטיסטי על אוכלוסייה', is_correct: false, explanation: 'נתון כן יכול להיות אינדיקטור, אך אינו ה"עובדה" עצמה.' },
      { label: 'ד', text: 'אירוע היסטורי יחיד', is_correct: false, explanation: 'דורקהיים חיפש דפוסים, לא אירועים יחידים.' },
    ],
  },
]

const GENERIC_BANK: RawMcq[] = [
  {
    content: 'איזו מהאפשרויות הבאות היא דוגמה לרעיון מרכזי בנושא?',
    source_ref: 'demo',
    options: [
      { label: 'א', text: 'אפשרות 1', is_correct: false, explanation: 'לא נכון — דוגמה.' },
      { label: 'ב', text: 'אפשרות 2 הנכונה', is_correct: true, explanation: 'נכון — דוגמה בסיסית.' },
      { label: 'ג', text: 'אפשרות 3', is_correct: false, explanation: 'לא נכון — דוגמה.' },
      { label: 'ד', text: 'אפשרות 4', is_correct: false, explanation: 'לא נכון — דוגמה.' },
    ],
  },
  {
    content: 'הגדרה נכונה של המושג היא:',
    source_ref: 'demo',
    options: [
      { label: 'א', text: 'הגדרה שגויה א', is_correct: false, explanation: 'לא נכון — דוגמה.' },
      { label: 'ב', text: 'הגדרה שגויה ב', is_correct: false, explanation: 'לא נכון — דוגמה.' },
      { label: 'ג', text: 'הגדרה נכונה ג', is_correct: true, explanation: 'נכון — דוגמה בסיסית.' },
      { label: 'ד', text: 'הגדרה שגויה ד', is_correct: false, explanation: 'לא נכון — דוגמה.' },
    ],
  },
]

export function sampleMcqs(topicTitle: string, sessionId: string): Question[] {
  const lower = topicTitle.toLowerCase()
  let bank: RawMcq[]
  if (
    lower.includes('dfs') ||
    lower.includes('bfs') ||
    lower.includes('dynamic') ||
    lower.includes('np') ||
    lower.includes('סיבוכ') ||
    lower.includes('גרפ') ||
    lower.includes('אלגו')
  ) {
    bank = ALGORITHMS_BANK
  } else if (
    lower.includes('סוצ') ||
    lower.includes('פונקצ') ||
    lower.includes('קונפ') ||
    lower.includes('אינטראק') ||
    lower.includes('דורקה') ||
    lower.includes('ובר') ||
    lower.includes('מודרני')
  ) {
    bank = SOCIOLOGY_BANK
  } else {
    bank = GENERIC_BANK
  }

  return bank.map((q, i) => ({
    id: `q_${sessionId}_${i}`,
    session_id: sessionId,
    type: 'mcq',
    content: q.content,
    options: q.options,
    explanation: q.options.find((o) => o.is_correct)?.explanation ?? '',
    source_file_ref: q.source_ref,
  }))
}
