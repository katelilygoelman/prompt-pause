// Sites that are always on (must match the list in manifest.json).
const BUILT_IN = [
  "chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com",
  "copilot.microsoft.com", "www.perplexity.ai", "perplexity.ai", "grok.com",
  "chat.deepseek.com", "chat.mistral.ai", "www.meta.ai", "poe.com",
];

const enabledBox = document.getElementById("enabled");
const delayInput = document.getElementById("delay");
const siteEl = document.getElementById("site");
const statusEl = document.getElementById("status");
const siteBtn = document.getElementById("toggleSite");

// ----- Main settings -----
chrome.storage.sync.get({ enabled: true, delaySeconds: 3 }, (data) => {
  enabledBox.checked = data.enabled;
  delayInput.value = data.delaySeconds;
});
enabledBox.addEventListener("change", () => chrome.storage.sync.set({ enabled: enabledBox.checked }));
delayInput.addEventListener("change", () => {
  const n = Math.min(30, Math.max(0, Math.round(Number(delayInput.value) || 0)));
  delayInput.value = n;
  chrome.storage.sync.set({ delaySeconds: n });
});

// ----- This site -----
chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  let url;
  try { url = new URL(tab.url); } catch { url = null; }

  if (!url || !/^https?:$/.test(url.protocol)) {
    siteEl.textContent = "This page";
    statusEl.textContent = "Prompt Pause can't run on this kind of page.";
    return;
  }

  const origin = `${url.protocol}//${url.hostname}/*`;
  siteEl.textContent = url.hostname;

  if (BUILT_IN.includes(url.hostname)) {
    statusEl.textContent = "On. This AI site is included by default.";
    return;
  }

  const isOn = await chrome.permissions.contains({ origins: [origin] });
  siteBtn.hidden = false;

  if (isOn) {
    statusEl.textContent = "On for this site.";
    siteBtn.textContent = "Turn off for this site";
    siteBtn.onclick = async () => {
      await chrome.permissions.remove({ origins: [origin] });
      statusEl.textContent = "Off. Reload the page to finish.";
      siteBtn.hidden = true;
    };
  } else {
    statusEl.textContent = "Off for this site.";
    siteBtn.textContent = "Use on this site";
    siteBtn.onclick = async () => {
      // The browser will ask you to allow access to this one site.
      // (Firefox may close this popup while asking; background.js still turns the site on.)
      const granted = await chrome.permissions.request({ origins: [origin] });
      statusEl.textContent = granted ? "On for this site." : "Not turned on.";
      if (granted) siteBtn.hidden = true;
    };
  }
});
