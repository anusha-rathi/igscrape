const get = async () => Object.values((await chrome.storage.local.get("posts")).posts || {});
const links = async () => Object.values((await chrome.storage.local.get("links")).links || {});
const $ = id => document.getElementById(id);

// one column per field seen in any row; lists join with spaces. a leading = + - @ would run as a
// formula in excel/sheets (captions and mentions are other people's text), so it gets a ' in front
function csv(rows) {
  const cols = [...new Set(rows.flatMap(Object.keys))];
  const cell = v => {
    const s = String(Array.isArray(v) ? v.join(" ") : v ?? "");
    return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
  };
  return "﻿" + [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\r\n");
}

function download(data, name) {
  const asCsv = $("fmt").value === "csv";
  const blob = asCsv ? new Blob([csv(data)], { type: "text/csv" }) : new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob), download: `${name}-${new Date().toISOString().slice(0, 10)}.${asCsv ? "csv" : "json"}`,
  }).click();
}

async function render() {
  const l = await links(), n = k => l.filter(x => x.kind === k).length.toLocaleString();
  $("reels").textContent = n("reel"); $("posts").textContent = n("post"); $("carousels").textContent = n("carousel");
  $("accounts").textContent = new Set(l.map(x => x.account)).size.toLocaleString();
  const posts = await get();
  $("count").textContent = `${posts.length} posts saved`;
  $("list").innerHTML = "";
  for (const p of posts.slice(-20).reverse()) {
    const li = document.createElement("li");
    li.textContent = `${p.kind} · @${p.author || "?"}${p.location ? ` · 📍${p.location}` : ""} · ${p.likes ?? "?"} likes · ${(p.caption || "").slice(0, 40)}`;
    $("list").appendChild(li);
  }
}

async function showQueue() {
  const { queue = [], stopped } = await chrome.storage.local.get(["queue", "stopped"]);
  $("queue").textContent = queue.length ? `queue: ${queue.length} posts left` : stopped ? `queue stopped: ${stopped}` : "";
}

$("export").onclick = async () => download(await get(), "ig-posts");
$("exportLinks").onclick = async () => download(await links(), "ig-links");
$("clear").onclick = async () => {
  if ((await get()).length && !confirm("clear all saved posts? export first if you need them.")) return;
  await chrome.storage.local.remove("posts");
  render();
};

showQueue();
render();
