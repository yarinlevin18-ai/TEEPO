const DEFAULT_BACKEND = 'https://bgu-study-backend.onrender.com'

const SITES = {
  moodle: {
    urls: ['https://moodle.bgu.ac.il/', 'https://bgu.ac.il/'],
    checkUrl: 'https://moodle.bgu.ac.il/moodle/my/',
    indicator: 'data-userid',
  },
  portal: {
    urls: ['https://bgu4u22.bgu.ac.il/', 'https://my.bgu.ac.il/', 'https://bgu.ac.il/'],
    checkUrl: 'https://bgu4u22.bgu.ac.il/',
    indicator: 'apex',
  },
}

// ---------- Load saved state ----------

async function getBackendUrl() {
  return new Promise(resolve => {
    chrome.storage.local.get(['backendUrl'], res => {
      resolve(res.backendUrl || DEFAULT_BACKEND)
    })
  })
}

async function init() {
  const url = await getBackendUrl()
  document.getElementById('backend-url').value = url

  // Set app link
  let appUrl = 'https://bgu-study-organizer.vercel.app'
  if (url.includes('localhost')) appUrl = 'http://localhost:3000'
  chrome.storage.local.get(['appUrl'], res => {
    document.getElementById('app-link').href = res.appUrl || appUrl
  })

  // Check backend status (with wake-up awareness)
  checkStatus(url)
}

async function checkStatus(backendUrl) {
  try {
    // Give Render 25s to wake up on first check
    const res = await fetch(`${backendUrl}/api/university/status`, { signal: AbortSignal.timeout(25000) })
    const data = await res.json()
    updateStatusUI('moodle', data.moodle)
    updateStatusUI('portal', data.portal)
  } catch (e) {
    // If timeout, show a gentle hint
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      showToast('השרת מתעורר... נסה שוב בעוד 30 שניות', 'loading')
    }
  }
}

function updateStatusUI(site, connected) {
  const dot = document.getElementById(`${site}-dot`)
  const text = document.getElementById(`${site}-status-text`)
  const btn = document.getElementById(`${site}-btn`)

  if (connected) {
    dot.className = 'dot connected'
    text.textContent = 'מחובר ✓'
    btn.textContent = 'רענן Session'
    btn.className = 'btn btn-primary'
  } else {
    dot.className = 'dot'
    text.textContent = 'לא מחובר'
    btn.textContent = 'שלח Session ל-App'
    btn.className = 'btn btn-primary'
  }
}

// ---------- Cookie sync ----------

async function getCookiesForSite(urls) {
  const all = []
  const seen = new Set()
  for (const url of urls) {
    const cookies = await chrome.cookies.getAll({ url })
    for (const c of cookies) {
      const key = `${c.name}|${c.domain}|${c.path}`
      if (!seen.has(key)) {
        seen.add(key)
        all.push(c)
      }
    }
  }
  // Debug: if nothing found by URL, try getting ALL cookies and filter manually
  if (all.length === 0) {
    const allCookies = await chrome.cookies.getAll({})
    const bguCookies = allCookies.filter(c =>
      c.domain.includes('bgu.ac.il') || c.domain.includes('moodle')
    )
    return bguCookies
  }
  return all
}

/**
 * Try to capture the HTML of the active tab (if it's a BGU page).
 * Returns the HTML string or null if not on a BGU page.
 */
async function captureActiveTabHTML() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.url) return null

    // Only capture BGU pages
    if (!tab.url.includes('bgu.ac.il')) return null

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return {
          html: document.documentElement.outerHTML,
          url: window.location.href,
          title: document.title,
        }
      },
    })

    if (results && results[0] && results[0].result) {
      return results[0].result
    }
  } catch (e) {
    console.log('Could not capture tab HTML:', e.message)
  }
  return null
}

async function syncSite(site) {
  const btn = document.getElementById(`${site}-btn`)

  btn.disabled = true
  btn.textContent = 'שולח...'
  showToast('מעביר cookies לאפליקציה...', 'loading')

  try {
    const backendUrl = await getBackendUrl()
    const { urls } = SITES[site]
    const cookies = await getCookiesForSite(urls)

    // Debug info
    const allCount = (await chrome.cookies.getAll({})).length
    if (cookies.length === 0) {
      showToast(`0 cookies של ${site} (סה"כ ${allCount} cookies בדפדפן). נסה להסיר ולהוסיף מחדש את התוסף.`, 'error')
      btn.disabled = false
      btn.textContent = 'שלח Session ל-App'
      return
    }

    // Update toast to indicate possible wake-up delay
    showToast(`נמצאו ${cookies.length} cookies. שולח לשרת...`, 'loading')

    // Give Render 45s to wake up + process (free tier cold start can take 30-40s)
    const timer = setTimeout(() => {
      showToast('השרת מתעורר מתרדמה... זה עלול לקחת עד 40 שניות בפעם הראשונה', 'loading')
    }, 8000)

    const res = await fetch(`${backendUrl}/api/university/cookies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site, cookies }),
      signal: AbortSignal.timeout(60000), // 60s to handle Render cold start
    })
    clearTimeout(timer)

    const data = await res.json()

    if (data.status === 'success') {
      showToast(`✓ ${site === 'moodle' ? 'Moodle' : 'פורטל'} מחובר! ${cookies.length} cookies הועברו.`, 'success')
      updateStatusUI(site, true)

      // If on a BGU page, also capture + send the page HTML for grade parsing
      const pageData = await captureActiveTabHTML()
      if (pageData) {
        showToast('מנתח את הדף לציונים ונק"ז...', 'loading')
        try {
          await fetch(`${backendUrl}/api/university/parse-portal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              html: pageData.html,
              url: pageData.url,
              title: pageData.title,
              site,
            }),
            signal: AbortSignal.timeout(30000),
          })
          showToast(`✓ ${site === 'moodle' ? 'Moodle' : 'פורטל'} מחובר + דף נותח!`, 'success')
        } catch {
          // Page parsing failed, but cookies were sent successfully
          showToast(`✓ מחובר! (הדף הנוכחי לא הכיל ציונים)`, 'success')
        }
      }

      // Re-check status from server to confirm
      setTimeout(() => checkStatus(backendUrl), 1500)
    } else {
      showToast(`שגיאה: ${data.message || 'לא הצלחנו לשמור את ה-session'}`, 'error')
    }
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      showToast('פסק זמן — השרת לא הגיב. נסה שוב בעוד דקה.', 'error')
    } else {
      showToast(`שגיאה: ${err.message}`, 'error')
    }
  } finally {
    btn.disabled = false
    btn.textContent = 'שלח Session ל-App'
  }
}

/**
 * Dedicated grade sync — captures the current BGU page and sends it for parsing.
 * User should be on the portal grades page when clicking this.
 */
async function syncGrades() {
  const btn = document.getElementById('grades-btn')
  btn.disabled = true
  btn.textContent = 'סורק...'

  try {
    const pageData = await captureActiveTabHTML()
    if (!pageData) {
      showToast('גלוש קודם לדף הציונים בפורטל האוניברסיטה, ואז לחץ כאן', 'error')
      return
    }

    showToast(`סורק את "${pageData.title}"...`, 'loading')
    const backendUrl = await getBackendUrl()

    const res = await fetch(`${backendUrl}/api/university/parse-portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: pageData.html,
        url: pageData.url,
        title: pageData.title,
        site: 'portal',
      }),
      signal: AbortSignal.timeout(30000),
    })

    const data = await res.json()
    if (data.status === 'success' && data.grades_found > 0) {
      showToast(`✓ נמצאו ${data.grades_found} ציונים עם נק"ז!`, 'success')
    } else if (data.status === 'success') {
      showToast('הדף נקרא אבל לא נמצאו ציונים. נסה לגלוש לדף הציונים בפורטל.', 'error')
    } else {
      showToast(`שגיאה: ${data.message || 'לא הצלחנו לנתח'}`, 'error')
    }
  } catch (err) {
    showToast(`שגיאה: ${err.message}`, 'error')
  } finally {
    btn.disabled = false
    btn.textContent = 'סרוק ציונים מהדף'
  }
}

function showToast(msg, type) {
  const toast = document.getElementById('toast')
  toast.textContent = msg
  toast.className = `toast ${type}`
}

// ---------- Save backend URL ----------

async function saveUrl() {
  const url = document.getElementById('backend-url').value.trim().replace(/\/$/, '')
  await chrome.storage.local.set({ backendUrl: url })
  showToast('הכתובת נשמרה', 'success')
  setTimeout(() => checkStatus(url), 500)
}

// ---------- Boot ----------
// Script is at end of <body> so DOM is already ready — attach directly
document.getElementById('moodle-btn').addEventListener('click', () => syncSite('moodle'))
document.getElementById('portal-btn').addEventListener('click', () => syncSite('portal'))
document.getElementById('grades-btn').addEventListener('click', syncGrades)
document.getElementById('save-url-btn').addEventListener('click', saveUrl)
init()
