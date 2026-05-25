# TEEPO — Drive Sync (Chrome Extension)

Browser extension that scans Moodle / university portal pages (or any
page) for downloadable files and uploads them directly to your
Google Drive — into the same `TEEPO/{degree}/{year}/{semester}/{course}/`
folders the web app provisions.

Files **never touch the TEEPO backend.** The extension reads the file
from the page (or the source URL with your cookies attached), then
streams it from your browser to Drive over a single multipart upload.
TEEPO's role is just to translate "this course in my UI" → "this folder
ID in your Drive" via [`/api/drive/folder-for-course`](../app/api/drive/folder-for-course/route.ts).

---

## Architecture

```
                    +---------------------------+
                    |  Moodle / Portal / Generic|
                    |  page (Chrome tab)        |
                    +-----------+---------------+
                                |
                       content/*.js  (scrape)
                                |
                                v
+----------------+      +-----------------+        +--------------------+
|  popup.html    | <--->|  background.js  | -----> |  Google Drive API  |
|  (UI + picker) |      |  (OAuth + xfer) |        |  drive.file scope  |
+--------+-------+      +-----+-----+-----+        +--------------------+
         |                    |     |
         |                    |     |  (resolve courseId → folderId)
         |                    |     v
         |              +-----+-------------------+
         +------------> |  TEEPO Next.js webapp   |
                        |  /api/drive/folder-...  |
                        |  /api/drive/courses     |
                        +-------------------------+
```

---

## Extension ID is stable

The `"key"` field in `manifest.json` is the public half of an RSA-2048
keypair generated for this project. Chrome derives the extension ID
deterministically from that key, so **every install of this unpacked
extension gets the same ID**:

```
jdhpdacenamdkdjleojfjimaeggkokal
```

The private key (`teepo-extension-key.pem`) is **not in git** — it's only
needed to publish to the Chrome Web Store. If you ever need it, ask Yarin.

This means the Google Cloud OAuth client only has to be configured once
ever, and any new contributor's local install will work without re-jiggering
the OAuth Application ID.

## Install for development (3 min)

### 1. One-time: configure the Google OAuth client (already done)

The OAuth client for the extension is already created in Google Cloud
(project `lifeos-494812`, client ID `157877045941-lnm2cna90npvefkmcmem9up5ml516d8d`)
and its **Application ID** is set to `jdhpdacenamdkdjleojfjimaeggkokal`.
The same OAuth project hosts the TEEPO web app, so the `drive.file` scope
gives both halves access to the same Drive folder set.

If you ever rotate the keypair (and so the extension ID changes), update the
Application ID on the OAuth client at
[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).

### 2. Load the unpacked extension

1. Open **`chrome://extensions`**.
2. Toggle **Developer mode** (top-right).
3. **Load unpacked** → select the `chrome-extension/` directory.
4. The Extension ID should appear as `jdhpdacenamdkdjleojfjimaeggkokal`
   (if it doesn't, something is wrong with the `"key"` field in the
   manifest — check it wasn't truncated).

### 3. Point the extension at the right backend

By default the extension talks to `http://localhost:3000`. For any
other URL — Vercel preview, staging, prod — set `teepoBase` in
extension storage:

1. Open `chrome://extensions`
2. Find TEEPO → click the **service worker** "inspect" link
3. In the console paste:

```js
// Vercel preview (changes per PR):
chrome.storage.local.set({ teepoBase: 'https://teepo-git-feature-drive-sync-yarinlevin18-6288s-projects.vercel.app' })

// Or production once master is deployed:
chrome.storage.local.set({ teepoBase: 'https://teepo.app' })
```

The extension's `host_permissions` already covers `*.vercel.app/*` and
`teepo.app/*` so no extra approval prompt is needed.

### 4. Make sure the web app provisioned your folders

Before the extension can upload, your Drive needs the
`TEEPO/{...}/{course}/{lessons,assignments,notes}/` folders to exist.
That happens automatically the first time you open a course on the
TEEPO web app. If you see "⚠ ללא תיקייה" next to a course in the
popup picker, open it in the web app once.

---

## Using it

1. Open a Moodle course page (e.g. `https://moodle.bgu.ac.il/moodle/course/view.php?id=NNNN`).
2. Click the TEEPO icon in the toolbar. The popup shows every file the
   scraper found.
3. If the popup can't extract a course ID (portal or generic page),
   pick the right course from the dropdown.
4. Untick anything you don't want. Hit **שלח ל-TEEPO**.
5. Watch the progress bar. When it's done, click **פתח את המוח** to
   jump into the live Drive view on the web app.

For non-Moodle/portal pages, the popup will ask once for permission to
scan that origin. After that, it'll work without prompting on the same
domain.

---

## Privacy

- **drive.file scope only**: the extension can read/write only the files
  it (or the TEEPO web app) created. Other files in your Drive are
  invisible to it.
- **No backend file storage**: file bytes go browser → Drive directly.
  The Next.js API routes only return folder IDs and the course list.
- **Cookies**: the extension's optional `cookies` permission lets it
  re-fetch authenticated downloads (Moodle behind login). Granted only
  if you click "yes" on the Chrome prompt the first time it's needed.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Popup stuck on "התחברו עם Google" | OAuth client_id mismatch | Re-check step 1–2 above. The extension ID in the OAuth client must match `chrome://extensions`. |
| Files upload but don't show in המוח | OAuth client ≠ web-app's OAuth client | Same fix. Drive's `drive.file` scope is per-app. |
| 401 from /api/drive/folder-for-course | Drive token expired | Sign out + sign in from the popup. Background worker also auto-retries once. |
| "התיקייה של הקורס לא נוצרה" | Web app hasn't run `ensureCourseFolders` yet | Open the course on the TEEPO web app once. |
| Popup says "אין קבצים" on a Moodle page | URL not under `/moodle/*` | The content script only auto-injects on matching paths. Use "סרוק שוב" to fall back to the generic scanner. |

---

## Project layout

```
chrome-extension/
├── manifest.json            # MV3 — permissions, content scripts, OAuth
├── background.js            # Service worker — OAuth, Drive upload, folder resolve
├── popup.html / .css / .js  # 360px-wide cream UI with 6 states
├── content/
│   ├── moodle.js            # auto-injected: BGU + TAU Moodle scrapers
│   ├── portal.js            # auto-injected: BGU + TAU portal scrapers
│   └── generic.js           # on-demand: any other page
└── icons/                   # 16/48/128 PNGs from public/brand/
```
