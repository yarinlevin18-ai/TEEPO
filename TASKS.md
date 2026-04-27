# TASKS — דרך מהמצב הנוכחי ל-v2.1

הקובץ הזה הוא מקור האמת היחיד למה כל אחד מאיתנו עושה. כל שינוי אליו עובר ב-PR. לפני שמתחילים משימה — מסתכלים פה. אחרי שגומרים — PR קטן שמסמן ✅.

## איך עובדים עם הקובץ

- כל שורה בטבלה = משימה אחת = branch אחד = PR אחד.
- הלייין קבוע: **Tzvi = backend, Yarin = frontend**. אם משימה חוצה לייינים — מסומנת ★ ודורשת תיאום.
- כשמתחילים משימה: PR קטן שמשנה סטטוס ל"בעבודה" + מספר ה-PR (`#42`).
- כשגומרים: PR קטן שמשנה ל-✅.
- משימות ★ חוסמות אחרות. עושים אותן ראשון.

## הזרימה (5 פקודות, בעל פה)

```bash
git checkout master && git pull         # 1. הבא את האחרון
git checkout -b <prefix>/<short-name>   # 2. branch למשימה (prefix: feature/fix/chore/refactor)
# ...עובדים, commits...                 # 3. שומרים
git push -u origin <branch>             # 4. מעלים ל-GitHub
gh pr create --draft                    # 5. PR — השותף מאשר → merge
```

אחרי merge: `git checkout master && git pull` וחוזרים לשלב 1.

## חוקי תיאום

1. **לייין אישי** — אתה עורך רק בתיקיות שלך. Tzvi: `backend/`, `chrome-extension/`, GitHub Actions, SQL migrations. Yarin: `app/`, `components/`, `lib/`, `public/catalog*.json`.
2. **קבצים משותפים** (★) — `types/index.ts`, `lib/drive-db.ts`, `lib/api-client.ts`. הוסף שדה / שינה חוזה? ספר לשותף לפני שאתה דוחף.
3. **אסור push ישיר ל-master.** הכל דרך PR + אישור של השותף.
4. **אסור למזג PR של עצמך.** השותף מאשר וממזג.
5. **branch קצר חיים.** אם branch חי יותר משבוע — `git rebase master` או סגור.

## גישות (מצב נוכחי)

| שירות | Tzvi | Yarin |
|-------|------|-------|
| GitHub | ✅ | ✅ |
| Supabase | ✅ | ✅ |
| Render (backend deploy + logs + env) | ❌ — צריך הזמנה | ✅ |
| Vercel (frontend deploy) | לא נדרש | ✅ |

עד ש-Tzvi מקבל גישה ל-Render: ירין מטפל ב-env vars / logs / deploy verification של ה-backend. Tzvi מפתח מקומית עם `python backend/app.py`.

---

## רשימת המשימות (21 משימות)

### יסודות ★ — חוסמות את השאר

| # | מי | משימה | קבצים | סטטוס |
|---|----|-------|-------|--------|
| 1★ | Yarin | עדכון types ל-v2.1: `Grade.source/component/updated_at`, `Course.lecturer_email/syllabus_url/teaching_assistants/course_links/portal_metadata`, חדש `TeachingAssistant`, `UserSettings.university/theme`, העברת `StudentProfile`+`StudentCourse` מ-`drive-db.ts` ל-types | `types/index.ts` | פתוח |
| 2★ | Yarin | Drive DB v1→v2 migration + debounce 30 שניות | `lib/drive-db.ts` | פתוח |
| 3★ | Tzvi | `migrate_003.sql`: שדות חדשים ל-`courses` + `'manual'` ל-`student_grades.source` | `backend/migrate_003.sql` | פתוח |

### Backend (Tzvi) — 10 משימות

| # | משימה | קבצים | תלוי ב | סטטוס |
|---|-------|-------|--------|--------|
| 4 | Render keep-alive (`/health` ping כל 13 דק') | `.github/workflows/render-keepalive.yml`, `backend/routes/health.py` | גישה ל-Render | חסום |
| 5 | `POST /api/grades/manual` endpoint | `backend/routes/api.py` | 3 | פתוח |
| 6 | קליטת `lecturer_email`/`syllabus_url`/TAs/links ב-Moodle scraper | `backend/services/moodle_scraper.py` | 3 | פתוח |
| 7 | חיזוק Portal scraper (BGU) — discovery דינמי במקום URLs קשיחים | `backend/services/moodle_scraper.py` | — | פתוח |
| 8 | TAU Moodle scraper (refactor university-agnostic + selectors חדשים) | `backend/services/moodle_scraper.py`, `backend/services/tau_selectors.py` | — | פתוח |
| 9 | TAU Portal scraper (חדש לגמרי) | `backend/services/tau_portal_scraper.py` | — | פתוח |
| 10 | נתוני TAU catalog (mandatory/electives/tracks/credits) | `backend/migrate_004.sql` | — | פתוח |
| 11 | TAU academic advisor variant (refactor knowledge base מהקוד) | `backend/agents/academic_agent.py` | — | פתוח |
| 12 | "TEEPO מתעורר..." event ב-WebSocket אחרי cold start | `backend/routes/websocket.py` | — | פתוח |
| 13 | Google Calendar read-only endpoint | `backend/services/google_calendar.py`, `backend/routes/api.py` | — | פתוח |

### Frontend (Yarin) — 8 משימות

| # | משימה | קבצים | תלוי ב | סטטוס |
|---|-------|-------|--------|--------|
| 14 | בורר אוניברסיטה (BGU/TAU) ב-onboarding | `app/auth/page.tsx`, `components/onboarding/UniversitySelector.tsx`, `lib/auth-context.tsx` | 1 | פתוח |
| 15 | תצוגת ברירת-מחדל למטלות = חודש (לא שבוע) | `app/(dashboard)/tasks/page.tsx` + dashboard widget | — | פתוח |
| 16 | תצוגת שדות v2.1 בעמוד סרוס (lecturer email/syllabus/TAs/links) | `app/(dashboard)/courses/[id]/page.tsx`, `components/course/*` | 1 | פתוח |
| 17 | תג מקור ציון (Moodle/Portal/Manual) + UI הזנה ידנית | `app/(dashboard)/credits/page.tsx`, course detail | 1+5 | פתוח |
| 18 | Settings: שדה אוניברסיטה, theme toggle, takes_summer | `app/(dashboard)/settings/page.tsx` | 1 | פתוח |
| 19 | הסרת BGU hardcoded מ-UI strings, שימוש ב-`userSettings.university` | `lib/university.ts`, `components/Sidebar.tsx`, landing page | 1 | פתוח |
| 20 | טעינת catalog לפי אוניברסיטה (`catalog.bgu.json` / `catalog.tau.json`) | `lib/catalog.ts`, `public/catalog.bgu.json`, `public/catalog.tau.json` | 10 | פתוח |
| 21 | סקירת mobile + dark mode (regression sweep אחרי v2.1 fields) | (visual sweep, אין קבצים ספציפיים) | רוב המשימות הקודמות | פתוח (אחרון) |

---

## מצב נוכחי לעומת v2.1

לפי audit שעשינו לקוד:
- **Frontend ~95% מוכן.** רוב הר'ציפים בנויים. החסרים: שדות v2.1 בקבצי תצוגה, בורר אוניברסיטה ב-onboarding, תג מקור ציון, היפטרות מ-BGU hardcoded.
- **Backend ~70% מוכן.** 54+ endpoints, 8 AI agents, Moodle scraper מלא ל-BGU, Whisper/Recorder pipeline. החסרים: Portal scrapers (BGU חלקי, TAU בכלל לא), manual grade entry, keep-alive ל-Render, קליטת lecturer/TA/links, תמיכת TAU מלאה, cold-start UX, Calendar endpoint.

האפיון המלא של v2.1 נמצא ב-`docs/TEEPO_SPEC.md` (וגם `docs/TEEPO_SPEC.docx`).

## מה Claude עושה כשנכנסים לריפו

1. קורא את `CLAUDE.md` (חוקי workflow) ואת הקובץ הזה (משימות).
2. מזהה מי משתמש בו (אם לא ברור — שואל את המשתמש).
3. מסתכל ברשימה למעלה, מציע את המשימה הפתוחה הבאה לפי העדיפות (יסודות ★ ראשונות, אחרי זה לפי סדר).
4. לפני עריכת קובץ — בודק שהוא בלייין של המשתמש. לא? עוצר ומציע משימה משותפת ★ במקום.
5. אחרי שגומרים משימה: PR קטן שמסמן ✅ ברשימה.
