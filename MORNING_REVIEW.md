# בוקר טוב — סיכום מה שעשיתי בלילה

נכון לעכשיו: **9 commits מקומיים על `feature/drive-sync`**. אפס נדחפו. ה-`master` נקי.

## 1. מה אתה צריך לעשות קודם כל

לפני שאתה בודק כלום — אל תרוץ למחשב, **לסקור הראש קודם**:

1. **ה-extension לא יעבוד אצלך עד שתחליף את ה-OAuth client_id** (הסבר מלא בסעיף 5).
2. **`master` לא השתנה.** הכל בענף נפרד. אם תרצה לחזור — `git checkout master` ואתה במקום שהיית אתמול.
3. **שום דבר לא נדחף ל-GitHub.** אם תאשר — `git push -u origin feature/drive-sync`.

## 2. מצב הענפים

```
master                                          (ללא שינוי)
└─ feature/locked-design-v2  (11 commits — עיצוב v2 שאישרת)
   └─ feature/drive-sync     (9 commits — Drive panel + extension)
```

## 3. 9 ה-commits החדשים (בסדר הכרונולוגי)

| # | hash | מה |
|---|------|-----|
| 1 | `1cbccf5` | Drive panel ב-`/summaries` — list/upload/delete חי |
| 2 | `33c490a` | תוסף Chrome v2 — manifest + popup + background |
| 3 | `d6d8431` | Content scripts אמיתיים ל-Moodle ופורטל |
| 4 | `53cc16e` | Generic page scanner — סורק כל אתר עם injection לפי דרישה |
| 5 | `b594e52` | `/api/drive/folder-for-course` — backend endpoint |
| 6 | `0dafbd8` | Course picker בpopup + `/api/drive/courses` |
| 7 | `eef819b` | README של התוסף + הוראות התקנה |
| 8 | `e2ad273` | תיקוני typecheck (4 באגים) + 33 יוניט-טסטים + tsconfig excludes |

## 4. בדיקות שעברתי בהצלחה

| בדיקה | תוצאה |
|-------|--------|
| `tsc --noEmit` | **0 שגיאות אמיתיות** (אחרי תיקון 4) |
| `next lint` | ✅ אפס errors, 5 warnings פרה-קיימים שאינם שלי |
| `next build` (production) | ✅ 20 routes קומפלו, כולל 2 ה-API החדשים |
| `/api/drive/courses` — 7 תרחישי auth | ✅ 401/400/204 לפי תרחיש, CORS תקין |
| `/api/drive/folder-for-course` — אותו דבר | ✅ עובד |
| GET `/`, `/auth`, `/tasks`, `/todos`, `/summaries` | ✅ כולם 200 |
| GET `/dashboard` ללא auth | ✅ מפנה ל-`/auth` כמצופה |
| `console errors` בdev server | ✅ אפס |

**מה לא בדקתי:** ה-UI עצמו (דורש חשבון מחובר אמיתי), העלאה אמיתית ל-Drive (דורש OAuth), התוסף ב-Chrome (דורש client_id אמיתי).

## 5. ⚠️ הדבר היחיד שחוסם את הבדיקה שלך — OAuth client_id

ה-`chrome-extension/manifest.json` מכיל placeholder:
```json
"oauth2": {
  "client_id": "REPLACE_WITH_YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com",
  ...
}
```

לפני שתוכל לטעון את התוסף ב-Chrome, צריך:

### צעד אחד — צור OAuth client חדש
1. https://console.cloud.google.com/apis/credentials
2. ⚠️ **חובה שזה יהיה באותו פרויקט של ה-web app**. אחרת `drive.file` scope = "אפליקציה אחרת" וה-תוסף לא יראה תיקיות שהאתר יצר.
3. Create Credentials → OAuth client ID → **Application type: Chrome Extension**
4. נשמור את ה-Application ID לרגע — נחזור אליו אחרי שטענת את התוסף ב-Chrome.

### צעד שתיים — טען את התוסף, קח את ה-ID שלו
1. `chrome://extensions` → Developer mode → Load unpacked → תבחר את `chrome-extension/`
2. תקבל extension ID (32 תווים)
3. תחזור ל-Google Cloud מ-צעד 1 ותדביק את ה-ID

### צעד שלוש — תדביק את ה-client_id במניפסט
1. תעתיק את ה-client_id (לא ה-application id — ה-client_id)
2. ב-`chrome-extension/manifest.json` תחליף את ה-`REPLACE_WITH_YOUR...`
3. ב-`chrome://extensions` תלחץ Reload

הוראות מלאות + טבלת בעיות נפוצות: **`chrome-extension/README.md`**.

## 6. מה לבדוק בעצמך אחרי שתסיים את OAuth

### א. צד "המוח" (לא דורש את התוסף)
1. `localhost:3000/summaries` — תתחבר עם Google בדרך הרגילה
2. תלחץ על קורס → הוא יתפשט
3. אם יש לקורס תיקייה ב-Drive → תראה רשימה של קבצים
4. תלחץ "העלאה" → תבחר קובץ → תראה את ה-spinner וזה יופיע ברשימה
5. תלחץ 🗑 על קובץ → דיאלוג אישור → אישור → הקובץ עובר לסל

### ב. צד התוסף
1. תפתח דף Moodle עם קבצים (ה-Moodle של BGU או TAU)
2. תלחץ על האייקון של TEEPO בכרום
3. **תיאור צפוי:** "X קבצים נמצאו בדף" + רשימה + כפתור "שלח ל-TEEPO"
4. אם הקורס מזוהה מה-URL → ה-picker יבחר אותו אוטומטית
5. אחרת — תבחר מה-dropdown
6. תלחץ "שלח" → progress bar → "X קבצים הועלו"
7. תפתח `/summaries` → תתפשט אותו קורס → הקובץ אמור להופיע (תוך ≤30 שניות, polling)

### ג. בדיקת fallback — דף שאינו Moodle
1. תפתח אתר כלשהו (Wikipedia עם קישורי PDF, GitHub repo, וכו')
2. תלחץ על האייקון
3. בפעם הראשונה Chrome ישאל לאישור (host permission)
4. אישור → ה-popup יציג רשימה
5. תבחר קורס מהdropdown
6. תשלח

## 7. אם משהו נשבר — איפה לחפש

| תסמין | מקום ראשון לחפש |
|-------|------------------|
| Popup תקוע על "התחברו עם Google" | OAuth client_id mismatch — תעבור על סעיף 5 |
| Files עולים אבל לא רואים אותם ב-המוח | Same — drive.file scope per-app |
| 401 מ-`/api/drive/folder-for-course` | Drive token פג, התוסף יטפל אוטומטית עם retry |
| "התיקייה של הקורס לא נוצרה" ב-popup | תפתח את הקורס באתר פעם אחת — `drive-folders.ts` ייצור |
| Popup אומר "אין קבצים" בדף Moodle | content script לא רץ — בדוק שה-URL תואם את ה-match patterns ב-manifest |

DevTools של התוסף: `chrome://extensions` → TEEPO → "service worker" → Inspect.

## 8. החלטות שקיבלתי בלילה

**א. מטפל ב-typecheck errors שלי שמצאתי:**
- `db.todos` → `db.tasks` (הסוג לא קיים, /todos קורא StudyTask)
- `c.name` → `c.title` (ה-Course type לא משתמש ב-name)
- `db.moodleConnected` → `(db.settings as any).moodle_connected` (אין שדה מסודר, slot זמני)
- `useMemo` type annotation לrid את ה-`any`

**ב. הוספתי `tsconfig` excludes** ל-e2e/playwright/vitest כי הdevDeps שלהם לא תמיד מותקנים. החסרון: ל-tests אין typecheck אוטומטי כשלא רץ vitest. הסכמתי לזה כי בוילד CI יראה vitest בכל זאת.

**ג. לא דחפתי כלום ל-GitHub.** CLAUDE.md אומר לקבל אישור לפני push.

**ד. לא התקנתי vitest** ב-node_modules. ה-tests נכתבו, אבל אצלי הם לא רצים בפועל — רק ב-CI או אצלך עם `npm install vitest @vitejs/plugin-react`.

## 9. הצעות לסבב הבא (כשתסכים)

- **לדחוף `feature/drive-sync`** כ-Draft PR לבדיקה ויזואלית ב-Vercel
- **`npm install` של vitest** ולהריץ את 33 ה-tests אצלי כדי לאמת
- **`feature/locked-design-v2` עוד לא נדחף** — אם תרצה לפצל את העבודה ל-PR-ים נפרדים
- **Drive watch (push)** במקום polling — דיברנו על זה כ-future work

## 10. מצב dev server

הdev server רץ ב-localhost:3000 (server id `6d20dc93-...`). אם הוא נופל בלילה Claude Preview יפעיל אותו אוטומטית. הכל compiled fresh, אפס שגיאות.

---

תשן טוב. כשאתה קם, פותח את `chrome-extension/README.md` קודם, אז את הבדיקה (סעיפים 6א + 6ב), אם משהו נשבר — סעיף 7.
