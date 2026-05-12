/**
 * TEEPO popup controller.
 *
 * State machine (the `data-state` attribute on each <section>):
 *   anon       → no auth yet
 *   idle       → authed but the content script found nothing on this page
 *   ready      → content script found files; user selects + sends
 *   uploading  → we're streaming files to Drive via the background worker
 *   done       → upload finished
 *   error      → something blew up
 *
 * The background worker owns OAuth + Drive uploads + folder resolution.
 * The popup just orchestrates UI + delegates to bg via chrome.runtime.sendMessage.
 *
 * The content script (Moodle/portal/generic) is responsible for sniffing
 * the page DOM and replying with a list of {filename, sourceUrl, mimeType,
 * kind} candidates when we ping it.
 */

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => Array.from(document.querySelectorAll(sel))

function showState(name) {
  $$('.pop-state').forEach((el) => {
    el.hidden = el.dataset.state !== name
  })
  $('.pop-signout').hidden = name === 'anon' || name === 'error'
}

function setText(bind, value) {
  $$(`[data-bind="${bind}"]`).forEach((el) => { el.textContent = String(value) })
}

function setProgress(uploaded, total) {
  setText('uploaded', uploaded)
  setText('total', total)
  const bar = $('[data-bind="progress"]')
  if (bar) bar.style.width = total ? `${Math.round((uploaded / total) * 100)}%` : '0%'
}

function bg(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      // chrome.runtime.lastError is normal when the bg worker is asleep —
      // it wakes up on first call and replies right after.
      if (chrome.runtime.lastError && !response) {
        resolve({ ok: false, error: chrome.runtime.lastError.message })
        return
      }
      resolve(response || { ok: false, error: 'no response' })
    })
  })
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

/**
 * Ask the content script of the active tab what it sees. Moodle/portal pages
 * get the auto-injected scrapers via the manifest. For every other URL we
 * inject content/generic.js on demand — that requires <all_urls> host
 * permission, which we request the first time the user clicks "סרוק שוב".
 */
async function scanPage() {
  const tab = await activeTab()
  if (!tab?.id) return { source: null, files: [] }

  // First try the message channel — works on pre-matched pages.
  try {
    const reply = await chrome.tabs.sendMessage(tab.id, { type: 'TEEPO_SCAN' })
    if (reply) return reply
  } catch {
    // ignore — no content script on this URL, fall through to injection.
  }

  // Generic injection path. Needs host permission for the active tab's origin.
  const granted = await ensureHostPermission(tab.url)
  if (!granted) {
    return {
      source: null,
      files: [],
      error: 'הרשאה לסרוק את הדף לא ניתנה',
    }
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/generic.js'],
    })
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__teepoScan || null,
    })
    return result || { source: null, files: [] }
  } catch (e) {
    console.warn('[popup] generic scan failed', e)
    return { source: null, files: [], error: String(e?.message || e) }
  }
}

/**
 * Request optional host permission for the active tab's origin. Chrome
 * caches the grant per origin so we only prompt once per site.
 */
async function ensureHostPermission(url) {
  if (!url || /^chrome:/.test(url) || /^about:/.test(url)) return false
  try {
    const origin = new URL(url).origin + '/*'
    return new Promise((resolve) => {
      chrome.permissions.request({ origins: [origin] }, (granted) => resolve(!!granted))
    })
  } catch {
    return false
  }
}

// ── State renderers ─────────────────────────────────────────────────────

let lastScan = { source: null, files: [] }

function renderReady(scan) {
  lastScan = scan
  setText('count', scan.files.length)
  setText('source', scan.source || '—')
  const list = $('[data-bind="files"]')
  list.innerHTML = ''
  scan.files.forEach((f, i) => {
    const li = document.createElement('li')
    li.innerHTML = `
      <input type="checkbox" data-i="${i}" checked />
      <span class="pop-fname">${escapeHtml(f.filename)}</span>
      <span class="pop-fkind">${escapeHtml(f.kind || guessKindFromName(f.filename))}</span>
    `
    list.appendChild(li)
  })
  // Course picker — if the scraper didn't extract a courseId from the page,
  // load the user's course list and show a dropdown so they can choose.
  hydrateCoursePicker(scan)
  showState('ready')
}

let userCourses = null // populated lazily on first picker render

async function hydrateCoursePicker(scan) {
  const sel = $('[data-bind="course-select"]')
  const hint = $('[data-bind="course-hint"]')
  if (!sel) return
  sel.innerHTML = '<option value="">— בחר קורס —</option>'
  hint.hidden = true

  if (!userCourses) {
    sel.disabled = true
    try {
      userCourses = await fetchCourseList()
    } catch (e) {
      console.warn('[popup] courses fetch failed', e)
      userCourses = []
      hint.textContent = 'לא הצלחנו לטעון את רשימת הקורסים. נסה רענון.'
      hint.hidden = false
    }
    sel.disabled = false
  }

  if (!userCourses?.length) {
    hint.textContent = 'אין קורסים ב-TEEPO. צור קורס באתר ואחר כך חזור.'
    hint.hidden = false
    return
  }

  // Render
  for (const c of userCourses) {
    const opt = document.createElement('option')
    opt.value = c.id
    const sem = c.semester ? `· סמסטר ${c.semester}` : ''
    const year = c.year_of_study ? `· שנה ${c.year_of_study}` : ''
    opt.textContent = `${c.title} ${year} ${sem}`.trim()
    if (!c.provisioned) {
      opt.textContent += ' · ⚠ ללא תיקייה'
      opt.dataset.unprovisioned = '1'
    }
    sel.appendChild(opt)
  }

  // Pre-pick if the scraper extracted a courseId AND it's in the user's DB.
  const fromScanner = scan?.courseId
  if (fromScanner && userCourses.some(c => c.id === fromScanner)) {
    sel.value = fromScanner
  }
}

async function fetchCourseList() {
  const token = await getDriveToken()
  if (!token) return []
  const { teepoBase } = await chrome.storage.local.get('teepoBase')
  const base = teepoBase || 'http://localhost:3000'
  const res = await fetch(`${base}/api/drive/courses`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`courses ${res.status}`)
  return res.json()
}

async function getDriveToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (t) => resolve(t || null))
  })
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c])
}

function guessKindFromName(name) {
  const ext = name.toLowerCase().split('.').pop()
  if (!ext) return 'file'
  if (['pdf'].includes(ext)) return 'pdf'
  if (['ppt', 'pptx'].includes(ext)) return 'pptx'
  if (['doc', 'docx'].includes(ext)) return 'docx'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xlsx'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'img'
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'm4a'].includes(ext)) return 'audio'
  if (['zip', 'rar', '7z'].includes(ext)) return 'zip'
  return ext.slice(0, 4)
}

// ── Boot ────────────────────────────────────────────────────────────────

async function boot() {
  const auth = await bg({ type: 'AUTH_STATUS' })
  if (!auth?.authed) {
    showState('anon')
    return
  }
  const scan = await scanPage()
  if (scan.files.length === 0) {
    showState('idle')
    return
  }
  renderReady(scan)
}

// ── Actions ─────────────────────────────────────────────────────────────

document.addEventListener('click', async (e) => {
  const action = e.target?.closest('[data-action]')?.dataset.action
  if (!action) return

  if (action === 'signin') {
    const r = await bg({ type: 'SIGN_IN' })
    if (r?.ok && r.authed) await boot()
    else showError(r?.error || 'התחברות נכשלה')
    return
  }

  if (action === 'signout') {
    await bg({ type: 'SIGN_OUT' })
    showState('anon')
    return
  }

  if (action === 'scan' || action === 'retry') {
    await boot()
    return
  }

  if (action === 'select-all') {
    const all = $$('.pop-file-list input[type="checkbox"]')
    const someUnchecked = all.some((c) => !c.checked)
    all.forEach((c) => { c.checked = someUnchecked })
    return
  }

  if (action === 'send') {
    await doUpload()
    return
  }

  if (action === 'open-teepo') {
    const { teepoBase } = await chrome.storage.local.get('teepoBase')
    const base = teepoBase || 'http://localhost:3000'
    chrome.tabs.create({ url: `${base}/summaries` })
    return
  }
})

function showError(message) {
  setText('err', message)
  showState('error')
}

async function doUpload() {
  if (!lastScan?.files?.length) return

  // Resolve the courseId — either from the picker, or from the scraper.
  const sel = $('[data-bind="course-select"]')
  const pickedCourse = sel?.value || lastScan?.courseId || null
  const hint = $('[data-bind="course-hint"]')
  if (!pickedCourse) {
    hint.textContent = 'בחר קורס כדי להמשיך'
    hint.hidden = false
    sel?.focus()
    return
  }
  // Check that the picked course actually has a provisioned folder.
  const courseRecord = userCourses?.find(c => c.id === pickedCourse)
  if (courseRecord && !courseRecord.provisioned) {
    hint.textContent = 'התיקייה של הקורס לא נוצרה. פתח את "המוח" באתר ולחץ "סנכרון Drive".'
    hint.hidden = false
    return
  }

  const checked = $$('.pop-file-list input[type="checkbox"]')
    .map((cb) => ({ keep: cb.checked, i: Number(cb.dataset.i) }))
    .filter((x) => x.keep)
    .map((x) => lastScan.files[x.i])
    .filter(Boolean)
  if (checked.length === 0) return

  showState('uploading')
  setProgress(0, checked.length)

  // Map each file's `kind` to a target subfolder. Drive folders are
  // lessons / assignments / notes; sheets, slides, pdf, video all go to
  // `lessons` by default. The user can move them in Drive afterwards.
  const kindToFolder = (kind) => {
    if (kind === 'doc' && /(?:homework|hw|exercise|תרגיל)/i.test('')) return 'assignments'
    return 'lessons'
  }

  let uploaded = 0
  let failed = []
  for (const f of checked) {
    try {
      const folder = await bg({
        type: 'RESOLVE_FOLDER',
        courseId: pickedCourse,
        kind: kindToFolder(f.kind),
      })
      if (!folder?.ok) throw new Error(folder?.error || 'folder failed')

      const up = await bg({
        type: 'UPLOAD',
        folderId: folder.folderId,
        sourceUrl: f.sourceUrl,
        filename: f.filename,
        mimeType: f.mimeType,
      })
      if (!up?.ok) throw new Error(up?.error || 'upload failed')
      uploaded++
    } catch (e) {
      console.warn('[popup] file failed', f.filename, e)
      failed.push(f.filename)
    }
    setProgress(uploaded, checked.length)
  }

  setText('done-text',
    failed.length === 0
      ? `${uploaded} קבצים הועלו לתיקיית הקורס ב-Drive`
      : `${uploaded} הועלו · ${failed.length} נכשלו`,
  )
  showState('done')
}

boot()
