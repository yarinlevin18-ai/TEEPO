// Background service worker — listens for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_COOKIES') {
    chrome.cookies.getAll({ domain: msg.domain }, cookies => {
      sendResponse({ cookies })
    })
    return true // keep channel open for async
  }
})
