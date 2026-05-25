# Course Page Redesign — Handoff to Claude Code

## Goal
Replace the current course-page UI in this project with a new design. The mockup at `course-page-mockup.html` (in this same folder) is the **visual template** — match its layout, hierarchy, colors, typography, spacing, and interaction behavior.

## Important rules
1. **The mockup is a template, not data.** Ignore every piece of placeholder content in the mockup — the course name "מבוא לגישות ושיטות...", lesson dates, the 2026-05-17 summary file, the "12 lessons" count, the dummy tasks, etc. None of that should appear in the real code. All content must come from the existing data layer / props / API the project already uses.
2. **Delete the old course-page design completely.** Don't keep the old layout side-by-side, don't leave old CSS/components around, don't ship dead code. Search the codebase for the previous course-page implementation and remove it cleanly before adding the new one.
3. **Match the existing stack.** Detect what this project uses (framework, styling system, state management) by reading the code first, then implement the new design in that stack — same conventions, same component patterns, same file structure as the rest of the project. Do not introduce new libraries unless absolutely required.
4. **Keep RTL Hebrew.** The page is right-to-left Hebrew. Preserve `dir="rtl"`, `lang="he"`, and all Hebrew strings (labels, button text, section names) as they appear in the mockup.

## What the page must contain

### Header (top card)
- Course title (large, bold, deep forest green `#1a4d30`, 30px-ish, letter-spacing tight)
- Right-side green accent bar
- Two action buttons on the left: "סנכרון מ-Moodle" (secondary) and "הוסף תוכן" (primary green)
- **No meta row** under the title (no semester / day / lecturer / location line)

### Breadcrumb
Above the header, right-aligned: `הבית › סמסטר ב' › [course name]`

### Quick-task add bar (full width, below header)
- Title "הוסף משימה במהירות" with ✨ icon, deep green, 17px
- Text input with green "+" button
- 5 chips below: שיעורי בית, קריאה, פרזנטציה, חזרה למבחן, פרויקט
- Clicking a chip fills the input with that label

### Main grid (1fr main + 280px sidebar)

#### Main card — "תיק הקורס"
- Title "תיק הקורס" with 📂 icon in a 34px rounded green-soft badge, 22px deep green, bold
- Two tabs: **שיעורים** (active by default) and **מטלות**
- Tab counters in green-soft pill when active, gray pill when inactive

##### שיעורים tab (lessons table)
- A **uniform table** of lesson rows — every row is identical.
- Row layout (grid columns): `chevron · number-badge · title · date · indicator-dot`
- Row height ~28px, padding 4px 14px, font 12.5px
- Number badge: small rounded rectangle, gray border, gray text (no green for "has content" — keep all rows visually equal)
- Title: just "שיעור N" — do NOT include the course name in any row
- Date: small, right-aligned, tabular-numerals
- Indicator dot (6px): green if the lesson has a summary, blue if it has materials, half/half if both, transparent if empty
- Clicking a row toggles open → reveals the lesson "folder" with two sections:
  - **סיכומים** — file rows + "+ העלה סיכום" upload slot
  - **חומרי לימוד** — file rows + "+ העלה הרצאה / מצגת / קריאה" upload slot
- Each section label is green, bold, 12.5px, with a small bullet dot prefix
- File rows: small colored icon (green for summary, blue for material) + filename + size + open/delete actions on hover
- Above the table: action buttons "+ הוסף שיעור" and "⬇ העלאת קובץ"

##### מטלות tab
- List of tasks with checkbox, title, meta line, and due-date pill on the left
- Due-date pill is accent-orange normally, red-pink if urgent (≤3 days)
- Below the list: buttons "+ הוסף מטלה" and "⬇ צרף קובץ למטלה"

#### Sidebar (3 cards stacked)

1. **השיעור הבא** (📅 icon)
   - Large green number badge (38px square, white text on green) showing the day-of-month
   - "בעוד N ימים" + day + time
   - Bottom line: "שיעור N · DD.M.YYYY"

2. **פרטי הקורס** (📋 icon)
   - Info rows: מרצה, מקום, מס' קורס, סילבוס
   - Each row is `key — value`, dashed bottom border
   - Empty values render as italic muted "לא משויך" / "לא הוגדר" / "—"
   - Syllabus row, if missing, shows a green "+ העלה" link instead

3. **קישורים מהירים** (🔗 icon)
   - Two link rows with small colored letter badges: M (blue) Moodle, D (yellow) Drive

## Color tokens
Use these exact values (preserve as design tokens / CSS variables):

```
--bg:         #f4efe4
--surface:    #fbf7ed
--surface-2: #ffffff
--border:     #e6dec9
--border-soft:#efe8d4
--text:       #2a2a26
--muted:      #7a7361
--muted-2:    #a39a82
--green:        #2e7d4f
--green-hover:  #256640
--green-soft:   #e3f1e6
--green-deep:   #1a4d30   /* for headings */
--accent:       #c2783a
--accent-soft:  #f7e7d4
--blue:         #3470b3
--blue-soft:    #e7eef8
--yellow:       #b58a14
--yellow-soft:  #fff4d6
```

## Typography
- Font family: **Heebo** (Google Fonts), weights 300/400/500/600/700/800
- Base size: 14px, line-height ~1.45
- Headings use the deep green `#1a4d30`, bold/800, tight letter-spacing
- Card heads have icons in rounded green-soft badges (28–34px squares)

## Interaction
- Lesson rows: click anywhere on the header row to toggle the body
- Chips: clicking inserts `"<label>: "` into the quick-add input and focuses it
- Tabs: standard tab switching, only the active panel is visible
- All hover states are subtle background tints (`rgba(255,255,255,.55)` over cream)

## What NOT to do
- Don't add a "next lesson countdown" hero card to the main column — that info lives only in the sidebar mini-card
- Don't add the old 4-stat strip (summaries / days / open tasks / files counters)
- Don't show three separate cards for lessons/tasks/summaries — they're unified into one tabbed "תיק הקורס" card
- Don't add a subtitle under "תיק הקורס" (no "קבצים בעלי שם Week N..." explainer)
- Don't render summaries as a top-level list — summaries live inside their parent lesson's expanded folder
- Don't visually distinguish "has content" lessons by changing the number-badge color — keep all rows identical

## Reference
The full visual reference is in `course-page-mockup.html` in this same folder. Open it in a browser and use it as the source of truth for layout, spacing, and color decisions. Match it pixel-close but adapted to the existing project's component conventions.

## Acceptance
- [ ] Old course-page design and CSS are removed from the codebase
- [ ] New course page matches the mockup visually
- [ ] All placeholder data from the mockup is replaced by real props/data from the project
- [ ] RTL Hebrew is preserved, no LTR leakage
- [ ] Lesson accordion expand/collapse works
- [ ] Tab switching works
- [ ] Chip → input fill works
- [ ] No dead files, no commented-out old code left behind
