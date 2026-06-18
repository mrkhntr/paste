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
- **Pre-fill links.** `…/#raw=some%20text` (optionally `&format=plain`) seeds a paste and
  redirects to its compressed link. It's a fragment (not `?query` or a path) so the content
  never reaches the server.

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
