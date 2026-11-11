// Prompt Pause — content script.
// Runs on AI chat sites (ChatGPT, Claude, Gemini, and others) and on any site
// you switch it on for. It adds two kinds of friction:
//   1. The keyboard can't send a prompt. Only a real mouse click on Send works.
//   2. After you stop typing, the Send button stays locked for a few seconds
//      (3 by default), so you pause and reread before sending.

(() => {
  if (window.__promptPauseLoaded) return; // never run twice on one page
  window.__promptPauseLoaded = true;

  const settings = { enabled: true, delaySeconds: 3 };

  chrome.storage.sync.get(settings, (data) => Object.assign(settings, data));
  chrome.storage.onChanged.addListener((changes) => {
    for (const key of Object.keys(changes)) settings[key] = changes[key].newValue;
    if (!settings.enabled) unlock();
  });

  // ---------- Finding the prompt box and the Send button ----------

  // The prompt box: a multi-line text box or an editable area, not inside a popup dialog.
  function isComposer(el) {
    if (!el || !el.closest) return false;
    const box = el.closest(
      "#prompt-textarea, textarea, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']"
    );
    return Boolean(box && !box.closest("[role='dialog']"));
  }

  // The Send button. Every site names it a little differently, so we look for
  // the words "send" or "submit" in its label, test id, or id.
  const SEND_WORDS = /\b(send|submit)\b|send-button|submit-button/i;

  function findSendButton(el) {
    if (!el || !el.closest) return null;
    const btn = el.closest("button, [role='button'], input[type='submit']");
    if (!btn) return null;
    const label = [
      btn.getAttribute("aria-label"),
      btn.getAttribute("data-testid"),
      btn.getAttribute("title"),
      btn.id,
      btn.className && btn.className.toString(),
    ].join(" ");
    if (SEND_WORDS.test(label)) return btn;
    // A plain submit button in the same form as the prompt box also counts.
    const form = btn.closest("form");
    if (btn.type === "submit" && form && form.querySelector("textarea, [contenteditable]")) return btn;
    return null;
  }

  // ---------- The "pause before sending" lock ----------

  let lockedUntil = 0;
  let unlockTimer;

  function lock() {
    const ms = Number(settings.delaySeconds) * 1000;
    if (!settings.enabled || !(ms > 0)) return;
    lockedUntil = Date.now() + ms;
    document.documentElement.classList.add("cts-locked");
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(unlock, ms);
  }

  function unlock() {
    lockedUntil = 0;
    document.documentElement.classList.remove("cts-locked");
  }

  function secondsLeft() {
    return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
  }

  // Every time you type or paste in the prompt box, the timer starts over.
  window.addEventListener("input", (e) => {
    if (isComposer(e.target)) lock();
  }, true);

  // While locked, the Send button looks faded so you can tell it's not ready yet.
  function addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      html.cts-locked [data-testid="send-button"],
      html.cts-locked #composer-submit-button,
      html.cts-locked button[aria-label*="Send" i],
      html.cts-locked button[aria-label*="Submit" i] {
        opacity: 0.3 !important;
        cursor: wait !important;
        transition: opacity 0.4s;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addStyles);
  } else {
    addStyles();
  }

  // ---------- Blocking the keyboard ----------

  function block(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  window.addEventListener("keydown", (e) => {
    if (!settings.enabled || e.isComposing) return; // isComposing: typing in Japanese/Chinese/etc.

    // Enter (and Ctrl/Cmd+Enter) in the prompt box. Shift+Enter still adds a new line.
    if (e.key === "Enter" && !e.shiftKey && isComposer(e.target)) {
      block(e);
      showHint("Enter doesn't send. Reread, then click Send.  (Shift+Enter = new line)");
      return;
    }

    // Tabbing to the Send button and pressing Enter or Space.
    if ((e.key === "Enter" || e.key === " ") && findSendButton(e.target)) {
      block(e);
      showHint("Use your mouse to click Send.");
    }
  }, true); // "true" = run before the site's own code sees the key

  // ---------- Checking clicks on Send ----------

  window.addEventListener("click", (e) => {
    if (!settings.enabled || !findSendButton(e.target)) return;

    // A keyboard-triggered "click" has detail 0. A real mouse click has 1 or more.
    if (e.isTrusted && e.detail === 0) {
      block(e);
      showHint("Use your mouse to click Send.");
      return;
    }

    // Too soon after typing: wait for the countdown.
    if (secondsLeft() > 0) {
      block(e);
      showCountdown();
    }
  }, true);

  // ---------- The little reminder bubble ----------

  let hideTimer, tickTimer;

  function getHint() {
    let hint = document.getElementById("prompt-pause-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "prompt-pause-hint";
      Object.assign(hint.style, {
        position: "fixed",
        bottom: "120px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "#1f1f1f",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: "10px",
        font: "14px system-ui, sans-serif",
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
        zIndex: "2147483647",
        transition: "opacity 0.3s",
        pointerEvents: "none",
        opacity: "0",
      });
      document.body.appendChild(hint);
    }
    return hint;
  }

  function setHint(text, ms) {
    const hint = getHint();
    clearTimeout(hideTimer);
    hint.textContent = text;
    hint.style.opacity = "1";
    hideTimer = setTimeout(() => { hint.style.opacity = "0"; }, ms);
  }

  function showHint(text, ms = 2500) {
    clearInterval(tickTimer); // stop any countdown that's running
    setHint(text, ms);
  }

  function showCountdown() {
    clearInterval(tickTimer);
    const update = () => {
      const s = secondsLeft();
      if (s > 0) {
        setHint(`Take a breath. Send unlocks in ${s}…`, 60000);
      } else {
        setHint("Ready when you are.", 1500);
      }
    };
    update();
    tickTimer = setInterval(() => {
      update();
      if (secondsLeft() === 0) clearInterval(tickTimer);
    }, 250);
  }
})();
