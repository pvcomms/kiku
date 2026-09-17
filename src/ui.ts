// The one page. Warm paper, New York serif, no external requests of any kind.
import type { Voice } from "./tts.ts";

type PageProps = { voices: Voice[]; defaultVoice: string; hosts: string[] };

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

export function page({ voices, defaultVoice, hosts }: PageProps): string {
  const voiceOptions = voices
    .map(
      (v) =>
        `<option value="${v.id}"${v.id === defaultVoice ? " selected" : ""}>${esc(v.name)} — ${esc(v.note)}</option>`,
    )
    .join("");
  const hostsJson = JSON.stringify(hosts);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Kiku">
<meta name="theme-color" content="#F3EEE4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#171614" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/cover.png">
<link rel="apple-touch-icon" href="/cover.png">
<title>Kiku</title>
<style>
  @font-face { font-family: "Instrument Serif"; font-style: normal; font-weight: 400; font-display: swap; src: url(/assets/fonts/instrument-serif-normal.woff2) format("woff2"); }
  @font-face { font-family: "Instrument Serif"; font-style: italic; font-weight: 400; font-display: swap; src: url(/assets/fonts/instrument-serif-italic.woff2) format("woff2"); }
  @font-face { font-family: "General Sans"; font-style: normal; font-weight: 400; font-display: swap; src: url(/assets/fonts/general-sans-400.woff2) format("woff2"); }
  @font-face { font-family: "General Sans"; font-style: normal; font-weight: 500; font-display: swap; src: url(/assets/fonts/general-sans-500.woff2) format("woff2"); }
  @font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: 400; font-display: swap; src: url(/assets/fonts/jetbrains-mono-400.woff2) format("woff2"); }
  @font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: 500; font-display: swap; src: url(/assets/fonts/jetbrains-mono-500.woff2) format("woff2"); }
  :root {
    color-scheme: light dark;
    --paper: #F7F6F3; --paper-2: #F0EEE9; --paper-3: #E7E4DD;
    --ink: #111111; --ink-2: #6B6863; --ink-3: #9C9891;
    --line: #E4E1DA; --accent: #B5532A; --accent-ink: #FBF7F0;
    --display: "Instrument Serif", ui-serif, "New York", "Iowan Old Style", Georgia, serif;
    --sans: "General Sans", "Avenir Next", "Helvetica Neue", sans-serif;
    --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
    --ease: cubic-bezier(0.16, 1, 0.3, 1);
    --shadow: 0 2px 8px rgba(0,0,0,0.04);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #141311; --paper-2: #1C1B18; --paper-3: #262420;
      --ink: #EDEAE3; --ink-2: #A39F97; --ink-3: #6F6B64;
      --line: #2E2C27; --accent: #D0673E; --accent-ink: #1A1410;
      --shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
  }
  * { box-sizing: border-box; }
  html, body { color-scheme: light dark; background: var(--paper); color: var(--ink); }
  body {
    margin: 0; font-family: var(--sans); font-size: 16px; line-height: 1.6;
    -webkit-font-smoothing: antialiased; padding: 0 20px calc(140px + env(safe-area-inset-bottom));
  }
  main { max-width: 620px; margin: 0 auto; }
  a { color: inherit; }
  ::selection { background: var(--paper-3); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .rise { opacity: 0; transform: translateY(12px); animation: rise 600ms var(--ease) forwards; }
  .rise:nth-child(2) { animation-delay: 60ms; } .rise:nth-child(3) { animation-delay: 120ms; }
  .rise:nth-child(4) { animation-delay: 180ms; } .rise:nth-child(5) { animation-delay: 240ms; }
  @keyframes rise { to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .rise { animation: none; opacity: 1; transform: none; } * { transition: none !important; } }

  header { display: flex; align-items: baseline; justify-content: space-between; padding: 40px 0 8px; }
  .wordmark { font-family: var(--display); font-size: 48px; letter-spacing: -0.02em; line-height: 1; margin: 0; font-weight: 400; }
  .wordmark span { color: var(--ink-3); font-weight: 400; font-size: 22px; margin-left: 10px; letter-spacing: 0; font-family: var(--sans); }
  .status { font: 12px/1 var(--mono); color: var(--ink-2); letter-spacing: 0.02em; display: inline-flex; align-items: center; gap: 8px; }
  .status i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); display: inline-block; }
  .status i.busy { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.25; } }
  .lede { color: var(--ink-2); margin: 0 0 28px; font-family: var(--display); font-size: 22px; line-height: 1.35; letter-spacing: -0.005em; }

  .compose { border: 1px solid var(--line); border-radius: 12px; background: var(--paper-2); padding: 8px; transition: border-color 200ms var(--ease), box-shadow 200ms var(--ease); }
  .compose.drag { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(181,84,45,0.12); }
  textarea {
    width: 100%; min-height: 128px; resize: vertical; border: 0; background: transparent; color: var(--ink);
    font: 17px/1.55 var(--sans); padding: 12px 12px 4px; display: block;
  }
  textarea::placeholder { color: var(--ink-3); }
  textarea:focus { outline: none; }
  .compose:focus-within { border-color: var(--ink-3); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 6px 4px 4px; }
  .row .grow { flex: 1 1 auto; }
  select, .btn, .btn-2 {
    height: 44px; border-radius: 6px; font-family: var(--sans); font-size: 15px; font-weight: 500; cursor: pointer;
    transition: transform 160ms var(--ease), background-color 160ms var(--ease), color 160ms var(--ease), border-color 160ms var(--ease);
  }
  select { border: 1px solid var(--line); background: var(--paper); color: var(--ink); padding: 0 32px 0 12px; appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%236B665E' stroke-width='1.5'/></svg>"); background-repeat: no-repeat; background-position: right 12px center; max-width: 100%; }
  select.speed { width: 84px; }
  .btn { border: 0; background: var(--ink); color: var(--paper); padding: 0 20px; font-weight: 500; }
  .btn:hover { background: var(--accent); color: var(--accent-ink); }
  .btn:active { transform: scale(0.98); }
  .btn[disabled] { opacity: 0.5; cursor: default; }
  .btn-2 { border: 1px solid var(--line); background: var(--paper); color: var(--ink-2); padding: 0 14px; display: inline-flex; align-items: center; gap: 8px; }
  .btn-2:hover { color: var(--ink); border-color: var(--ink-3); }
  .btn-2 svg { width: 16px; height: 16px; }
  input[type=file] { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  .filename { font: 12px var(--mono); color: var(--ink-2); padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
  .err { color: var(--accent); font-size: 15px; margin: 10px 4px 0; min-height: 1.4em; }

  section { padding-top: 48px; }
  h2 { font: 12px/1 var(--mono); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-2); margin: 0 0 14px; font-weight: 500; display: flex; justify-content: space-between; align-items: baseline; }
  h2 small { letter-spacing: 0; text-transform: none; color: var(--ink-3); }
  .empty { color: var(--ink-3); font-style: italic; padding: 8px 0 0; }

  .job { padding: 14px 0; border-top: 1px solid var(--line); }
  .job:last-child { border-bottom: 1px solid var(--line); }
  .job .t { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--display); font-size: 20px; line-height: 1.3; }
  .job .m { font: 12px/1.4 var(--mono); color: var(--ink-2); margin-top: 4px; display: flex; justify-content: space-between; gap: 12px; }
  .bar { height: 2px; background: var(--line); margin-top: 10px; overflow: hidden; border-radius: 1px; }
  .bar b { display: block; height: 100%; width: 100%; background: var(--accent); transform-origin: left; transform: scaleX(0); transition: transform 700ms var(--ease); }
  .job.error .t { color: var(--accent); }
  .job.error .m { color: var(--accent); }

  .item { display: grid; grid-template-columns: 40px 1fr auto; gap: 14px; align-items: center; padding: 14px 6px; margin: 0 -6px; border-top: 1px solid var(--line); border-radius: 8px; transition: background-color 160ms var(--ease); }
  .item:last-child { border-bottom: 1px solid var(--line); }
  .item:hover { background: var(--paper-2); }
  .item.playing .t { color: var(--accent); }
  .play { width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--line); background: var(--paper); color: var(--ink); display: grid; place-items: center; cursor: pointer; padding: 0; transition: transform 160ms var(--ease), background-color 160ms var(--ease), color 160ms var(--ease), border-color 160ms var(--ease); }
  .play:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .play:active { transform: scale(0.94); }
  .play svg { width: 14px; height: 14px; display: block; }
  .item .body { min-width: 0; }
  .item .t { display: block; font-family: var(--display); font-size: 21px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .m { font: 12px/1.4 var(--mono); color: var(--ink-2); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .m .done { color: var(--accent); }
  .more { display: flex; gap: 2px; }
  .icon { width: 34px; height: 34px; border: 0; background: transparent; color: var(--ink-3); border-radius: 6px; cursor: pointer; display: grid; place-items: center; transition: color 160ms var(--ease), background-color 160ms var(--ease); text-decoration: none; }
  .icon:hover { color: var(--ink); background: var(--paper-3); }
  .icon svg { width: 16px; height: 16px; }

  .feedbox { border: 1px solid var(--line); border-radius: 10px; background: var(--paper-2); padding: 16px; }
  .feedbox p { margin: 0 0 10px; color: var(--ink-2); font-size: 15px; }
  .feedbox p:last-child { margin: 0; }
  .url { display: flex; gap: 8px; align-items: center; margin: 12px 0; }
  .url code { flex: 1; font: 13px/1.4 var(--mono); background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .url .btn-2 { height: 40px; }
  ol { padding-left: 20px; margin: 6px 0 0; color: var(--ink-2); font-size: 15px; }
  ol li { margin: 4px 0; }
  .alts { font: 12px/1.6 var(--mono); color: var(--ink-3); margin-top: 12px; }

  .player { position: fixed; left: 0; right: 0; bottom: 0; background: color-mix(in srgb, var(--paper-2) 88%, transparent); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-top: 1px solid var(--line); padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); transform: translateY(110%); transition: transform 500ms var(--ease); }
  .player.on { transform: none; }
  .player .in { max-width: 620px; margin: 0 auto; }
  .player .t { display: block; font-family: var(--display); font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 6px; }
  .player audio { width: 100%; display: block; height: 40px; }
  footer { padding: 56px 0 20px; font: 12px/1.6 var(--mono); color: var(--ink-3); }
  @media (max-width: 480px) { .wordmark { font-size: 40px; } .lede { font-size: 20px; } .item { gap: 12px; } .item .t { font-size: 19px; } }
</style>
</head>
<body>
<main>
  <header class="rise">
    <h1 class="wordmark">kiku <span>聞く</span></h1>
    <span class="status" id="status"><i></i><span id="statusText">studio</span></span>
  </header>
  <p class="lede rise">Paste a link, a file, or the words themselves. The Studio reads it aloud and hands it to your phone.</p>

  <form class="compose rise" id="compose" autocomplete="off">
    <textarea id="input" name="input" placeholder="https://aeon.co/essays/… or the text itself" spellcheck="false" aria-label="Link or text"></textarea>
    <div class="row">
      <label class="btn-2" for="file">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2v9M4.5 7.5 8 11l3.5-3.5M3 13.5h10"/></svg>
        file
      </label>
      <input type="file" id="file" name="file" accept=".md,.markdown,.txt,.html,.htm,.epub,.pdf,.docx,text/plain,text/markdown,text/html,application/pdf,application/epub+zip">
      <span class="filename" id="filename"></span>
      <span class="grow"></span>
      <select name="voice" id="voice" aria-label="Voice">${voiceOptions}</select>
      <select name="speed" id="speed" class="speed" aria-label="Speed">
        <option value="0.9">0.9×</option><option value="1" selected>1.0×</option><option value="1.1">1.1×</option><option value="1.2">1.2×</option><option value="1.3">1.3×</option>
      </select>
      <button class="btn" type="submit" id="go">Read it to me</button>
    </div>
    <div class="err" id="err" role="status"></div>
  </form>

  <section class="rise" id="cooking" hidden>
    <h2>Now reading</h2>
    <div id="jobs"></div>
  </section>

  <section class="rise">
    <h2>Library <small id="count"></small></h2>
    <div id="library"><div class="empty">Nothing yet. Paste something above.</div></div>
  </section>

  <section class="rise">
    <h2>On your phone</h2>
    <div class="feedbox">
      <p>Follow this private feed in Apple Podcasts. New readings appear as episodes, play in the background, and keep their place across your devices.</p>
      <div class="url"><code id="feedUrl"></code><button class="btn-2" type="button" id="copy">copy</button></div>
      <ol>
        <li>Podcasts app → Library → <b>⋯</b> → <b>Follow a Show by URL</b>.</li>
        <li>Paste the address above. Done.</li>
        <li>Or open this page in Brave on the phone and press play.</li>
      </ol>
      <div class="alts" id="alts"></div>
    </div>
  </section>

  <footer>everything stays on this machine · kokoro-82m via mlx · ~/Kiku</footer>
</main>

<div class="player" id="player">
  <div class="in">
    <span class="t" id="playerTitle"></span>
    <audio id="audio" controls preload="none"></audio>
  </div>
</div>

<script>
(() => {
  const HOSTS = ${hostsJson};
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (sec) => { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0'); };
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  // --- feed address (whatever host you used to get here is the one your phone can use) ---
  const origin = location.origin;
  $('#feedUrl').textContent = origin + '/feed.xml';
  const others = HOSTS.filter((h) => h !== origin);
  $('#alts').textContent = others.length ? 'also reachable at ' + others.join('  ·  ') : '';
  const tn = HOSTS.find((h) => h.startsWith('https://'));
  if (tn && !origin.startsWith('https://')) { $('#feedUrl').textContent = tn + '/feed.xml'; $('#alts').textContent = 'via Tailscale, works anywhere · on home Wi-Fi also ' + HOSTS.filter((h) => h !== tn).join('  ·  '); }
  $('#copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(origin + '/feed.xml'); $('#copy').textContent = 'copied'; }
    catch { $('#copy').textContent = 'select it'; }
    setTimeout(() => ($('#copy').textContent = 'copy'), 1600);
  });

  // --- compose ---
  const form = $('#compose'), input = $('#input'), file = $('#file'), err = $('#err'), go = $('#go');
  file.addEventListener('change', () => { $('#filename').textContent = file.files[0] ? file.files[0].name : ''; });
  ['dragenter', 'dragover'].forEach((ev) => form.addEventListener(ev, (e) => { e.preventDefault(); form.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => form.addEventListener(ev, (e) => { e.preventDefault(); form.classList.remove('drag'); }));
  form.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { file.files = e.dataTransfer.files; file.dispatchEvent(new Event('change')); } });
  const savedVoice = store.get('kiku.voice'); if (savedVoice) $('#voice').value = savedVoice;
  $('#voice').addEventListener('change', () => store.set('kiku.voice', $('#voice').value));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const text = input.value.trim();
    if (!text && !file.files[0]) { err.textContent = 'Paste a link, some text, or pick a file.'; return; }
    go.disabled = true;
    try {
      const fd = new FormData(form);
      const res = await fetch('/api/jobs', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      input.value = ''; file.value = ''; $('#filename').textContent = '';
      poll(true);
    } catch (e) { err.textContent = e.message; }
    finally { go.disabled = false; }
  });

  // --- jobs ---
  let pollTimer = null;
  async function poll(fast) {
    clearTimeout(pollTimer);
    let jobs = [];
    try { jobs = await (await fetch('/api/jobs')).json(); } catch { jobs = []; }
    const active = jobs.filter((j) => !['done', 'error'].includes(j.status));
    const recent = jobs.filter((j) => j.status === 'error' && Date.now() - new Date(j.updatedAt) < 10 * 60 * 1000);
    const show = [...active, ...recent];
    $('#cooking').hidden = show.length === 0;
    $('#jobs').innerHTML = show.map((j) => \`
      <div class="job \${j.status}">
        <span class="t">\${esc(j.title)}</span>
        <div class="m"><span>\${esc(j.status === 'error' ? j.error : j.detail)}</span><span>\${esc(j.status)}</span></div>
        \${j.status === 'error' ? '' : '<div class="bar"><b style="transform:scaleX(' + Math.max(0.02, j.progress || 0) + ')"></b></div>'}
      </div>\`).join('');
    $('#status i').className = active.length ? 'busy' : '';
    $('#statusText').textContent = active.length ? 'reading' : 'studio';
    const doneNow = jobs.some((j) => j.status === 'done' && Date.now() - new Date(j.updatedAt) < 4000);
    if (doneNow || fast) loadLibrary();
    pollTimer = setTimeout(() => poll(false), active.length ? 1500 : 8000);
  }

  // --- library + player ---
  const audio = $('#audio'), player = $('#player');
  let current = null;
  async function loadLibrary() {
    let items = [];
    let serverPos = {};
    try { const d = await (await fetch('/api/library')).json(); items = d.items; serverPos = d.positions || {}; } catch {}
    $('#count').textContent = items.length ? items.length + (items.length === 1 ? ' reading' : ' readings') : '';
    if (!items.length) { $('#library').innerHTML = '<div class="empty">Nothing yet. Paste something above.</div>'; return; }
    $('#library').innerHTML = items.map((it) => {
      const pos = Math.max(Number(store.get('kiku.pos.' + it.id) || 0), Number(serverPos[it.id]?.seconds || 0));
      const done = pos > 0 && it.seconds - pos < 20;
      const by = [it.author, it.site].filter(Boolean).join(' · ');
      return \`<div class="item\${current === it.id ? ' playing' : ''}" data-id="\${it.id}" data-file="\${esc(it.file)}" data-title="\${esc(it.title)}" data-by="\${esc(by)}">
        <button class="play" type="button" aria-label="Play">
          <svg viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z" fill="currentColor"/></svg>
        </button>
        <div class="body">
          <span class="t">\${esc(it.title)}</span>
          <span class="m">\${by ? esc(by) + ' · ' : ''}\${fmt(it.seconds)} · \${day(it.createdAt)}\${done ? ' · <span class="done">finished</span>' : pos > 30 ? ' · at ' + fmt(pos) : ''}</span>
        </div>
        <div class="more">
          <a class="icon" href="/audio/\${encodeURIComponent(it.file)}" download title="Download mp3"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2v9M4.5 7.5 8 11l3.5-3.5M3 13.5h10"/></svg></a>
          <button class="icon del" type="button" title="Remove"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
        </div>
      </div>\`;
    }).join('');
  }
  $('#library').addEventListener('click', async (e) => {
    const row = e.target.closest('.item'); if (!row) return;
    if (e.target.closest('.del')) {
      if (!confirm('Remove "' + row.dataset.title + '"?')) return;
      await fetch('/api/library/' + row.dataset.id, { method: 'DELETE' });
      if (current === row.dataset.id) { audio.pause(); player.classList.remove('on'); current = null; }
      loadLibrary(); return;
    }
    if (e.target.closest('.play') || e.target.closest('.body')) play(row.dataset);
  });
  function play(d) {
    if (current === d.id) { audio.paused ? audio.play() : audio.pause(); return; }
    current = d.id;
    audio.src = '/audio/' + encodeURIComponent(d.file);
    $('#playerTitle').textContent = d.title;
    player.classList.add('on');
    let pos = Number(store.get('kiku.pos.' + d.id) || 0);
    fetch('/api/positions').then((r) => r.json()).then((p) => { const sp = Number(p[d.id]?.seconds || 0); if (sp > pos) { pos = sp; if (audio.readyState >= 1 && audio.currentTime < 5 && pos < audio.duration - 10) audio.currentTime = pos; } }).catch(() => {});
    audio.addEventListener('loadedmetadata', () => { if (pos > 5 && pos < audio.duration - 10) audio.currentTime = pos; }, { once: true });
    audio.play().catch(() => {});
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: d.title, artist: d.by || 'Kiku', album: 'Kiku', artwork: [{ src: '/cover.png', sizes: '1400x1400', type: 'image/png' }] });
      navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
      navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration, audio.currentTime + 30); });
    }
    document.querySelectorAll('.item').forEach((el) => el.classList.toggle('playing', el.dataset.id === d.id));
  }
  let lastSave = 0;
  let lastPush = 0;
  const push = (id, secs) => fetch('/api/position/' + id, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seconds: secs }), keepalive: true }).catch(() => {});
  audio.addEventListener('timeupdate', () => { if (!current) return; const now = Date.now(); if (now - lastSave > 3000) { lastSave = now; store.set('kiku.pos.' + current, String(Math.floor(audio.currentTime))); } if (now - lastPush > 10000) { lastPush = now; push(current, Math.floor(audio.currentTime)); } });
  audio.addEventListener('pause', () => { if (current) push(current, Math.floor(audio.currentTime)); });
  audio.addEventListener('ended', () => { if (current) { store.set('kiku.pos.' + current, String(Math.floor(audio.duration))); push(current, Math.floor(audio.duration)); } loadLibrary(); });

  // --- ?u= prefill (used by the Shortcut fallback) ---
  const params = new URLSearchParams(location.search);
  const pre = params.get('u') || params.get('url') || params.get('text');
  if (pre) { input.value = pre; history.replaceState(null, '', location.pathname); form.requestSubmit(); }

  loadLibrary();
  poll(false);
})();
</script>
</body>
</html>`;
}
