// queue mode: walks a list of post urls through one tab at a human pace. each full page load saves itself
// (content.js), reports back, and we move on. stops after 5 empty pages in a row, which is what a rate limit looks like
const next = async () => {
  const { queue = [], qtab } = await chrome.storage.local.get(["queue", "qtab"]);
  if (!queue.length || qtab == null) return;
  const [url, ...rest] = queue;
  await chrome.storage.local.set({ queue: rest });
  chrome.tabs.update(qtab, { url });
};

chrome.runtime.onMessage.addListener((m, sender) => {
  (async () => {
    if (m.queue) {
      await chrome.storage.local.set({ queue: m.queue, qtab: sender.tab.id, empties: 0 });
      next();
    }
    if (m.saved) {
      const { qtab, empties = 0 } = await chrome.storage.local.get(["qtab", "empties"]);
      if (sender.tab.id !== qtab) return;
      const e = m.ok ? 0 : empties + 1;
      if (e >= 5) return chrome.storage.local.set({ queue: [], qtab: null, empties: e, stopped: "5 empty pages in a row" });
      await chrome.storage.local.set({ empties: e });
      // ponytail: setTimeout in a service worker; fine at 4-10s, a stalled tab needs the queue re-posted
      setTimeout(next, 4000 + Math.random() * 6000);
    }
  })();
});
