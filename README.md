# igscrape

A small Chrome extension (Manifest V3, no dependencies, no build step) for keeping track of Instagram posts you browse.

- **Collects links automatically.** Every post, reel and carousel link that shows up on a page you scroll (profile grids, feeds) is recorded, with the account and Instagram's alt text.
- **Saves full posts on demand.** On a post or reel page, hit **＋ save post** to store author, caption, likes, comments, views, date, hashtags, mentions, tagged location (plus a Google Maps search link), image URLs and, for reels, the video/audio stream URLs.
- **Exports** both lists as CSV (opens in Excel, Sheets, Google My Maps) or JSON from the toolbar popup.

It only reads what is already on the page. It makes no requests to Instagram itself and sends nothing anywhere; everything stays in `chrome.storage.local`.

## Install

1. Download: green **Code** button → **Download ZIP**, then unzip (or `git clone`).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.

## Queue mode (optional)

To save a list of posts unattended, open any instagram.com tab and run this in the DevTools console:

```js
postMessage({ type: "igscrape-queue", urls: ["https://www.instagram.com/p/XXXX/", "..."] })
```

That tab then visits each post at a 4–10s random pace and saves it. It stops on its own after 5 empty pages in a row, which is usually a rate limit. Only Instagram post/reel URLs are accepted.

## Limits

- Instagram changes its markup often; selectors may need updating.
- Image and video URLs are signed CDN links and expire after a while. Download what you need soon after exporting.
- For reels, open the reel as its own page (`/reel/<code>/`) before saving. In a feed, the preloaded next reel's stream can be picked up instead.

## Disclaimer

Personal-use tool. Automated collection may go against Instagram's Terms of Use, so use it responsibly and respect other people's content.

## License

MIT
