/**
 * TEEPO speech-bubble quotes.
 *
 * Mostly real famous quotes given a wry student-life twist, plus a few
 * full original lines. Picked at random and rotated by the dashboard
 * companion. Hebrew throughout to match the rest of the UI.
 */

export interface TeepoQuote {
  text: string
  author: string
}

export const TEEPO_QUOTES: readonly TeepoQuote[] = [
  // Classic philosophy
  { text: 'אני יודע שאני לא יודע כלום.', author: 'סוקרטס' },
  { text: 'אני חושב, משמע שלא הספקתי שיעורי בית.', author: 'דקארט (לפי TEEPO)' },
  { text: 'הזמן זה כסף. לסטודנטים אין שניהם.', author: 'בן פרנקלין (לפי TEEPO)' },
  { text: 'להיות, או לא להיות נוכח בהרצאה — זאת השאלה.', author: 'שייקספיר (לפי TEEPO)' },

  // Einstein-flavored
  { text: 'אם אתה לא יכול להסביר את זה לילד, אתה לא באמת מבין.', author: 'איינשטיין' },
  { text: 'הדמיון חשוב יותר מידע. אבל לא במבחן רב-בררה.', author: 'איינשטיין (לפי TEEPO)' },

  // Churchill / motivational
  { text: 'הצלחה זה ללכת מכישלון לכישלון בלי לאבד התלהבות.', author: 'צ׳רצ׳יל' },
  { text: 'אל תוותר אף פעם — אל תוותר אף פעם — אל תוותר אף פעם.', author: 'צ׳רצ׳יל' },
  { text: 'תוכניות הן כלום. תכנון הוא הכל.', author: 'אייזנהאואר' },

  // Hebrew classics
  { text: 'אם לא עכשיו, אימתי?', author: 'הלל הזקן' },
  { text: 'איזהו חכם? הלומד מכל אדם.', author: 'בן זומא' },
  { text: 'סוף מעשה במחשבה תחילה.', author: 'שלמה אלקבץ' },

  // Wisdom & quirky
  { text: 'החינוך הוא הנשק העוצמתי ביותר שאפשר לשנות איתו את העולם.', author: 'נלסון מנדלה' },
  { text: 'אל תספור את הימים. תעשה שהימים יספרו.', author: 'מוחמד עלי' },
  { text: 'הסוד של הצלחה הוא להתחיל.', author: 'מארק טוויין' },
  { text: 'הדרך הטובה ביותר לחזות את העתיד היא להמציא אותו.', author: 'אלן קיי' },
  { text: 'תהיה אתה. כל השאר כבר תפוס.', author: 'אוסקר ויילד' },

  // Lennon-flavored
  { text: 'החיים הם מה שקורה כשאתה עסוק בהכנה למבחן.', author: 'ג׳ון לנון (לפי TEEPO)' },

  // Pure TEEPO originals — short and wry
  { text: 'דחיינות זה כמו ריבית: בסוף משלמים יותר.', author: 'TEEPO' },
  { text: 'אין כזה דבר רגע אחרון. רק רגעים שלמדת להעריך.', author: 'TEEPO' },
  { text: 'ספר טוב + כוס קפה = פיצוץ סינפסות.', author: 'TEEPO' },
  { text: 'מבחן הוא רק סתם שיחה. עם דף.', author: 'TEEPO' },
  { text: 'עדיף שעת תרגול היום, משלוש שעות פאניקה מחר.', author: 'TEEPO' },
  { text: 'גם הגאונים מתחילים מ-Hello, World.', author: 'TEEPO' },

  // Light + funny
  { text: 'אני לא עצלן, אני שומר אנרגיה לקריירה.', author: 'אנונימי' },
  { text: 'מי שלא מתעייף — לא מתקדם, ולא ישן.', author: 'אנונימי' },
  { text: 'מי שאין לו מטרה, מגיע אליה בקלות.', author: 'אנונימי' },
] as const

/** Pick a random quote, optionally avoiding `previousIndex` so the same
 *  line doesn't repeat back-to-back. */
export function pickQuote(previousIndex: number | null = null): {
  index: number
  quote: TeepoQuote
} {
  if (TEEPO_QUOTES.length === 0) {
    return { index: -1, quote: { text: '', author: '' } }
  }
  if (TEEPO_QUOTES.length === 1) {
    return { index: 0, quote: TEEPO_QUOTES[0] }
  }
  let index = Math.floor(Math.random() * TEEPO_QUOTES.length)
  if (previousIndex !== null && index === previousIndex) {
    index = (index + 1) % TEEPO_QUOTES.length
  }
  return { index, quote: TEEPO_QUOTES[index] }
}
