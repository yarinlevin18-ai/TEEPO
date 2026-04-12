const DEFAULT_BACKEND = 'http://localhost:5000'

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
  const appUrl = url.replace('localhost:5000', 'localhost:3000')
    .replace('.onrender.com', '-frontend.vercel.app') // best guess fallback
  chrome.storage.local.get(['appUrl'], res => {
    document.getElementById('app-link').href = res.appUrl || appUrl
  })

  // Check backend status
  checkStatus(url)
}

async function checkStatus(backendUrl) {
  try {
    const res = await fetch(`${backendUrl}/api/bgu/status`, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    updateStatusUI('moodle', data.moodle)
    updateStatusUI('portal', data.portal)
  } catch {
    // Backend unreachable — still allow sending cookies
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
  // Also grab parent domain cookies
  return all
}

async function syncSite(site) {
  const btn = document.getElementById(`${site}-btn`)
  const toast = document.getElementById('toast')

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

    // Send cookies to backend
    const res = await fetch(`${backendUrl}/api/bgu/cookies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site, cookies }),
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json()

    if (data.status === 'success') {
      showToast(`✓ ${site === 'moodle' ? 'Moodle' : 'פורטל'} מחובר! ${cookies.length} cookies הועברו.`, 'success')
      updateStatusUI(site, true)
    } else {
      showToast(`שגיאה: ${data.message || 'לא הצלחנו לשמור את ה-session'}`, 'error')
    }
  } catch (err) {
    showToast(`שגיאה: ${err.message}. וודא שהשרת פועל.`, 'error')
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
