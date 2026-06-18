# Safe Paste

A **serverless, immutable** paste tool. You write or paste text, hit **Save**, and get a
shareable link whose content lives **entirely in the URL fragment** — nothing is ever
uploaded to a server. Pastes render as **markdown** (with syntax-highlighted code) or as
**plain text**. Your own saved pastes are kept in a **local, per-browser history**.

It's a fork of [NoPaste](https://github.com/bokub/nopaste) (MIT), rebuilt around
[lz-string](https://github.com/pieroxy/lz-string) (compression),
[EasyMDE](https://github.com/Ionaru/easy-markdown-editor) (editor),
[marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify)
(safe rendering), and [highlight.js](https://highlightjs.org/) (code).

## How it works

- **Content in the fragment.** A paste is `#<format><lz-string>` where the first char is the
  format (`m` = markdown, `t` = plain). The fragment is never sent to a server.
- **Immutable.** Saving freezes a paste. To change one, open it and **Duplicate** — that
  starts an editable copy that Saves as a brand-new link; the original is untouched.
- **Pre-fill links.** `…/#raw=some%20text` seeds a paste, **auto-detects** markdown vs
  plain (override with `&format=plain` / `&format=markdown`), **auto-saves** it to local
  history, and redirects to its compressed link. It's a fragment (not `?query` or a path)
  so the content never reaches the server.

## Use it from the Chrome address bar (keyword)

Turn the omnibox into an instant paste box: type a keyword, then your text, and Chrome
opens a new paste (format auto-detected, auto-saved to history).

**Manual setup (one time):**

1. Chrome → **Settings → Search engines → Manage search engines and site search**
   (or visit `chrome://settings/searchEngines`).
2. Under **Site search**, click **Add**.
3. Fill in:
   - **Search engine:** `Safe Paste`
   - **Shortcut:** `paste` (or anything short, e.g. `sp`)
   - **URL with %s in place of query:** `https://mrkhntr.com/paste/#raw=%s`
4. Save. Now type `paste` + <kbd>Tab</kbd> + your text in the address bar → it creates a paste.

The text goes in the URL **fragment** (`#raw=`), so it's never sent to a server — and Edge,
Brave, and other Chromium browsers use the same Site search settings.

**Semi-automatic:** Safe Paste ships an [OpenSearch](opensearch.xml) descriptor, so after you
visit the site Chrome auto-adds it under *Site search* (look for it in the list and give it a
shortcut). There is **no true one-click "add keyword" prompt** for a website — Chrome removed
that API. The only way to get genuine one-click keyword install is a small **Chrome extension**
(which can own an omnibox keyword); that's intentionally not part of this static app.

## "Safe" means

Serverless / private-by-staying-in-the-link — **not encrypted**. Anyone with a link can
read it. The rendered markdown *is* sanitized (DOMPurify) so opening an untrusted paste
can't run scripts against you.

## Run locally

```sh
# served under a /paste/ subpath to mimic GitHub Pages hosting
python3 -m http.server 8000
# then open http://localhost:8000/   (or host the folder at /paste/)
```

## Deploy (GitHub Pages → `mrkhntr.com/paste`)

Static + hash-routed, so Pages needs no rewrite rules. Put these files in a repo named
`paste` with Pages enabled; with the account's custom domain it publishes at
`mrkhntr.com/paste/`. All local asset paths are relative, so the subpath just works.

## Limits (by design)

- The URL has a size ceiling; very large pastes make links too long for QR codes and some
  chat/email apps (you'll get a warning on Save). The paste still opens from local history.
- History is localStorage-only (per-browser, cleared by "clear site data"). The link is the
  durable artifact.
