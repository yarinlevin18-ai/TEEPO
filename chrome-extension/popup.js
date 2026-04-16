const DEFAULT_BACKEND = 'https://bgu-study-backend.onrender.com'

const SITES = {
  moodle: {
    domains: ['moodle.bgu.ac.il'],
    checkUrl: 'https://moodle.bgu.ac.il/moodle/my/',
    indicator: 'data-userid',
  },
  portal: {
    domains: ['my.bgu.ac.il'],
    checkUrl: 'https://my.bgu.ac.il/',
    indicator: 'studentId',
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
    const res = await fetch(`${backendUrl}/api/bgu/status`, { signal: AbortSignal.timeout(25000) })
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

async function getCookiesForDomains(domains) {
  const all = []
  for (const domain of domains) {
    const cookies = await chrome.cookies.getAll({ domain })
    all.push(...cookies)
  }
  return all
}

async function syncSite(site) {
  const btn = document.getElementById(`${site}-btn`)

  btn.disabled = true
  btn.textContent = 'שולח...'
  showToast('מעביר cookies לאפליקציה...', 'loading')

  try {
    const backendUrl = await getBackendUrl()
    const { domains } = SITES[site]
    const cookies = await getCookiesForDomains(domains)

    if (cookies.length === 0) {
      showToast(`לא נמצאו cookies של ${site}. פתח את האתר והתחבר תחילה.`, 'error')
      btn.disabled = false
      btn.textContent = 'שלח Session ל-App'
      return
    }

    // Update toast to indicate possible wake-up delay
    showToast(`נמצאו ${cookies.length} cookies. שולח לשרת...`, 'loading')

    // Give Render 45s to wake up + process (free tier cold start can take 30-40s)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      showToast('השרת מתעורר מתרדמה... זה עלול לקחת עד 40 שניות בפעם הראשונה', 'loading')
    }, 8000)

    const res = await fetch(`${backendUrl}/api/bgu/cookies`, {
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
init()
