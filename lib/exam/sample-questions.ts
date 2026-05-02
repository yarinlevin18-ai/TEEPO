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

// ============================================================
// Open-question bank (spec §3.3.2)
// ============================================================

export interface OpenQuestion {
  id: string
  session_id: string
  content: string
  reference_answer: string
  key_points: string[]
  source_file_ref: string
}

interface RawOpen {
  content: string
  reference_answer: string
  key_points: string[]
  source_ref: string
}

const ALGORITHMS_OPEN: RawOpen[] = [
  {
    content: 'הסבר את ההבדל בין DFS ל-BFS, ומה מבנה הנתונים שבו משתמשים בכל אחד.',
    reference_answer:
      'DFS (Depth-First Search) חוקר את הגרף לעומק לפני רוחב — נכנס לקודקוד, ממשיך לשכן ראשון, ולשכן שלו, וכן הלאה עד שאי אפשר להמשיך, ואז חוזר אחורה. משתמש במחסנית (stack), במפורש או דרך רקורסיה. BFS (Breadth-First Search) חוקר את הגרף שכבה-שכבה — בודק את כל השכנים של הקודקוד, אז את שכניהם, וכו׳. משתמש בתור (queue, FIFO).',
    key_points: ['לעומק לעומת לרוחב', 'מחסנית', 'תור', 'רקורסיה', 'שכבות'],
    source_ref: 'lecture-3, slides 12-15',
  },
  {
    content: 'מהם שני התנאים שצריכים להתקיים כדי להשתמש בתכנון דינמי? תן דוגמה.',
    reference_answer:
      'תכנון דינמי דורש (1) תת-בעיות חופפות — אותה תת-בעיה חוזרת בחישוב, ו-(2) תכונה אופטימלית תת-מבנית — הפתרון האופטימלי לבעיה הכוללת בנוי מפתרונות אופטימליים של תת-הבעיות. דוגמה: בעיית התרמיל 0/1, פיבונאצ׳י עם מטמון, או חישוב מסלול קצר ביותר עם בלמן-פורד.',
    key_points: ['תת-בעיות חופפות', 'תכונה אופטימלית', 'דוגמה'],
    source_ref: 'lecture-7, slides 4-6',
  },
  {
    content: 'מהי בעיית NP-Complete? תן דוגמה אחת ומדוע היא נחשבת קשה.',
    reference_answer:
      'בעיית NP-Complete היא בעיה ב-NP (ניתן לאמת פתרון בזמן פולינומי) שכל בעיה אחרת ב-NP ניתנת להפחתה אליה בזמן פולינומי. דוגמה: SAT (משפט קוק-לווין). הקושי נובע מכך שאם תמצא פתרון פולינומי לאחת מהבעיות הללו, יהיה לך פתרון פולינומי לכל בעיה ב-NP — אבל לא ידוע אם קיים פתרון כזה (השאלה P מול NP).',
    key_points: ['NP', 'הפחתה', 'SAT', 'משפט קוק-לווין', 'P מול NP'],
    source_ref: 'lecture-11, slides 8-12',
  },
  {
    content: 'מתי אלגוריתם חמדן יחזיר פתרון אופטימלי? תאר את התנאים והבא דוגמה לאלגוריתם חמדן מוכר.',
    reference_answer:
      'אלגוריתם חמדן מחזיר פתרון אופטימלי כאשר הבעיה מקיימת שני תנאים: (1) תכונת בחירה חמדנית — אפשר להגיע לפתרון גלובלי אופטימלי על ידי בחירות מקומיות אופטימליות, ו-(2) תכונה אופטימלית תת-מבנית — הפתרון האופטימלי מורכב מפתרונות אופטימליים של תת-בעיות. דוגמאות: דייקסטרה למסלולים קצרים, פריזם/קרוסקל לעצים פורשים מינימליים, תזמון פעילויות לפי זמן סיום מוקדם.',
    key_points: ['תכונת בחירה חמדנית', 'תכונה אופטימלית', 'דייקסטרה', 'קרוסקל'],
    source_ref: 'lecture-9, slides 6-10',
  },
]

const SOCIOLOGY_OPEN: RawOpen[] = [
  {
    content: 'הסבר את מושג הרציונליזציה לפי ובר ותן דוגמה למימוש שלו במוסד מודרני.',
    reference_answer:
      'רציונליזציה לפי ובר היא תהליך שבו הפעולה החברתית הופכת מבוססת על חישוב, חוקים פורמליים, ויעילות, ופחות על מסורת או רגש. היא מתבטאת בעיקר בביורוקרטיה — מערכת היררכית עם תפקידים מוגדרים וכללים פורמליים. דוגמה: משרד ממשלתי שמטפל בבקשות לפי טפסים סטנדרטיים, או חברה שמקצה משאבים לפי מדדי ביצוע מדידים.',
    key_points: ['חישוב/יעילות', 'חוקים פורמליים', 'ביורוקרטיה', 'דוגמה'],
    source_ref: 'lecture-9, slides 14-18',
  },
  {
    content: 'מהי "עובדה חברתית" לפי דורקהיים, ולמה היא חשובה לסוציולוגיה כדיסציפלינה?',
    reference_answer:
      'עובדה חברתית לפי דורקהיים היא דרך חשיבה ופעולה החיצונית לפרט, ובעלת כוח כפייה (כלומר, הפרט נדרש להתאים את עצמו אליה גם אם אינו מעוניין). דוגמאות: שפה, חוק, מנהג. החשיבות לסוציולוגיה: ההגדרה הזו מבססת את הסוציולוגיה כמדע נפרד — האובייקט שלה אינו פסיכולוגי (פנימי לפרט) אלא חברתי (חיצוני וקיבוצי), ולכן דורש שיטות וכלים משלו.',
    key_points: ['חיצוני לפרט', 'כוח כפייה', 'דוגמה', 'מדע נפרד'],
    source_ref: 'lecture-2, slides 14-17',
  },
  {
    content: 'תאר את ההבדל בין הגישה הפונקציונליסטית לתיאוריית הקונפליקט.',
    reference_answer:
      'הגישה הפונקציונליסטית רואה את החברה כמערכת של חלקים שמשתפים פעולה לטובת היציבות והשרידות הקולקטיבית. כל מוסד ממלא תפקיד ביחס לסך הכל. דוגמת חוקרים: דורקהיים. תיאוריית הקונפליקט, לעומת זאת, רואה את החברה כזירת מאבק בין קבוצות אינטרסים על משאבים מוגבלים. המבנה החברתי משקף את כוחן של קבוצות חזקות שמשמרות את עליונותן. דוגמת חוקר: מרקס. ההבדל המרכזי הוא בהנחות יסוד — הסכמה ושיתוף פעולה לעומת מאבק וניצול.',
    key_points: ['יציבות וקונסנזוס', 'מאבק על משאבים', 'דורקהיים', 'מרקס'],
    source_ref: 'lecture-4, slides 7-12',
  },
]

const GENERIC_OPEN: RawOpen[] = [
  {
    content: 'הסבר את הרעיון המרכזי של הנושא במילים שלך.',
    reference_answer: 'תשובה לדוגמה: הסבר תמציתי של הרעיון המרכזי, עם דוגמה רלוונטית.',
    key_points: ['הסבר תמציתי', 'דוגמה'],
    source_ref: 'demo',
  },
  {
    content: 'תאר שני יישומים מעשיים של הנושא.',
    reference_answer: 'תשובה לדוגמה: שני יישומים שונים, עם הסבר על איך הנושא מופעל בכל אחד.',
    key_points: ['יישום 1', 'יישום 2', 'הסבר'],
    source_ref: 'demo',
  },
]

export function sampleOpenQuestions(topicTitle: string, sessionId: string): OpenQuestion[] {
  const lower = topicTitle.toLowerCase()
  let bank: RawOpen[]
  if (
    lower.includes('dfs') ||
    lower.includes('bfs') ||
    lower.includes('dynamic') ||
    lower.includes('np') ||
    lower.includes('סיבוכ') ||
    lower.includes('גרפ') ||
    lower.includes('אלגו')
  ) {
    bank = ALGORITHMS_OPEN
  } else if (
    lower.includes('סוצ') ||
    lower.includes('פונקצ') ||
    lower.includes('קונפ') ||
    lower.includes('דורקה') ||
    lower.includes('ובר') ||
    lower.includes('מודרני')
  ) {
    bank = SOCIOLOGY_OPEN
  } else {
    bank = GENERIC_OPEN
  }
  return bank.map((q, i) => ({
    id: `oq_${sessionId}_${i}`,
    session_id: sessionId,
    content: q.content,
    reference_answer: q.reference_answer,
    key_points: q.key_points,
    source_file_ref: q.source_ref,
  }))
}

// Offline heuristic for grading open answers.
// Conservative — when in doubt, returns "uncertain" so the user knows to verify.
export function offlineEvaluateOpen(question: OpenQuestion, answer: string): {
  verdict: 'full' | 'partial' | 'insufficient' | 'uncertain'
  reasoning: string
  missing_points: string[]
  confidence: number
} {
  const trimmed = answer.trim()
  if (trimmed.length === 0) {
    return {
      verdict: 'insufficient',
      reasoning: 'לא הוזנה תשובה.',
      missing_points: question.key_points,
      confidence: 1.0,
    }
  }
  if (trimmed.length < 20) {
    return {
      verdict: 'insufficient',
      reasoning: 'התשובה קצרה מאוד — חסר פיתוח של הרעיון.',
      missing_points: question.key_points,
      confidence: 0.85,
    }
  }

  const lower = trimmed.toLowerCase()
  const hits = question.key_points.filter((kp) => lower.includes(kp.toLowerCase()))
  const missing = question.key_points.filter((kp) => !lower.includes(kp.toLowerCase()))
  const ratio = hits.length / Math.max(1, question.key_points.length)

  if (ratio >= 0.7) {
    return {
      verdict: 'full',
      reasoning: `התשובה מכסה את עיקרי הנושא (${hits.length}/${question.key_points.length} נקודות מפתח).`,
      missing_points: missing,
      confidence: 0.6, // intentionally not high — heuristic, not real AI
    }
  }
  if (ratio >= 0.3) {
    return {
      verdict: 'partial',
      reasoning: `נראה שכיסית חלק מהנקודות (${hits.length}/${question.key_points.length}). הוסף את הנקודות החסרות.`,
      missing_points: missing,
      confidence: 0.55,
    }
  }
  // Low confidence — better to say "uncertain" than wrongly mark insufficient.
  return {
    verdict: 'uncertain',
    reasoning: 'הערכה אוטומטית לא בטוחה. מומלץ לבדוק עם המרצה או עם תשובה לדוגמה.',
    missing_points: question.key_points,
    confidence: 0.3,
  }
}
