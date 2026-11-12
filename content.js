// Reads the post that is already on screen. Never fetches anything itself, so it adds no requests to Instagram.
const POST = /^\/(?:[\w.]+\/)?(p|reel|reels)\/([\w-]+)/;
let slides = new Set(), lastCode = null, navAt = 0;
performance.setResourceTimingBufferSize(5000);

// reels stream audio and video as separate tracks from the cdn; the efg param says which is which.
// dropping bytestart/byteend turns one segment url into the whole track
function streams() {
  const out = { audio: "", video: "" };
  // known limit: first tracks fetched after you landed on this post; a feed that preloads the next reel
  // could hand us that one instead, so open reels as their own page (/reel/<code>/) before saving
  for (const e of performance.getEntriesByType("resource")) {
    if (e.startTime < navAt || !/\.mp4\?/.test(e.name) || !/fbcdn\.net|cdninstagram\.com/.test(new URL(e.name).host)) continue;
    const u = new URL(e.name);
    let tag = "";
    try { tag = atob(decodeURIComponent(u.searchParams.get("efg") || "")); } catch {}
    u.searchParams.delete("bytestart"); u.searchParams.delete("byteend");
    const kind = /audio/i.test(tag) ? "audio" : "video";
    if (!out[kind]) out[kind] = u.toString();
  }
  const v = document.querySelector("main video, video")?.currentSrc || "";
  if (!out.video && v.startsWith("https")) out.video = v;  // older non-streamed reels: one file with audio
  return out;
}

const num = s => {
  const m = (s || "").replace(/,/g, "").match(/([\d.]+)\s*([KkMm]?)/);
  return m ? Math.round(parseFloat(m[1]) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] || 1)) : null;
};

// every post/reel link that appears on any page (profile grids, feeds) is recorded for export.
// the grid shows no caption, so instagram's auto alt text ("may be an image of food...") stands in for it
let seen = {}, dirty = false;
function collectLinks() {
  document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').forEach(a => {
    const m = a.getAttribute("href").match(/^\/(?:([\w.]+)\/)?(p|reel)\/([\w-]+)/);
    if (!m || seen[m[3]]) return;
    const label = [...a.querySelectorAll("svg[aria-label]")].map(s => s.getAttribute("aria-label")).join(" ");
    seen[m[3]] = {
      url: `https://www.instagram.com/${m[2]}/${m[3]}/`,
      kind: m[2] === "reel" || /clip|reel/i.test(label) ? "reel" : /carousel/i.test(label) ? "carousel" : "post",
      account: m[1] || location.pathname.split("/")[1] || "",
      text: a.querySelector("img")?.alt || "", seen_at: new Date().toISOString(),
    };
    dirty = true;
  });
}
setInterval(async () => {
  if (!dirty) return;
  dirty = false;
  const { links = {} } = await chrome.storage.local.get("links");
  await chrome.storage.local.set({ links: { ...links, ...seen } });
}, 3000);

// carousel slides load one at a time as you click through, so collect every post image we see
// instagram mutates the dom constantly, so scan at most once per frame
let scheduled = false;
new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    collectLinks();
    document.querySelectorAll("main img[srcset], article img[srcset]").forEach(i => {
      if (i.naturalWidth >= 300 || i.width >= 300) slides.add(i.currentSrc || i.src);
    });
  });
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });

function read() {
  const m = location.pathname.match(POST);
  const og = p => document.querySelector(`meta[property="og:${p}"]`)?.content || "";
  // og tags are exact but only fresh on a full page load; trust them only if they describe this post
  const ogFresh = og("url").includes(m[2]);
  const ogDesc = ogFresh ? og("description") : "";
  const text = document.querySelector("main")?.innerText || "";
  const likes = num(ogDesc.match(/([\d.,]+[KkMm]?) likes?/)?.[1]) ?? num(text.match(/([\d.,]+[KkMm]?)\s+likes?/i)?.[1]);
  const comments = num(ogDesc.match(/([\d.,]+[KkMm]?) comments?/)?.[1]);
  // og:description reads: 205 likes, 8 comments - sodelhi on October 25, 2026: "caption".
  const caption = ogDesc.match(/^[^"]*?: "([\s\S]*?)"\.?\s*$/)?.[1] || document.querySelector("main h1")?.innerText || "";
  const author = ogDesc.match(/ - ([\w.]+) on /)?.[1]
    || document.querySelector('main header a[href^="/"]')?.getAttribute("href")?.replaceAll("/", "") || "";
  const isVideo = m[1] !== "p" || !!document.querySelector("main video");
  const isCarousel = !!document.querySelector('main button[aria-label="Next"], article button[aria-label="Next"]');
  // tagged location is a link to /explore/locations/<id>/<slug>/; the maps link is just a search url, never fetched
  const place = document.querySelector('main a[href*="/explore/locations/"], article a[href*="/explore/locations/"]')?.innerText.trim() || "";
  return {
    code: m[2], url: `https://www.instagram.com/${m[1] === "p" ? "p" : "reel"}/${m[2]}/`,
    kind: isVideo ? "reel" : isCarousel ? "carousel" : "post",
    author, caption, likes, comments, location: place,
    maps: place && `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`,
    hashtags: caption.match(/#[\p{L}\p{M}\p{N}_]+/gu) || [], mentions: caption.match(/@[\w.]+/g) || [],
    views: num(text.match(/([\d.,]+[KkMm]?)\s+(views|plays)/i)?.[1]),
    date: document.querySelector("main time[datetime]")?.getAttribute("datetime") || "",
    slides: [...slides], ...(isVideo ? (({ audio, video }) => ({ audio_url: audio, video_url: video }))(streams()) : {}),
    saved_at: new Date().toISOString(),
  };
}

const btn = Object.assign(document.createElement("button"), { textContent: "＋ save post" });
btn.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;padding:10px 16px;border:0;border-radius:20px;" +
  "background:#ff5c35;color:#fff;font:600 14px system-ui;cursor:pointer;box-shadow:0 2px 8px #0004;display:none";
async function save() {
  const post = read();
  const { posts = {} } = await chrome.storage.local.get("posts");
  posts[post.code] = { ...posts[post.code], ...post, slides: [...new Set([...(posts[post.code]?.slides || []), ...post.slides])] };
  await chrome.storage.local.set({ posts });
  btn.textContent = `saved ✓ (${Object.keys(posts).length})`;
  return post;
}
btn.onclick = save;

// queue mode (background.js): page js hands over a url list; every full post page load saves itself and reports back
window.addEventListener("message", e => {
  if (e.source === window && e.data?.type === "igscrape-queue") chrome.runtime.sendMessage({ queue: e.data.urls });
});
// only the queue's tab auto-saves; everywhere else saving is the button
if (POST.test(location.pathname)) chrome.runtime.sendMessage({ inQueue: true }).then(inQueue => inQueue && setTimeout(async () => {
  // 4s lets reel audio start streaming so streams() can see it; a crash still reports, as an empty page
  const p = await save().catch(e => (console.error("igscrape", e), {}));
  chrome.runtime.sendMessage({ saved: p.code || location.pathname, ok: !!(p.caption || p.likes) });
}, 4000));
document.documentElement.appendChild(btn);

// instagram is a single-page app: watch the url instead of waiting for page loads
setInterval(() => {
  const m = location.pathname.match(POST);
  btn.style.display = m ? "block" : "none";
  if (m && m[2] !== lastCode) { lastCode = m[2]; slides = new Set(); navAt = performance.now(); btn.textContent = "＋ save post"; }
}, 500);
