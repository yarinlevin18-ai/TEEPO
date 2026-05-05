# TASKS — דרך מהמצב הנוכחי ל-v2.1

הקובץ הזה הוא מקור האמת היחיד למה כל אחד מאיתנו עושה. כל שינוי אליו עובר ב-PR. לפני שמתחילים משימה — מסתכלים פה. אחרי שגומרים — PR קטן שמסמן ✅.

> **עדכון 2026-05-05:** כל 20 משימות v2.1 הליבה הושלמו. נשארה רק סקירה ויזואלית (#21).
> Tzvi לא זמין כרגע — Yarin מתקדם סולו. ראה סעיף "מצב צוות" למטה.

## איך עובדים עם הקובץ

- כל שורה בטבלה = משימה אחת = branch אחד = PR אחד.
- הלייין הקבוע (Tzvi=backend / Yarin=frontend) מוקפא כל עוד Tzvi לא זמין — Yarin עובד על כל הלייינים בינתיים.
- כשמתחילים משימה: PR קטן שמשנה סטטוס ל"בעבודה" + מספר ה-PR (`#42`).
- כשגומרים: PR קטן שמשנה ל-✅.
- משימות ★ חוסמות אחרות. עושים אותן ראשון.

## הזרימה (5 פקודות, בעל פה)

```bash
git checkout master && git pull         # 1. הבא את האחרון
git checkout -b <prefix>/<short-name>   # 2. branch למשימה (prefix: feature/fix/chore/refactor)
# ...עובדים, commits...                 # 3. שומרים
git push -u origin <branch>             # 4. מעלים ל-GitHub
gh pr create --draft                    # 5. PR — מאשר ומוזג בעצמך כל עוד Tzvi לא חוזר
```

אחרי merge: `git checkout master && git pull` וחוזרים לשלב 1.

## חוקי תיאום

1. **לייין אישי** (כשהצוות מלא) — Tzvi: `backend/`, `chrome-extension/`, GitHub Actions, SQL migrations. Yarin: `app/`, `components/`, `lib/`, `public/catalog*.json`.
2. **קבצים משותפים** (★) — `types/index.ts`, `lib/drive-db.ts`, `lib/api-client.ts`. הוסף שדה / שינה חוזה? תעד היטב ב-PR.
3. **אסור push ישיר ל-master.** הכל דרך PR.
4. **Branch protection** — כרגע 0 אישורים נדרשים (כי Tzvi לא זמין לאשר). כשהוא חוזר — להחזיר ל-1.
5. **branch קצר חיים.** אם branch חי יותר משבוע — `git rebase master` או סגור.

## מצב צוות (2026-05-05)

| מצב | פעולה |
|-----|-------|
| Tzvi הוסר זמנית מ-collaborators | Yarin עובד סולו |
| Branch protection: 0 אישורים | Yarin ממזג בעצמו |
| Render = Hobby (ללא team members) | Yarin שולט ב-deploy |

כשTzvi חוזר:
1. הוסף אותו חזרה ב-Settings → Collaborators (Write)
2. החזר branch protection ל-1 אישור
3. החזר את הלייינים: Tzvi=backend, Yarin=frontend

## גישות (מצב נוכחי)

| שירות | Tzvi | Yarin |
|-------|------|-------|
| GitHub | ❌ (הוסר) | ✅ |
| Supabase | (תלוי בהזמנה) | ✅ |
| Render (backend deploy + logs + env) | ❌ — Hobby tier לא תומך ב-team members | ✅ |
| Vercel (frontend deploy) | לא נדרש | ✅ |

---

## רשימת המשימות (21 משימות) — 20 הושלמו ✅

### יסודות ★

| # | מי | משימה | קבצים | סטטוס |
|---|----|-------|-------|--------|
| 1★ | Yarin | עדכון types ל-v2.1 (Grade.source/component/updated_at, Course.lecturer_email/syllabus_url/teaching_assistants/course_links/portal_metadata, TeachingAssistant חדש, UserSettings.university/theme, העברת StudentProfile+StudentCourse) | `types/index.ts` | ✅ #19 |
| 2★ | Yarin | Drive DB v1→v2 migration + debounce 30 שניות | `lib/drive-db.ts` | ✅ #21 |
| 3★ | Tzvi | `migrate_003.sql` — שדות חדשים ל-courses + 'manual' ל-student_grades.source | `backend/migrate_003.sql` | ✅ #20 |

### Backend — 10 משימות

| # | משימה | קבצים | סטטוס |
|---|-------|-------|--------|
| 4 ⚠️ | Render keep-alive (`/health` ping כל 13 דק') — **חריג: Yarin** | `.github/workflows/render-keepalive.yml` | ✅ #44 |
| 5 | `POST /api/grades/manual` endpoint | `backend/routes/api.py` | ✅ #29 |
| 6 | קליטת lecturer_email/syllabus_url/TAs/links ב-Moodle scraper | `backend/services/moodle_scraper.py` | ✅ #30 |
| 7 | חיזוק Portal scraper (BGU) — discovery דינמי במקום URLs קשיחים | `backend/services/moodle_scraper.py` | ✅ #31 |
| 8 | TAU Moodle scraper (refactor university-agnostic + selectors) | `backend/services/moodle_scraper.py`, `backend/services/tau_selectors.py` | ✅ #35 |
| 9 | TAU Portal scraper | `backend/services/tau_portal_scraper.py` | ✅ #37 |
| 10 | נתוני TAU catalog | `backend/migrate_004.sql` | ✅ #36 |
| 11 | TAU academic advisor variant | `backend/agents/academic_agent.py` | ✅ #34 |
| 12 | "TEEPO מתעורר..." event ב-WebSocket אחרי cold start | `backend/routes/websocket.py` | ✅ #32 + frontend ב-#43 |
| 13 | Google Calendar read-only endpoint | `backend/services/google_calendar.py`, `backend/routes/api.py` | ✅ #33 |

### Frontend — 8 משימות

| # | משימה | קבצים | סטטוס |
|---|-------|-------|--------|
| 14 | בורר אוניברסיטה (BGU/TAU) ב-onboarding | `app/auth/page.tsx`, `components/onboarding/UniversitySelector.tsx`, `lib/auth-context.tsx` | ✅ #24 |
| 15 | תצוגת ברירת-מחדל למטלות = חודש (לא שבוע) | `app/(dashboard)/tasks/page.tsx` + dashboard widget | ✅ #22 |
| 16 | תצוגת שדות v2.1 בעמוד קורס (lecturer/syllabus/TAs/links) | `app/(dashboard)/courses/[id]/page.tsx` | ✅ #25 + wiring ב-#40 |
| 17 | תג מקור ציון (Moodle/Portal/Manual) + UI הזנה ידנית | `app/(dashboard)/credits/page.tsx`, course detail | ✅ #41 |
| 18 | Settings: שדה אוניברסיטה, theme toggle, takes_summer | `app/(dashboard)/settings/page.tsx` | ✅ #26 |
| 19 | הסרת BGU hardcoded מ-UI strings, שימוש ב-userSettings.university | `lib/university.ts`, `components/Sidebar.tsx` | ✅ #23 |
| 20 | טעינת catalog לפי אוניברסיטה (`catalog.bgu.json` / `catalog.tau.json`) | `lib/catalog.ts`, `public/catalog.{bgu,tau}.json` | ✅ #42 |
| 21 | סקירת mobile + dark mode (regression sweep) | visual sweep | 🟡 חלקי — light-mode טופל ב-#45; mobile sweep פתוח |

---

## משימות נוספות שהושלמו (מעבר ל-21 המקוריות)

| משימה | PR | תיאור |
|-------|-----|-------|
| הסרת מחברות AI | #28 | הוסר ה-feature הסטנד-אלון לפי בקשה |
| תיקון לולאת render אינסופית ב-useNotifications | #27 + #38 | באג שצף בעקבות #16 |
| Vitest + 5 בדיקות יסוד | #46 | תשתית בדיקות frontend |
| Playwright E2E scaffold | #47 | smoke tests + placeholders ל-auth flows |
| גיבוי ושחזור Drive DB | #48 | snapshots ב-`TEEPO/.backups/`, UI ב-/settings |

---

## מה עוד נשאר (Pre-launch)

לא חלק מ-21 המקוריות, אבל נדרש לפני השקה:

- [ ] **#21 — mobile sweep** (light-mode כבר נעשה ב-#45)
- [ ] **OAuth refresh-token** מנגנון רחב יותר — דורש backend (storage של refresh token ב-Supabase) → מחכה ל-Tzvi
- [ ] **בדיקות E2E ל-auth + course-import** — דורש credentials של חשבון Google ייעודי + BGU
- [ ] **Pytest backend setup + 5 בדיקות** — Tzvi's lane, מחכה לחזרתו
- [ ] **דומיין מותאם** ב-Vercel + Render
- [ ] **Supabase Pro / Render Starter** — שדרוג בתשלום לפני השקה
- [ ] **סקירה משפטית** של privacy policy + terms

## מצב נוכחי לעומת v2.1

**הליבה הושלמה.** כל v2.1 surface חי ב-master:
- ✅ Multi-university (BGU + TAU): scrapers, catalogs, advisor variants, picker
- ✅ Manual grade entry + source badges
- ✅ Drive DB v2 + 30s debounce + גיבויים
- ✅ Cold-start UX (banner + Render keep-alive)
- ✅ v2.1 course enrichment fields end-to-end
- ✅ Theme toggle (light/dark)
- ✅ Vitest + Playwright scaffolds

האפיון המלא של v2.1 נמצא ב-`docs/TEEPO_SPEC.md` (וגם `docs/TEEPO_SPEC.docx`).

## מה Claude עושה כשנכנסים לריפו

1. קורא את `CLAUDE.md` (חוקי workflow) ואת הקובץ הזה (משימות).
2. מזהה מי משתמש בו (אם לא ברור — שואל).
3. מסתכל ב"מה עוד נשאר" למעלה, מציע את המשימה הבאה לפי עדיפות.
4. אם Tzvi חזר — מחזיר את הלייינים ובודק מי עובד על מה לפני נגיעה בקוד.
5. אחרי שגומרים משימה: PR קטן שמסמן ✅ ברשימה.
