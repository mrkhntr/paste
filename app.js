'use strict';

/*
 * Safe Paste — a serverless, immutable markdown paste tool.
 * Content lives entirely in the compressed URL fragment (never sent to a server).
 * Your saved pastes are listed in a local, per-browser history.
 */

const LS_PASTES = 'safepaste:pastes';
const LS_DRAFT = 'safepaste:draft';
const SIZE_WARN = 2000; // fragment chars beyond which QR/share links get unreliable

// ---------- compression (thin wrapper over lz-string) ----------

// Encode text + format into a URL-safe fragment: a 1-char format prefix
// ('m' = markdown, 't' = plain) followed by the lz-string payload.
function encode(text, format) {
  return (format === 'plain' ? 't' : 'm') + LZString.compressToEncodedURIComponent(text);
}

// Decode a fragment back into { text, format }. Throws on a corrupt payload.
function decode(frag) {
  const format = frag[0] === 't' ? 'plain' : 'markdown';
  const payload = frag.slice(1);
  if (payload === '') return { text: '', format };
  const text = LZString.decompressFromEncodedURIComponent(payload);
  if (text === null || text === undefined) throw new Error('corrupt fragment');
  return { text, format };
}

// ---------- rendering ----------

function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text, { breaks: false, gfm: true }));
}

// Guess whether raw text is markdown or plain by looking for common markdown
// syntax. Used for #raw= ingestion when no explicit &format= is given.
const MD_SIGNALS = [
  /^#{1,6}\s+\S/m,            // heading
  /^\s*[-*+]\s+\S/m,         // unordered list
  /^\s*\d+\.\s+\S/m,         // ordered list
  /^\s*>\s+\S/m,             // blockquote
  /```|~~~/,                  // code fence
  /!?\[[^\]]+\]\([^)]+\)/,   // link or image
  /\*\*[^*\n]+\*\*/,         // bold **
  /__[^_\n]+__/,             // bold __
  /`[^`\n]+`/,               // inline code
  /^\|.+\|/m,                // table row
];
function detectFormat(text) {
  return MD_SIGNALS.some((re) => re.test(text)) ? 'markdown' : 'plain';
}

// Render `text` into `el` according to `format`. Markdown is sanitized then
// code blocks are syntax-highlighted; plain text is shown verbatim.
function renderInto(el, text, format) {
  if (format === 'plain') {
    el.classList.add('plain');
    el.textContent = text;
    return;
  }
  el.classList.remove('plain');
  el.innerHTML = renderMarkdown(text);
  el.querySelectorAll('pre code').forEach((block) => {
    try { hljs.highlightElement(block); } catch (e) { /* unknown language: leave plain */ }
  });
}

// ---------- history (localStorage only) ----------

function getPastes() {
  try { return JSON.parse(localStorage.getItem(LS_PASTES)) || []; } catch (e) { return []; }
}
function setPastes(list) {
  try { localStorage.setItem(LS_PASTES, JSON.stringify(list)); } catch (e) { /* quota */ }
}
function deriveTitle(text) {
  const heading = text.match(/^\s*#+\s+(.+)$/m);
  if (heading) return heading[1].trim().slice(0, 80);
  const line = text.split('\n').map((s) => s.trim()).find(Boolean);
  return line ? line.slice(0, 80) : 'Untitled';
}
function addToHistory(frag, text, format) {
  const pastes = getPastes().filter((p) => p.id !== frag); // dedupe identical content
  pastes.unshift({ id: frag, title: deriveTitle(text), hash: frag, format, createdAt: Date.now() });
  setPastes(pastes);
}
function deleteFromHistory(id) {
  setPastes(getPastes().filter((p) => p.id !== id));
}

// ---------- draft (autosaved while composing) ----------

function saveDraft(text, format) {
  try { localStorage.setItem(LS_DRAFT, JSON.stringify({ text, format })); } catch (e) { /* quota */ }
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_DRAFT));
    if (d && typeof d.text === 'string') return { text: d.text, format: d.format === 'plain' ? 'plain' : 'markdown' };
  } catch (e) { /* ignore */ }
  return { text: '', format: 'markdown' };
}
function clearDraft() {
  try { localStorage.removeItem(LS_DRAFT); } catch (e) { /* ignore */ }
}

// ---------- DOM refs ----------

const $ = (id) => document.getElementById(id);
const composeEl = $('compose');
const viewEl = $('view');
const previewEl = $('preview');
const articleEl = $('article');
const splitEl = $('split');
const formatToggle = $('format-toggle');

let easymde = null;
let current = { text: '', format: 'markdown' }; // last viewed paste, for Duplicate/Share/Download
let baselineText = ''; // editor content as of the last save/load; used to detect unsaved changes

// ---------- format toggle ----------

function currentFormat() {
  return formatToggle.querySelector('.active').dataset.format;
}
function setFormat(format) {
  formatToggle.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.format === format);
  });
  splitEl.classList.toggle('plain', format === 'plain'); // hide preview pane for plain
  if (format === 'plain') splitEl.classList.remove('show-preview'); // plain has no preview
  const btnPreview = $('btn-preview');
  btnPreview.classList.toggle('hide', format === 'plain');
  if (format === 'plain') btnPreview.textContent = 'Preview';
}

// ---------- compose input (debounced) ----------

let debounceTimer = null;
function onComposeInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const text = easymde.value();
    const format = currentFormat();
    renderInto(previewEl, text, format);
    saveDraft(text, format);
  }, 200);
}

// ---------- mode switching ----------

function showCompose(draft) {
  setFormat(draft.format);
  easymde.value(draft.text);
  baselineText = draft.text;
  splitEl.classList.remove('show-preview'); // start on the editor (mobile toggle)
  $('btn-preview').textContent = 'Preview';
  renderInto(previewEl, draft.text, draft.format);
  viewEl.hidden = true;
  composeEl.hidden = false;
  easymde.codemirror.refresh();
  easymde.codemirror.focus();
}

// True when compose is active and the editor differs from the last save/load.
function isDirty() {
  return !composeEl.hidden && easymde.value() !== baselineText;
}

// Confirm leaving unsaved content. Returns true if it's safe to proceed.
function confirmDiscard() {
  return !isDirty() || confirm('You have unsaved content. Discard it and leave?');
}

function showView(text, format) {
  current = { text, format };
  renderInto(articleEl, text, format);
  $('view-format').textContent = format === 'plain' ? 'plain' : 'markdown';
  composeEl.hidden = true;
  viewEl.hidden = false;
  document.title = deriveTitle(text) + ' — Safe Paste';
}

// ---------- routing ----------

function route() {
  const f = location.hash.slice(1);

  if (f.startsWith('raw=')) {
    const params = new URLSearchParams(f);
    const text = params.get('raw') || '';
    const explicit = params.get('format');
    const format = explicit === 'plain' || explicit === 'markdown' ? explicit : detectFormat(text);
    const frag = encode(text, format);
    addToHistory(frag, text, format); // raw inputs are auto-saved to local history
    history.replaceState(null, '', location.pathname + location.search + '#' + frag);
    showView(text, format);
    toast('Saved to your local history (' + format + ').');
    return;
  }

  if (f) {
    try {
      const { text, format } = decode(f);
      showView(text, format);
    } catch (e) {
      toast('Could not read this paste — the link may be corrupt.');
      showCompose(loadDraft());
    }
    return;
  }

  showCompose(loadDraft());
}

// ---------- actions ----------

function doSave() {
  const text = easymde.value();
  if (!text.trim()) { toast('Nothing to save yet.'); return; }
  const format = currentFormat();
  const frag = encode(text, format);
  addToHistory(frag, text, format);
  baselineText = text; // saved, so no longer "unsaved"
  clearDraft();
  history.replaceState(null, '', location.pathname + location.search + '#' + frag);
  showView(text, format);
  if (frag.length > SIZE_WARN) {
    toast('Saved. Heads up: this is a large paste — the link may be too long for QR codes and some chat/email apps.');
  } else {
    toast('Saved. The link in your address bar is the paste.');
  }
}

function doNew() {
  if (!confirmDiscard()) return;
  clearDraft();
  history.replaceState(null, '', location.pathname + location.search);
  showCompose({ text: '', format: 'markdown' });
}

function doDuplicate() {
  history.replaceState(null, '', location.pathname + location.search);
  showCompose({ text: current.text, format: current.format });
}

function copyText(text, okMsg, failMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(okMsg), () => toast(failMsg));
  } else {
    toast(failMsg);
  }
}

function doShare() {
  copyText(location.href, 'Link copied to clipboard.', 'Copy failed — select the address bar instead.');
}

function doCopyContent() {
  copyText(current.text, 'Content copied to clipboard.', 'Copy failed — select the text instead.');
}

function doDownload() {
  const ext = current.format === 'plain' ? 'txt' : 'md';
  const name = deriveTitle(current.text).replace(/[^\w.-]+/g, '_').slice(0, 60) || 'paste';
  const blob = new Blob([current.text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name + '.' + ext;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- history panel ----------

function relativeTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.round(h / 24);
  if (d < 30) return d + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function renderHistory() {
  const list = $('history-list');
  const pastes = getPastes();
  list.innerHTML = '';
  $('history-empty').hidden = pastes.length > 0;
  for (const p of pastes) {
    const li = document.createElement('li');

    const open = document.createElement('button');
    open.className = 'history-open';
    open.innerHTML = '';
    const title = document.createElement('span');
    title.className = 'h-title';
    title.textContent = p.title;
    const meta = document.createElement('span');
    meta.className = 'h-meta';
    meta.textContent = (p.format === 'plain' ? 'plain' : 'md') + ' · ' + relativeTime(p.createdAt);
    open.append(title, meta);
    open.addEventListener('click', () => {
      closeHistory();
      if (location.hash.slice(1) === p.hash) route(); // re-open if already there
      else location.hash = p.hash;
    });

    const del = document.createElement('button');
    del.className = 'history-del ghost';
    del.textContent = 'Delete';
    del.addEventListener('click', () => { deleteFromHistory(p.id); renderHistory(); });

    li.append(open, del);
    list.append(li);
  }
}
function openHistory() { renderHistory(); $('history').hidden = false; }
function closeHistory() { $('history').hidden = true; }

// ---------- toast ----------

let toastTimer = null;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// ---------- init ----------

function init() {
  easymde = new EasyMDE({
    element: $('editor'),
    autofocus: false,
    spellChecker: false,       // use the browser's native spell-checker instead (below)
    status: false,
    toolbar: false,            // we provide our own toolbar
    minHeight: '200px',
    placeholder: 'Paste or write here…',
    previewRender: renderMarkdown, // used if EasyMDE preview is ever invoked
    inputStyle: 'contenteditable', // required for native spellcheck squiggles to show
    nativeSpellcheck: true,
  });
  // Enable the browser's native spell-check (respects the user's OS language).
  easymde.codemirror.setOption('spellcheck', true);
  easymde.codemirror.setOption('autocorrect', true);
  easymde.codemirror.refresh();
  easymde.codemirror.on('change', onComposeInput);

  formatToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-format]');
    if (!btn) return;
    setFormat(btn.dataset.format);
    onComposeInput();
  });

  // Mobile-only Edit/Preview toggle (the panes are side-by-side on wide screens).
  $('btn-preview').addEventListener('click', () => {
    const showing = splitEl.classList.toggle('show-preview');
    $('btn-preview').textContent = showing ? 'Edit' : 'Preview';
    if (showing) renderInto(previewEl, easymde.value(), currentFormat()); // ensure fresh
  });

  $('btn-save').addEventListener('click', doSave);
  $('btn-new').addEventListener('click', doNew);
  $('btn-new-2').addEventListener('click', doNew);
  $('btn-duplicate').addEventListener('click', doDuplicate);
  $('btn-share').addEventListener('click', doShare);
  $('btn-copy').addEventListener('click', doCopyContent);
  $('btn-download').addEventListener('click', doDownload);
  $('btn-history').addEventListener('click', openHistory);
  $('btn-history-2').addEventListener('click', openHistory);
  $('history-close').addEventListener('click', closeHistory);
  $('history').addEventListener('click', (e) => { if (e.target.id === 'history') closeHistory(); });

  // Ctrl/Cmd+S and Ctrl/Cmd+Enter save while composing
  easymde.codemirror.setOption('extraKeys', Object.assign({}, easymde.codemirror.getOption('extraKeys'), {
    'Cmd-Enter': () => { if (!composeEl.hidden) doSave(); },
    'Ctrl-Enter': () => { if (!composeEl.hidden) doSave(); },
  }));
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 's' || e.key === 'Enter')) {
      e.preventDefault();
      if (!composeEl.hidden) doSave();
    }
  });

  // Warn before closing/reloading the tab with unsaved compose content.
  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) {
      e.preventDefault();
      e.returnValue = ''; // required for Chrome to show the native prompt
    }
  });

  // Guard in-app navigation (history open, back/forward, manual hash edits):
  // confirm before discarding unsaved content; on cancel, restore the URL
  // (replaceState does not re-fire hashchange, so the editor is left untouched).
  window.addEventListener('hashchange', (e) => {
    if (isDirty() && !confirm('You have unsaved content. Discard it and leave?')) {
      history.replaceState(null, '', e.oldURL);
      return;
    }
    route();
  });
  route();

  if ('serviceWorker' in navigator) {
    // When a newly-installed worker takes control, reload once so the page runs
    // the latest code. Guarded so first-time visitors (no controller yet) and
    // repeat reloads don't loop.
    let refreshing = false;
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
    }
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update(); // proactively check for a new version on every load
    }).catch(() => { /* offline support is best-effort */ });
  }
}

init();
