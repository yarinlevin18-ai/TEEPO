/**
 * Portal content script — stub. Real BGU/TAU portal scraper logic lands
 * in the next commit.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'TEEPO_SCAN') return
  sendResponse({ source: 'Portal (stub)', files: [], courseId: null })
})
