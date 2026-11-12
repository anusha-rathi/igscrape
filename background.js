// queue mode: walks a list of post urls through one tab at a human pace. each full page load saves itself
// (content.js), reports back, and we move on. stops after 5 empty pages in a row, which is what a rate limit looks like
const POST_URL = /^https:\/\/www\.instagram\.com\/(?:[\w.]+\/)?(p|reel|reels)\/[\w-]+\/?/;

const next = async () => {
  const { queue = [], qtab } = await chrome.storage.local.get(["queue", "qtab"]);
  if (qtab == null) return;
  if (!queue.length) return chrome.storage.local.set({ qtab: null });  // done: stop treating the tab as a queue tab
  const [url, ...rest] = queue;
  await chrome.storage.local.set({ queue: rest });
  chrome.tabs.update(qtab, { url });
};

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.inQueue) {
    chrome.storage.local.get("qtab").then(({ qtab }) => reply(sender.tab?.id === qtab));
    return true;  // async reply
  }
  (async () => {
    if (m.queue) {
      // the request comes from page js, so only ever navigate to instagram post urls
      const queue = (Array.isArray(m.queue) ? m.queue : []).filter(u => typeof u === "string" && POST_URL.test(u));
      if (!queue.length) return;
      await chrome.storage.local.set({ queue, qtab: sender.tab.id, empties: 0, stopped: null });
      next();
    }
    if (m.saved) {
      const { qtab, empties = 0 } = await chrome.storage.local.get(["qtab", "empties"]);
      if (sender.tab.id !== qtab) return;
      const e = m.ok ? 0 : empties + 1;
      if (e >= 5) return chrome.storage.local.set({ queue: [], qtab: null, empties: e, stopped: "5 empty pages in a row" });
      await chrome.storage.local.set({ empties: e });
      // known limit: setTimeout in a service worker; fine at 4-10s, a stalled tab needs the queue re-posted
      setTimeout(next, 4000 + Math.random() * 6000);
    }
  })();
});
