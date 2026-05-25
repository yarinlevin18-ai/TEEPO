# הפסקה — סיכום ומה לעשות בפעם הבאה

## מה הושג בסבב הזה (12 במאי)

### שלוש פיצ'רים גדולים שמוזגו ל-master ופרוסים ב-Production

1. **PR #58** — `feat: v2 locked design + Drive sync` (28 commits)
   - עיצוב חדש מלא: cream + leaf-green, paper grain + drifting washes
   - ספר-לוגו חדש (SVG locked) + TopNav v2
   - Dashboard נכתב מחדש: LCD שעון + Country Clock + Sliding Puzzle + 3 קלפים
   - 2 דפים חדשים: `/todos` (4-bucket urgency), `/summaries` (עץ תארים + Drive panel)
   - תוסף Chrome v2 (manifest v3, OAuth, Moodle/portal scrapers, generic scanner)
   - 2 endpoints חדשים: `/api/drive/folder-for-course`, `/api/drive/courses`
   - נמחקו: Teepo mascot, SkyScene, Sidebar הישן, LivingDayProvider, teepo.css

2. **PR #59** — `chore(dashboard): drop mockup placeholders`
   - 3 הקלפים בdashboard מציגים empty states אמיתיים במקום קורסים פיקטיביים
   - Calendar week ריק (היה עם 12 שיעורים פיקטיביים)

3. **PR #60** — `feat(drive): auto-provision course folders`
   - יצירת קורס → תיקיות Drive נוצרות אוטומטית (בלי קליק "Sync Drive")
   - `/summaries` → כל קורס חסר תיקיות מקבל אותן ב-useEffect

### URLs
- **Production:** https://bgu-study-organizer.vercel.app
- **PR #58 preview (deprecated):** https://teepo-git-feature-drive-sync-yarinlevin18-6288s-projects.vercel.app

---

## איפה נעצרנו

### ✅ מה שעובד
- העיצוב החדש פרוס ב-Production
- התוסף Chrome מותקן + טעון ב-Chrome (Extension ID: `egfadghpmlpjcjlkejphcmhmfgafabja`)
- OAuth client_id מסוג Chrome Extension הוגדר ב-Google Cloud project `lifeos-494812`
- ה-client_id חי ב-`chrome-extension/manifest.json`: `157877045941-lnm2cna90npvefkmcmem9up5ml516d8d.apps.googleusercontent.com`
- ההתחברות עם Google בתוסף עוברת (✅ סיימנו את שלב ה-anon→authed)
- Google Drive API מופעל בפרויקט (אישרנו אחרי שגיאת 403 עזבה)

### ❌ מה שלא עובד
- **18 קבצים נכשלו בהעלאה** דרך התוסף
- שגיאה אחרונה ב-server logs: `drive_404: TEEPO root folder missing`
- כלומר: אין `TEEPO/` ב-Drive של היוזר עדיין
- **היוזר לא הצליח להוסיף קורס** ב-`/courses` (לא ברור מה ה-UI מציג — צריך לבדוק)

### תאוריית עבודה
המסלול הצפוי לעבוד הוא:
```
1. יוזר פותח את האתר → DBProvider רץ
2. DBProvider קורא ל-getOrCreateTEEPOFolder() → יוצר TEEPO/ ו-TEEPO/db.json
3. יוזר יוצר קורס → createCourse() קורא ל-ensureCourseFolders() (אוטומטית מ-PR #60)
4. תיקיות הקורס נוצרות: TEEPO/.../<course>/{שיעורים,מטלות,סיכומים}
5. תוסף מעלה קבצים → נחיתים בתיקיות הנכונות
```

**איפה זה נשבר אצל היוזר:** שלב 1 או 2 — או שה-DBProvider לא רץ עד הסוף, או שיש שגיאה אחרת ב-Drive. צריך לבדוק את ה-console של הדפדפן ב-Production כשהוא פותח אותו.

---

## מה לעשות ראשון בפעם הבאה (סדר עדיפויות)

### 1. דיאגנוסטיקה — ~10 דקות
היוזר יפתח `https://bgu-study-organizer.vercel.app` ב-Chrome עם DevTools פתוח (F12 → Console). אנחנו רוצים לראות:
- האם יש שגיאת JS כשהדף עולה?
- מה ה-Drive token שמקבלים? (`localStorage` בTab → key `smartdesk_google_token`)
- האם DBProvider מצליח לעלות? (יהיה הודעת console.info מ-drive-db.ts)
- האם `getOrCreateTEEPOFolder` מצליח? (יקרא ל-Drive API; ב-Network tab נראה)

תוצאות אפשריות + תיקון:
- **אם DBProvider crashes** → לבדוק stack trace, מתקנים את המקור
- **אם TEEPO folder נוצר אבל הקורסים לא** → /courses UI שבור, צריך לחקור
- **אם הטוקן חסר drive.file scope** → היוזר צריך לצאת ולהתחבר מחדש כדי לקבל scope עדכני

### 2. בעיית "לא ניתן להוסיף קורס" — ~15 דקות
היוזר אמר "אין לי איך להוסיף קורס". זה אומר אחד מאלה:
- ה-`/courses` page לא מציג כפתור "הוסף קורס" — UI bug
- הכפתור קיים אבל לא עובד — error handler
- הuser נכנס לדף שגוי

לבדוק:
- האם UI של `/courses` באמת חי? תרענן ותסתכל
- האם יש "+ קורס חדש" או דומה?
- אולי הצריך להיכנס דרך `/courses/extract` במקום?

### 3. אם הדיאגנוסטיקה מראה שצריך לתקן UI של הוספת קורס
- לכתוב empty state מפורש ב-`/courses` עם CTA "+ קורס חדש" שפותח modal
- לוודא שהפעולה createCourse לא נכשלת בשקט

### 4. End-to-end test של התוסף
אחרי שיש קורס + תיקיות:
1. תרענן את הdev console של התוסף
2. תפתח דף Moodle עם 18 הקבצים
3. תלחץ אייקון TEEPO → תבחר את הקורס → "שלח ל-TEEPO"
4. אמורות לראות 18/18 הועלו
5. תיכנס ל-`/summaries` → תפתח את הקורס → תראה את 18 הקבצים

---

## מצב הקבצים החשובים

| קובץ | מטרה |
|------|------|
| `chrome-extension/manifest.json` | OAuth client_id אמיתי, host_permissions כולל `*.vercel.app` |
| `chrome-extension/README.md` | הוראות התקנה מלאות |
| `app/api/drive/folder-for-course/route.ts` | endpoint שהתוסף קורא לקבל folderId לפי courseId |
| `app/api/drive/courses/route.ts` | endpoint שהתוסף קורא לקבל רשימת קורסים לpicker |
| `lib/drive-files.ts` | פעולות Drive client-side (list/upload/trash) |
| `lib/use-drive-files.ts` | hook polling 30s עם optimistic updates |
| `components/summaries/CourseDrivePanel.tsx` | פאנל הDrive בעמוד "המוח" |
| `lib/db-context.tsx:216` | createCourse עם auto-provision |
| `app/(dashboard)/summaries/page.tsx:78-92` | useEffect auto-heal |

---

## עץ הענפים

```
master (HEAD: 5075315)  ←  פרוס ב-Production
├─ #58 v2 design + Drive sync
├─ #59 mock data removed
└─ #60 auto-provision

ענפים ישנים שעדיין ב-remote (אפשר למחוק):
- feature/drive-sync (נמזג ב-#58)
- feature/locked-design-v2 (נמזג כחלק מ-#58)
- feature/locked-landing-design
- chore/remove-dashboard-mock-data (נמזג ב-#59, נמחק)
- feat/auto-provision-drive-folders (נמזג ב-#60, נמחק)
- claude/hungry-shockley-c06655 (ה-worktree branch הנוכחי, מעודכן ל-master)
```

---

## דברים שצריך לזכור

- ה-OAuth client_id ב-`manifest.json` הוא **חי ופומבי** — לא סוד. בסדר שזה ב-git.
- `drive.file` scope = ה-extension/web-app רואים רק קבצים שהם יצרו. שני האפליקציות (web + extension) חייבות OAuth client **מאותו פרויקט** ב-Google Cloud — אחרת הם רואים סטים נפרדים של קבצים. ✅ אצלנו זה כך.
- Production deployment auto = כל merge ל-master יוצר deploy תוך ~2 דק
- Render backend (`backend/`) הוא נפרד — לא נגעתי בו בסבב הזה

---

## דברים שדחיתי / לא עשיתי

- **Refit ויזואלי של `/assignments`, `/courses/[id]`, `/credits`, `/settings`, `/study-buddy`** — עדיין משתמשים ב-`<GlowCard />` ובסטיילינג הישן (tailwind/indigo). חוסם המחיקה של GlowCard. עבודה של ~5-8 שעות.
- **Drive watch (push) במקום polling 30s** — שיפור ביצועים
- **Resumable uploads** עבור קבצים >100MB
- **Smarter "lessons vs assignments" classifier** בתוסף

---

## נכבה. מצב מערכת

- ✅ `master` עדכני: `5075315`
- ✅ Production deploy מסונכרן
- ✅ Dev server נכבה
- ✅ Worktree על master (לא היה צורך לשמור שינויים מקומיים)
- ❌ לא נדחפו ל-Render שינויי backend (לא היו)

נתראה בפעם הבאה.
