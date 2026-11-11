// Prompt Pause — background worker.
// Keeps the list of extra sites you've switched on (beyond the built-in AI sites)
// and makes sure the extension runs on them.

const SCRIPT_ID = "custom-sites";

// Look up every site you've given permission to, and register the script for them.
async function syncCustomSites() {
  const { origins = [] } = await chrome.permissions.getAll();
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  if (!origins.length) return;
  await chrome.scripting.registerContentScripts([{
    id: SCRIPT_ID,
    matches: origins,
    js: ["content.js"],
    runAt: "document_start",
  }]);
}

// When you switch a new site on, start working in its open tabs right away (no reload needed).
chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  await syncCustomSites();
  if (!origins.length) return;
  const tabs = await chrome.tabs.query({ url: origins });
  for (const tab of tabs) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => {});
  }
});

chrome.permissions.onRemoved.addListener(syncCustomSites);
chrome.runtime.onInstalled.addListener(syncCustomSites);
chrome.runtime.onStartup.addListener(syncCustomSites);
