/**
 * Moodle content script — listens for TEEPO_SCAN from the popup and replies
 * with a structured list of downloadable files visible on the page.
 *
 * Stub: returns an empty list. Real DOM-sniffing logic lands in the next
 * commit (Moodle + portal scrapers). Lives in this file so the manifest's
 * content_scripts block doesn't 404 on a load.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'TEEPO_SCAN') return
  sendResponse({ source: 'Moodle (stub)', files: [], courseId: null })
})
