// Offline sample flashcards used when the backend is unreachable.
// Topic-flavored when possible.

import type { Flashcard } from '@/types'

interface RawCard {
  front: string
  back: string
}

const ALGORITHMS_DECK: RawCard[] = [
  { front: 'DFS — מבנה נתונים', back: 'מחסנית (Stack), במפורש או דרך רקורסיה' },
  { front: 'BFS — מבנה נתונים', back: 'תור (Queue) — FIFO' },
  { front: 'סיבוכיות BFS / DFS', back: 'O(V + E) על רשימת שכנויות' },
  { front: 'דייקסטרה — תנאי שימוש', back: 'כל המשקלים אי-שליליים' },
  { front: 'Bellman-Ford — תרומה ייחודית', back: 'תומך במשקלים שליליים, מגלה מעגל שלילי' },
  { front: 'Floyd-Warshall — סיבוכיות', back: 'O(V³) — מסלולים בין כל הזוגות' },
  { front: 'תכנון דינמי — שני תנאים', back: 'תת-בעיות חופפות + תכונה אופטימלית' },
  { front: 'אלגוריתם חמדן — תנאים', back: 'תכונת בחירה חמדנית + תכונה אופטימלית תת-מבנית' },
  { front: 'NP-Complete — דוגמה קלאסית', back: 'SAT (משפט קוק-לווין)' },
  { front: 'Master Theorem — מטרה', back: 'פתרון יחס נסיגה T(n) = aT(n/b) + f(n)' },
  { front: 'Merge Sort — סיבוכיות', back: 'O(n log n) זמן, O(n) מקום' },
  { front: 'Quick Sort — סיבוכיות גרועה', back: 'O(n²) — קלט כבר ממוין עם pivot גרוע' },
  { front: 'Heap — תכונת ערימה (max)', back: 'אבא ≥ ילדים' },
  { front: 'AVL — תכונה', back: 'הפרש גובה בין תת-עצים ≤ 1' },
  { front: 'Hash Table — סיבוכיות חיפוש ממוצעת', back: 'O(1) בהנחת פונקציית גיבוב טובה' },
  { front: 'Knapsack 0/1 — שיטת פתרון', back: 'תכנון דינמי, O(n·W)' },
  { front: 'Knapsack שברים — שיטת פתרון', back: 'אלגוריתם חמדן לפי יחס value/weight' },
  { front: 'Topological Sort — תנאי', back: 'הגרף מכוון וחסר מעגלים (DAG)' },
  { front: 'מעגל אוילר — תנאי', back: 'בגרף לא מכוון: כל קודקוד עם דרגה זוגית, וקשיר' },
  { front: 'Union-Find — אופטימיזציות', back: 'Path compression + Union by rank' },
]

const SOCIOLOGY_DECK: RawCard[] = [
  { front: 'דורקהיים — תרומה מרכזית', back: 'הגדרת "עובדה חברתית" וגישה פונקציונליסטית' },
  { front: 'מרקס — תיאוריה מרכזית', back: 'מאבק מעמדי, תיאוריית הקונפליקט' },
  { front: 'ובר — תרומה מרכזית', back: 'רציונליזציה, ביורוקרטיה, אתיקה פרוטסטנטית' },
  { front: 'גופמן — מושג מרכזי', back: 'דרמטורגיה — הצגת העצמי' },
  { front: 'אנומיה (דורקהיים) — הגדרה', back: 'מצב של חוסר נורמות בחברה' },
  { front: 'סוציאליזציה ראשונית', back: 'בילדות המוקדמת, במשפחה — בסיס לזהות' },
  { front: 'סוציאליזציה משנית', back: 'בבית הספר ובקבוצות הגיל — אינטגרציה לחברה הרחבה' },
  { front: 'מבנה (Structure) מול סוכנות (Agency)', back: 'הדיון המתמשך על יחסי כפייה חברתית מול בחירה אישית' },
  { front: 'גלובליזציה — היבט סוציולוגי מרכזי', back: 'דחיסת זמן-מרחב, התקצרות מרחקים תרבותיים וכלכליים' },
  { front: 'כלכלה פוליטית', back: 'ניתוח של יחסי כוח בין מעמדות וכלכלה' },
  { front: 'תיאוריית התיוג (Labeling)', back: 'סטייה חברתית נוצרת דרך תהליך התיוג, לא במהותו של המעשה' },
  { front: 'אינטראקציוניזם סימבולי — מקור', back: 'ג׳ורג׳ הרברט מיד ופיתוח על-ידי הרברט בלומר' },
  { front: 'הון תרבותי (בורדייה)', back: 'כישורים, ידע ודפוסי טעם המעניקים יתרון חברתי' },
  { front: 'תיאוריית המערכות העולמיות (וולרסטיין)', back: 'חלוקה למרכז, פריפריה וסמי-פריפריה' },
  { front: 'מודרניות מאוחרת (גידנס)', back: 'רפלקסיביות מוגברת, ניתוק, ושינוי מתמיד' },
]

const GENERIC_DECK: RawCard[] = [
  { front: 'מושג מרכזי 1', back: 'הגדרה לדוגמה של המושג' },
  { front: 'מושג מרכזי 2', back: 'הגדרה לדוגמה' },
  { front: 'מושג מרכזי 3', back: 'הגדרה לדוגמה' },
  { front: 'מושג מרכזי 4', back: 'הגדרה לדוגמה' },
  { front: 'מושג מרכזי 5', back: 'הגדרה לדוגמה' },
  { front: 'מושג מרכזי 6', back: 'הגדרה לדוגמה' },
  { front: 'מושג מרכזי 7', back: 'הגדרה לדוגמה' },
  { front: 'מושג מרכזי 8', back: 'הגדרה לדוגמה' },
  { front: 'מושג מרכזי 9', back: 'הגדרה לדוגמה' },
  { front: 'מושג מרכזי 10', back: 'הגדרה לדוגמה' },
]

export function sampleFlashcards(
  topicTitle: string,
  topicId: string,
  courseId: string,
): Flashcard[] {
  const lower = topicTitle.toLowerCase()
  let bank: RawCard[]
  if (
    lower.includes('dfs') ||
    lower.includes('bfs') ||
    lower.includes('dynamic') ||
    lower.includes('np') ||
    lower.includes('סיבוכ') ||
    lower.includes('גרפ') ||
    lower.includes('אלגו')
  ) {
    bank = ALGORITHMS_DECK
  } else if (
    lower.includes('סוצ') ||
    lower.includes('פונקצ') ||
    lower.includes('קונפ') ||
    lower.includes('אינטראק') ||
    lower.includes('דורקה') ||
    lower.includes('ובר') ||
    lower.includes('מודרני')
  ) {
    bank = SOCIOLOGY_DECK
  } else {
    bank = GENERIC_DECK
  }

  return bank.map((c, i) => ({
    id: `card_${courseId}_${topicId}_${i}`,
    course_id: courseId,
    topic_id: topicId,
    front: c.front,
    back: c.back,
    status: 'new',
  }))
}
