// The one page, set in one typewriter face. No external requests of any kind.
import type { Voice } from "./tts.ts";

type PageProps = {
  voices: Voice[];
  defaultVoice: string;
  hosts: string[];
  /** No sources yet: show the setup page instead of the inbox. */
  setup: boolean;
  /** A local model is available to draw with. When it is not, the page hides `see`. */
  see: boolean;
  /** The inbox keeps this many; past it the oldest fall off. The page says so when it is full. */
  inboxCap: number;
  /** A voice model is on disk, so the player offers `speak`. Marks work without it. */
  speak: boolean;
  /** `focus` is `/`: the players and the articles, nothing else. `manage` is `/sources`: the rest. `notes` is `/notes`. */
  view: "focus" | "manage" | "notes";
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

// The two palettes. The page follows the system unless the person picks one with the theme button,
// which sets data-theme on <html>; the dark block is written twice so either route reaches it.
const PAPER_LIGHT = "#F7F6F3";
const PAPER_DARK = "#141311";
const LIGHT = `
    color-scheme: light;
    --paper: ${PAPER_LIGHT}; --paper-2: #F0EEE9; --paper-3: #E7E4DD;
    --ink: #111111; --ink-2: #6B6863; --ink-3: #9C9891;
    --line: #E4E1DA; --accent: #B5532A; --accent-ink: #FBF7F0;`;
const DARK = `
    color-scheme: dark;
    --paper: ${PAPER_DARK}; --paper-2: #1C1B18; --paper-3: #262420;
    --ink: #EDEAE3; --ink-2: #A39F97; --ink-3: #6F6B64;
    --line: #2E2C27; --accent: #D0673E; --accent-ink: #1A1410;`;

/** The face, the palette and the base rules, shared by the page and the read view. */
const BASE_CSS = `
  @font-face { font-family: "IBM Plex Mono"; font-style: normal; font-weight: 400; font-display: swap; src: url(/assets/fonts/ibm-plex-mono-400.woff2) format("woff2"); }
  @font-face { font-family: "IBM Plex Mono"; font-style: normal; font-weight: 500; font-display: swap; src: url(/assets/fonts/ibm-plex-mono-500.woff2) format("woff2"); }
  :root {${LIGHT}
    --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --ease: cubic-bezier(0.16, 1, 0.3, 1);
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${DARK}
  } }
  :root[data-theme="dark"] {${DARK}
  }
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: 320ms; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
  * { box-sizing: border-box; }
  html, body { background: var(--paper); color: var(--ink); }
  body { color-scheme: inherit; margin: 0; font: 14px/1.7 var(--mono); -webkit-font-smoothing: antialiased; font-variant-ligatures: none; }
  main { max-width: 640px; margin: 0 auto; }
  a { color: inherit; }
  ::selection { background: var(--paper-3); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .rise { opacity: 0; transform: translateY(8px); animation: rise 500ms var(--ease) forwards; }
  .rise:nth-child(2) { animation-delay: 50ms; } .rise:nth-child(3) { animation-delay: 100ms; }
  .rise:nth-child(4) { animation-delay: 150ms; } .rise:nth-child(5) { animation-delay: 200ms; }
  @keyframes rise { to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .rise { animation: none; opacity: 1; transform: none; } * { transition: none !important; } }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 36px 0 0; }
  .wordmark { font: 500 15px/1 var(--mono); margin: 0; letter-spacing: 0; }
  .wordmark a { text-decoration: none; }
  .htools { display: inline-flex; align-items: center; gap: 18px; }
  .nav { display: inline-flex; gap: 16px; font-size: 12px; }
  .nav a { color: var(--ink-3); text-decoration: none; transition: color 160ms var(--ease); }
  .nav a:hover, .nav a.on { color: var(--ink); }
  .theme { width: 32px; height: 32px; flex: none; border: 1px solid var(--line); border-radius: 4px; background: transparent; color: var(--ink-2); display: grid; place-items: center; padding: 0; cursor: pointer; transition: color 160ms var(--ease), border-color 160ms var(--ease), background-color 160ms var(--ease), transform 160ms var(--ease); }
  .theme:hover { color: var(--ink); border-color: var(--ink-3); background: var(--paper-2); }
  .theme:active { transform: scale(0.94); }
  .theme svg { width: 15px; height: 15px; display: none; }
  .theme[data-mode="light"] .sun, .theme[data-mode="dark"] .moon, .theme[data-mode="system"] .auto { display: block; animation: turn 420ms var(--ease); }
  @keyframes turn { from { opacity: 0; transform: rotate(-60deg) scale(0.8); } }
`;

/** Runs in <head> before anything paints, so a chosen theme never flashes the other one first. */
const THEME_HEAD = `<script>try{var t=localStorage.getItem("kiku.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>`;

const THEME_METAS = `<meta name="theme-color" content="${PAPER_LIGHT}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${PAPER_DARK}" media="(prefers-color-scheme: dark)">`;

const THEME_BUTTON = `<button class="theme" id="theme" type="button" data-mode="system" aria-label="Theme">
      <svg class="sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06"/></svg>
      <svg class="moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 9.7A5.6 5.6 0 0 1 6.3 2.5a5.6 5.6 0 1 0 7.2 7.2z"/></svg>
      <svg class="auto" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="5.6"/><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" stroke="none"/></svg>
    </button>`;

/**
 * The theme button: system, then the opposite of the system, then the system's own colour picked
 * explicitly, then back. From the system setting the first press always changes what you see.
 * Stored per browser in localStorage, like the playback speed; other open tabs follow.
 */
const THEME_JS = `<script>
(() => {
  const root = document.documentElement, btn = document.getElementById('theme');
  if (!btn) return;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const metas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
  metas.forEach((m) => { m.dataset.orig = m.content; });
  const saved = () => { try { const t = localStorage.getItem('kiku.theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; } };
  const sys = () => (mq.matches ? 'dark' : 'light');
  const nextOf = (mode) => mode === 'system' ? (sys() === 'dark' ? 'light' : 'dark') : mode !== sys() ? sys() : 'system';
  const name = (mode) => mode === 'system' ? 'the system setting (' + sys() + ')' : mode;
  function paint(mode) {
    if (mode === 'system') delete root.dataset.theme; else root.dataset.theme = mode;
    btn.dataset.mode = mode;
    const text = 'Theme: ' + name(mode) + '. Switch to ' + name(nextOf(mode)) + '.';
    btn.setAttribute('aria-label', text); btn.title = text;
    const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
    metas.forEach((m) => { m.content = mode === 'system' ? m.dataset.orig : paper; });
  }
  btn.addEventListener('click', () => {
    const mode = nextOf(btn.dataset.mode);
    try { if (mode === 'system') localStorage.removeItem('kiku.theme'); else localStorage.setItem('kiku.theme', mode); } catch {}
    // A crossfade when the browser can draw one; a hidden or throttled tab skips it and just repaints.
    if (!document.startViewTransition || still.matches || document.visibilityState !== 'visible') return paint(mode);
    const t = document.startViewTransition(() => paint(mode));
    t.ready.catch(() => {}); t.finished.catch(() => {}); t.updateCallbackDone.catch(() => {});
  });
  mq.addEventListener('change', () => paint(btn.dataset.mode));
  addEventListener('storage', (e) => { if (e.key === 'kiku.theme') paint(saved()); });
  paint(saved());
})();
</script>`;

const ICON = {
  play: `<svg viewBox="0 0 14 14"><path d="M3.5 2v10l8-5z" fill="currentColor"/></svg>`,
  see: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="6" cy="8" r="4.2"/><circle cx="10" cy="8" r="4.2"/></svg>`,
  read: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4h10M3 8h10M3 12h6"/></svg>`,
  x: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  down: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2v9M4.5 7.5 8 11l3.5-3.5M3 13.5h10"/></svg>`,
};

export function page({
  voices,
  defaultVoice,
  hosts,
  setup,
  see,
  inboxCap,
  view,
  speak,
}: PageProps): string {
  const voiceOptions = voices
    .map(
      (v) =>
        `<option value="${v.id}"${v.id === defaultVoice ? " selected" : ""}>${esc(v.name)} — ${esc(v.note)}</option>`,
    )
    .join("");
  const hostsJson = JSON.stringify(hosts);
  const at = setup ? "manage" : view;
  // Each view hides what it does not need rather than leaving it out: the script finds the
  // same elements either way, and a link shared to the page (?u=) still has a form to submit.
  const only = (where: typeof at) => (where === at ? "" : " hidden");

  const sources = `
  <section class="rise" id="sources"${only("manage")}>
    <h2>Sources <small id="sourceCount"></small></h2>
    <form class="box" id="addForm" autocomplete="off">
      <p>A blog, a newsletter, a news site, a podcast: paste its feed address. Kiku tells a show from writing by what is in it; say which if it should not guess. Only what is published after this moment reaches the Inbox.</p>
      <div class="url">
        <input class="text" type="url" id="addUrl" placeholder="https://interconnects.ai/feed" required>
        <select id="addKind" aria-label="What kind of feed" class="kind"><option value="auto">as found</option><option value="feed">writing</option><option value="show">show</option></select>
        <button class="btn-2" type="submit">add</button>
      </div>
      <div class="err" id="addErr" role="status"></div>
      <details class="ways">
        <summary>many at once, or an OPML export from another reader</summary>
        <textarea id="importText" placeholder="one feed address per line, or the text of an OPML file" spellcheck="false"></textarea>
        <div class="row">
          <input type="file" id="opmlFile" accept=".opml,.xml,text/xml,text/x-opml">
          <label class="btn-2" for="opmlFile">${ICON.down} opml file</label>
          <span class="filename" id="opmlName"></span>
          <span class="grow"></span>
          <select id="importKind" aria-label="What kind these are" class="kind"><option value="auto">as found</option><option value="feed">all writing</option><option value="show">all shows</option></select>
          <button class="btn-2" type="button" id="importBtn">import</button>
        </div>
        <div class="err" id="importErr" role="status"></div>
      </details>
    </form>

    <details class="ways mailbox"${setup ? " open" : ""}>
    <summary>a mailbox, for newsletters that only arrive by mail</summary>
    <form class="box" id="mailForm" autocomplete="off">
      <p>Read over IMAP from this machine; the password goes in <code>~/Kiku/accounts.json</code> and is never shown again.</p>
      <div class="row">
        <select id="mailPreset" aria-label="Mail provider">
          <option value="proton">Proton, through Bridge</option>
          <option value="gmail">Gmail, app password</option>
          <option value="other">Other IMAP</option>
        </select>
        <input class="text grow" type="email" id="mailUser" placeholder="you@proton.me" required autocomplete="off">
        <input class="text grow" type="password" id="mailPass" placeholder="password" required autocomplete="new-password">
      </div>
      <div class="row" id="mailHostRow" hidden>
        <input class="text grow" id="mailHost" placeholder="imap.example.org">
        <input class="text" id="mailPort" placeholder="993" style="width:90px" inputmode="numeric">
        <label class="check"><input type="checkbox" id="mailSecure" checked> TLS</label>
      </div>
      <div class="row"><span class="grow"></span><button class="btn-2" type="submit">add mailbox</button></div>
      <div class="err" id="mailErr" role="status"></div>
    </form>
    </details>

    <div class="tools-row" id="srcTools" hidden>
      <div class="seg" id="srcTabs" role="radiogroup" aria-label="Which sources">
        <button type="button" class="on" data-tab="feeds" role="radio" aria-checked="true">writing <span></span></button>
        <button type="button" data-tab="shows" role="radio" aria-checked="false">shows <span></span></button>
        <button type="button" data-tab="mail" role="radio" aria-checked="false">mail <span></span></button>
      </div>
      <input class="text find" type="search" id="srcFind" placeholder="find a source" aria-label="Find a source" autocomplete="off" spellcheck="false">
      <select id="srcSort" class="kind" aria-label="Order">
        <option value="name">a to z</option>
        <option value="waiting">most waiting</option>
        <option value="quiet">longest quiet</option>
        <option value="failing">failing first</option>
      </select>
    </div>
    <div id="srcList"></div>
    <button class="more-btn" type="button" id="srcMore" hidden></button>
  </section>`;

  const phone = `
  <section class="rise" id="phone"${only("manage")}>
    <h2>On your phone</h2>
    <div class="box">
      <p>Follow this private feed in any podcast app. Each reading appears as an episode, plays in the background, and keeps its place across your devices.</p>
      <div class="url"><code id="feedUrl"></code><button class="btn-2" type="button" id="copy">copy</button></div>
      <ol>
        <li>Podcasts app → Library → <b>⋯</b> → <b>Follow a Show by URL</b>.</li>
        <li>Paste the address above. Done.</li>
        <li>Or open this page on the phone: it is a player too.</li>
      </ol>
      <div class="alts" id="alts"></div>
    </div>
  </section>`;

  const body = setup
    ? `
  <p class="lede rise">Nothing is subscribed yet. Add what you read and what you listen to, and only that will ever arrive here. Then anything can be heard, seen or read, on this machine.</p>
  <div class="ready rise" id="ready" hidden role="status"></div>
  ${sources}
  <section class="rise" id="setupDone" hidden>
    <div class="box"><p>That is a source. <a href="/">Open the inbox.</a></p></div>
  </section>`
    : `
  <div class="ready rise" id="ready" hidden role="status"></div>

  <form class="compose rise" id="compose" autocomplete="off"${only("manage")}>
    <textarea id="input" name="input" placeholder="a link, a file, or the words themselves" spellcheck="false" aria-label="Link or text"></textarea>
    <div class="row">
      <div class="seg" role="radiogroup" aria-label="What to make">
        <button type="button" class="on" data-mode="listen" role="radio" aria-checked="true">listen</button>
        <button type="button" data-mode="see" role="radio" aria-checked="false">see</button>
        <button type="button" data-mode="read" role="radio" aria-checked="false">read</button>
      </div>
      <input type="hidden" name="mode" id="mode" value="listen">
      <label class="btn-2" for="file">${ICON.down} file</label>
      <input type="file" id="file" name="file" accept=".md,.markdown,.txt,.html,.htm,.epub,.pdf,.docx,text/plain,text/markdown,text/html,application/pdf,application/epub+zip">
      <span class="filename" id="filename"></span>
      <span class="grow"></span>
      <select name="voice" id="voice" aria-label="Voice">${voiceOptions}</select>
      <select name="speed" id="speed" class="speed" aria-label="Speed">
        <option value="0.9">0.9×</option><option value="1" selected>1.0×</option><option value="1.1">1.1×</option><option value="1.2">1.2×</option><option value="1.3">1.3×</option>
      </select>
      <select name="sets" id="sets" class="sets" aria-label="How many sets" hidden>
        <option value="3" selected>3 sets</option><option value="5">5 sets</option>
      </select>
      <button class="btn" type="submit" id="go">Read it to me</button>
    </div>
    <div class="err" id="err" role="status"></div>
  </form>

  <section class="rise" id="cooking" hidden>
    <h2>Now making</h2>
    <div id="jobs"></div>
  </section>

  <section class="rise" id="inboxSec"${only("focus")}>
    <h2>Inbox <small id="inboxCount"></small></h2>
    <div class="tools-row" id="inboxTools" hidden>
      <div class="seg" id="inboxKinds" role="radiogroup" aria-label="Which kind">
        <button type="button" class="on" data-kind="all" role="radio" aria-checked="true">all <span></span></button>
        <button type="button" data-kind="feed" role="radio" aria-checked="false">writing <span></span></button>
        <button type="button" data-kind="show" role="radio" aria-checked="false">episodes <span></span></button>
        <button type="button" data-kind="mail" role="radio" aria-checked="false">letters <span></span></button>
      </div>
      <input class="text find" type="search" id="inboxFind" placeholder="filter" aria-label="Filter the inbox" autocomplete="off" spellcheck="false">
    </div>
    <div class="scope" id="inboxScope" hidden>
      <span id="scopeText"></span>
      <button type="button" class="link" id="scopeClear">show everything</button>
      <span class="grow"></span>
      <button type="button" class="btn-2 bulk" id="bulk"></button>
    </div>
    <div class="err quiet" id="inboxErr" role="status"></div>
    <div id="inbox"><div class="empty">Nothing new. What your sources publish from now on lands here.</div></div>
    <button class="more-btn" type="button" id="inboxMore" hidden></button>
  </section>

  <section class="rise" id="librarySec"${only("focus")}>
    <h2>Library <small id="count"></small></h2>
    <div id="library"><div class="empty">Nothing yet.</div></div>
  </section>

  <section class="rise" id="notesSec"${only("notes")}>
    <h2>Notes <small id="notesCount"></small></h2>
    <div id="notes"><div class="empty">Nothing marked yet. While something plays, press <b>mark</b> to keep the moment${speak ? ", or <b>speak</b> to say what it made you think" : ""}.</div></div>
  </section>
  ${sources}
  ${phone}`;

  const nav = setup
    ? ""
    : `<nav class="nav" aria-label="Pages">${(
        [
          ["/", "focus", "inbox"],
          ["/notes", "notes", "notes"],
          ["/sources", "manage", "sources"],
        ] as const
      )
        .map(
          ([href, v, name]) =>
            `<a href="${href}"${at === v ? ' class="on"' : ""}>${name}</a>`,
        )
        .join("")}</nav>`;

  return `<!doctype html>
<html lang="en" data-see="${see ? "on" : "off"}" data-speak="${speak ? "on" : "off"}">
<head>
<meta charset="utf-8">
${THEME_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Kiku">
${THEME_METAS}
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/cover.png">
<link rel="apple-touch-icon" href="/cover.png">
<title>Kiku</title>
<style>
  ${BASE_CSS}
  body { padding: 0 20px calc(140px + env(safe-area-inset-bottom)); }
  .lede { color: var(--ink-2); margin: 40px 0 0; }

  section { padding-top: 56px; }
  h2 { font: 500 11px/1 var(--mono); letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-3); margin: 0 0 14px; display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  h2 small { font-weight: 400; letter-spacing: 0; text-transform: none; }
  h3 { font: 500 11px/1 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); margin: 28px 0 6px; }
  .empty { color: var(--ink-3); padding: 6px 0 0; }

  /* one control height, one radius, one weight */
  select, .btn, .btn-2, .text, .seg { height: 36px; border-radius: 4px; font: 13px var(--mono); }
  select, .btn, .btn-2 { cursor: pointer; transition: transform 160ms var(--ease), background-color 160ms var(--ease), color 160ms var(--ease), border-color 160ms var(--ease); }
  select { border: 1px solid var(--line); background: var(--paper); color: var(--ink); padding: 0 30px 0 10px; appearance: none; -webkit-appearance: none; max-width: 100%;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%239C9891' stroke-width='1.4'/></svg>"); background-repeat: no-repeat; background-position: right 10px center; }
  select.speed { width: 80px; }
  select.sets { width: 92px; }
  .seg { display: inline-flex; border: 1px solid var(--line); overflow: hidden; background: var(--paper); }
  .seg button { border: 0; background: transparent; color: var(--ink-2); font: inherit; padding: 0 12px; cursor: pointer; white-space: nowrap; transition: background-color 160ms var(--ease), color 160ms var(--ease); }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button:hover { color: var(--ink); }
  .seg button.on { background: var(--ink); color: var(--paper); }
  .seg button:focus-visible { outline-offset: -3px; }
  .seg button span { color: var(--ink-3); margin-left: 4px; }
  .seg button span:empty { display: none; }
  .seg button.on span { color: color-mix(in srgb, var(--paper) 60%, transparent); }
  .seg button[hidden] { display: none; }
  .btn { border: 0; background: var(--ink); color: var(--paper); padding: 0 16px; }
  .btn:hover { background: var(--accent); color: var(--accent-ink); }
  .btn:active { transform: scale(0.98); }
  .btn[disabled] { opacity: 0.5; cursor: default; }
  .btn-2 { border: 1px solid var(--line); background: var(--paper); color: var(--ink-2); padding: 0 12px; display: inline-flex; align-items: center; gap: 8px; }
  .btn-2:hover { color: var(--ink); border-color: var(--ink-3); }
  .btn-2 svg { width: 14px; height: 14px; }
  .text { border: 1px solid var(--line); background: var(--paper); color: var(--ink); padding: 0 10px; min-width: 0; }
  .text::placeholder, textarea::placeholder { color: var(--ink-3); }
  .text:focus { outline: none; border-color: var(--ink-3); }
  .find { flex: 1 1 140px; }
  .find::-webkit-search-cancel-button { cursor: pointer; }
  input[type=file] { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  .filename { font-size: 12px; color: var(--ink-2); padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
  .err { color: var(--accent); font-size: 13px; margin: 8px 0 0; min-height: 1.5em; }
  .err.ok { color: var(--ink-2); }
  .err.quiet { margin: 0 0 10px; }
  .err.quiet:empty { display: none; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 6px 0 0; }
  .row .grow, .scope .grow { flex: 1 1 auto; }
  .row[hidden], .tools-row[hidden], .scope[hidden], .bulk[hidden], .more-btn[hidden] { display: none; }

  .compose { margin-top: 40px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper-2); padding: 8px; transition: border-color 200ms var(--ease), box-shadow 200ms var(--ease); }
  .compose.drag { border-color: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent); }
  .compose:focus-within { border-color: var(--ink-3); }
  textarea { width: 100%; min-height: 88px; resize: vertical; border: 0; background: transparent; color: var(--ink); font: 14px/1.7 var(--mono); padding: 10px 10px 4px; display: block; }
  textarea:focus { outline: none; }

  .tools-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 12px; }
  #sources .tools-row { margin-top: 28px; }
  .tools-row select.kind { width: auto; }
  .scope { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; margin: 0 0 10px; font-size: 12px; color: var(--ink-2); }
  .link { border: 0; background: none; padding: 0; font: inherit; color: var(--ink-3); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--line); cursor: pointer; transition: color 160ms var(--ease), text-decoration-color 160ms var(--ease); }
  .link:hover { color: var(--ink); text-decoration-color: currentColor; }
  .bulk { height: 30px; font-size: 12px; }
  .bulk.arm, .icon.arm { color: var(--accent); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .more-btn { display: block; width: 100%; margin-top: 12px; height: 36px; border: 1px solid var(--line); border-radius: 4px; background: transparent; color: var(--ink-2); font: 12px var(--mono); cursor: pointer; transition: color 160ms var(--ease), border-color 160ms var(--ease), background-color 160ms var(--ease); }
  .more-btn:hover { color: var(--ink); border-color: var(--ink-3); background: var(--paper-2); }
  .leaving { opacity: 0; transform: translateX(12px); transition: opacity 180ms var(--ease), transform 180ms var(--ease); pointer-events: none; }

  /* a row: a square to press, the words, and the verbs at the far edge */
  .item, .feed-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 14px; align-items: start; padding: 14px 0; border-top: 1px solid var(--line); }
  .feed-row.plain { grid-template-columns: minmax(0, 1fr) auto; }
  .item:last-child, .feed-row:last-child, .show:last-child .feed-row { border-bottom: 1px solid var(--line); }
  .show .feed-row { border-bottom: 0; }
  .item.playing .t { color: var(--accent); }
  .item .t, .feed-row .t { display: block; font-weight: 500; line-height: 1.5; color: var(--ink); text-decoration: none; }
  a.t:hover { text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--ink-3); }
  .item .body, .feed-row .body { min-width: 0; }
  .item .m, .feed-row .m { display: block; font-size: 12px; line-height: 1.6; color: var(--ink-3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .m .done { color: var(--accent); }
  .feed-row .m .fail { color: var(--accent); }
  .srcName { color: inherit; cursor: pointer; text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 3px; transition: color 160ms var(--ease), text-decoration-color 160ms var(--ease); }
  .srcName:hover { color: var(--ink); text-decoration-color: currentColor; }
  .srcName.wait { color: var(--ink-2); }
  .play { width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); display: grid; place-items: center; cursor: pointer; padding: 0; margin-top: 1px; text-decoration: none; transition: transform 160ms var(--ease), background-color 160ms var(--ease), color 160ms var(--ease), border-color 160ms var(--ease); }
  .play:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .play:active { transform: scale(0.94); }
  .play svg { width: 12px; height: 12px; display: block; }
  .play.glyph { font-size: 13px; font-weight: 500; }
  .acts { display: flex; align-items: center; gap: 2px; margin-top: 4px; }
  .act { border: 0; background: none; font: 12px/1 var(--mono); color: var(--ink-3); padding: 7px 7px; border-radius: 4px; cursor: pointer; text-decoration: none; transition: color 160ms var(--ease), background-color 160ms var(--ease); }
  .act:hover { color: var(--ink); background: var(--paper-2); }
  .act[hidden] { display: none; }
  .icon { width: 30px; height: 30px; border: 0; background: transparent; color: var(--ink-3); border-radius: 4px; cursor: pointer; display: grid; place-items: center; padding: 0; transition: color 160ms var(--ease), background-color 160ms var(--ease); }
  .icon:hover { color: var(--ink); background: var(--paper-2); }
  .icon svg { width: 14px; height: 14px; }
  .icon.arm { width: auto; padding: 0 8px; font: 500 12px var(--mono); }
  @media (hover: hover) and (pointer: fine) {
    .item .acts { opacity: 0; transition: opacity 160ms var(--ease); }
    .item:hover .acts, .item:focus-within .acts { opacity: 1; }
  }
  html[data-see="off"] [data-mode="see"], html[data-see="off"] .act.see { display: none; }

  .job { padding: 12px 0; border-top: 1px solid var(--line); }
  .job:last-child { border-bottom: 1px solid var(--line); }
  .job .t { display: block; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .job .m { font-size: 12px; color: var(--ink-3); margin-top: 2px; display: flex; justify-content: space-between; gap: 12px; }
  .bar { height: 2px; background: var(--line); margin-top: 10px; overflow: hidden; }
  .bar b { display: block; height: 100%; width: 100%; background: var(--accent); transform-origin: left; transform: scaleX(0); transition: transform 700ms var(--ease); }
  .job.error .t, .job.error .m { color: var(--accent); }
  .job .m .acts { display: inline-flex; gap: 6px; flex: none; margin: 0; }
  .job .m button { font: 12px/1 var(--mono); color: var(--ink); background: var(--paper-2); border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; cursor: pointer; }
  .job .m button:hover { border-color: var(--ink-3); }

  .ready { margin: 40px 0 0; padding: 12px 14px; border: 1px solid var(--accent); border-radius: 4px; font-size: 12px; line-height: 1.7; color: var(--accent); }
  .ready.soft { border-color: var(--line); }
  .ready .soft { color: var(--ink-2); }
  .ready div + div { margin-top: 6px; }
  .ready code { display: block; color: var(--ink); user-select: all; white-space: pre-wrap; word-break: break-word; }

  .box { border: 1px solid var(--line); border-radius: 4px; background: var(--paper-2); padding: 16px; }
  .box p { margin: 0 0 10px; color: var(--ink-2); font-size: 13px; }
  .box p:last-child { margin: 0; }
  .box code { font-size: 12px; }
  .url { display: flex; gap: 8px; align-items: center; margin: 12px 0; }
  .url code { flex: 1; font-size: 12px; background: var(--paper); border: 1px solid var(--line); border-radius: 4px; padding: 9px 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .url .text { flex: 1; }
  ol { padding-left: 20px; margin: 6px 0 0; color: var(--ink-2); font-size: 13px; }
  ol li { margin: 4px 0; }
  .alts { font-size: 12px; color: var(--ink-3); margin-top: 12px; }
  .ways { margin-top: 4px; }
  .ways > summary { font-size: 12px; color: var(--ink-2); cursor: pointer; padding: 6px 0; }
  .ways > summary:hover { color: var(--ink); }
  .ways textarea { border: 1px solid var(--line); border-radius: 4px; background: var(--paper); font-size: 13px; min-height: 88px; margin: 8px 0 4px; padding: 10px; }
  .mailbox { margin-top: 12px; }
  .mailbox[open] > summary { margin-bottom: 8px; }
  .check { font-size: 13px; color: var(--ink-2); display: inline-flex; align-items: center; gap: 6px; }
  .show-head { cursor: pointer; }
  .feed-row .art { width: 34px; height: 34px; border-radius: 4px; object-fit: cover; background: var(--paper-3); margin-top: 1px; }
  .episodes { padding-left: 48px; }
  .episodes .item:first-child { border-top: none; }

  .player { position: fixed; left: 0; right: 0; bottom: 0; background: color-mix(in srgb, var(--paper) 92%, transparent); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-top: 1px solid var(--line); padding: 10px 20px calc(10px + env(safe-area-inset-bottom)); transform: translateY(110%); transition: transform 500ms var(--ease); }
  .player.on { transform: none; }
  .player .in { max-width: 640px; margin: 0 auto; }
  .player .prow { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
  .player .t { display: block; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .player audio { width: 100%; display: block; height: 40px; }
  .speedBtn, .pbtn { height: 24px; padding: 0 8px; border-radius: 4px; border: 1px solid var(--line); background: var(--paper); color: var(--ink-2); font: 12px/1 var(--mono); cursor: pointer; flex-shrink: 0; transition: background-color 160ms var(--ease), color 160ms var(--ease), border-color 160ms var(--ease); }
  .speedBtn:hover, .pbtn:hover { color: var(--ink); border-color: var(--ink-3); }
  .pbtn:active { transform: scale(0.96); }
  .pbtn.rec { color: var(--accent); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .player .prow .t { flex: 1 1 auto; min-width: 0; }
  html[data-speak="off"] #speakBtn { display: none; }
  .pnote { font-size: 12px; line-height: 1.6; color: var(--ink-2); margin: 0 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; animation: rise 300ms var(--ease); }
  .pnote.rec { color: var(--accent); }

  /* notes: a reading, then its moments in time order */
  .nsrc + .nsrc { margin-top: 36px; }
  .nhead { padding: 0 0 12px; }
  .nhead .t { display: block; font-weight: 500; line-height: 1.5; }
  .nhead .m { display: block; font-size: 12px; color: var(--ink-3); margin-top: 2px; }
  .note { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 14px; align-items: start; padding: 14px 0; border-top: 1px solid var(--line); }
  .note:last-child { border-bottom: 1px solid var(--line); }
  .stamp { height: 28px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); font: 500 12px/1 var(--mono); font-variant-numeric: tabular-nums; cursor: pointer; padding: 0 8px; transition: background-color 160ms var(--ease), color 160ms var(--ease), border-color 160ms var(--ease), transform 160ms var(--ease); }
  .stamp:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .stamp:active { transform: scale(0.96); }
  span.stamp { display: inline-grid; place-items: center; cursor: default; color: var(--ink-3); }
  span.stamp:hover { background: var(--paper); color: var(--ink-3); border-color: var(--line); }
  .q { margin: 0; padding: 0 0 0 12px; border-left: 2px solid var(--line); color: var(--ink-2); font-size: 13px; line-height: 1.7; }
  .q.wait { color: var(--ink-3); }
  .q .qt { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 8; overflow: hidden; }
  .q.open .qt { display: block; }
  .q.more { cursor: pointer; }
  .q.more:not(.open)::after { content: "show all"; display: block; color: var(--ink-3); font-size: 11px; margin-top: 4px; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--line); }
  .q small { display: block; color: var(--ink-3); font-size: 11px; margin-top: 4px; }
  .said { margin: 10px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .q + .said { margin-top: 10px; }
  .nbody > .said:first-child { margin-top: 3px; }
  .nbody textarea { border: 1px solid var(--line); border-radius: 4px; background: var(--paper); min-height: 72px; margin-top: 10px; padding: 8px 10px; font-size: 13px; }
  .nbody textarea:focus { border-color: var(--ink-3); }
  .nbody .row { justify-content: flex-end; }
  .note .acts { margin-top: 0; }
  @media (max-width: 480px) {
    .note { grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "stamp . acts" "body body body"; row-gap: 10px; }
    .note .stamp { grid-area: stamp; } .note .nbody { grid-area: body; } .note .acts { grid-area: acts; }
  }
  @media (hover: hover) and (pointer: fine) {
    .note .acts { opacity: 0; transition: opacity 160ms var(--ease); }
    .note:hover .acts, .note:focus-within .acts { opacity: 1; }
  }
  @media (max-width: 480px) { .episodes { padding-left: 0; } .item, .feed-row { gap: 12px; } }
</style>
</head>
<body>
<main>
  <header class="rise">
    <h1 class="wordmark"><a href="/">kiku</a></h1>
    <div class="htools">
      ${nav}
      ${THEME_BUTTON}
    </div>
  </header>
  ${body}
</main>

<div class="player" id="player">
  <div class="in">
    <div class="prow">
      <span class="t" id="playerTitle"></span>
      <button class="pbtn" id="markBtn" type="button" title="Keep this moment as a note (m)">mark</button>
      <button class="pbtn" id="speakBtn" type="button" title="Pause, say what it made you think, and keep it as a note">speak</button>
      <button class="speedBtn" id="speedBtn" type="button" title="Playback speed">1×</button>
    </div>
    <div class="pnote" id="pnote" role="status" hidden></div>
    <audio id="audio" controls preload="none"></audio>
  </div>
</div>

<script>
(() => {
  const HOSTS = ${hostsJson};
  const SETUP = ${setup ? "true" : "false"};
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (sec) => { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0'); };
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const ICON = ${JSON.stringify(ICON)};
  const postJson = async (url, body) => { const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || 'Something went wrong.'); return data; };

  // --- feed address (whatever host you used to get here is the one your phone can use) ---
  const origin = location.origin;
  if ($('#feedUrl')) {
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
  }

  // --- player (shared by the library, the inbox's episodes and a show's episode list) ---
  const audio = $('#audio'), player = $('#player');
  let current = null;
  let currentD = null;
  const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75];
  let speed = Number(store.get('kiku.speed')) || 1;
  if (!SPEEDS.includes(speed)) speed = 1;
  audio.playbackRate = speed;
  const speedBtn = $('#speedBtn');
  speedBtn.textContent = speed + '×';
  speedBtn.addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    audio.playbackRate = speed;
    store.set('kiku.speed', String(speed));
    speedBtn.textContent = speed + '×';
  });
  // at, when given, is a second to start from: a note's timestamp.
  function play(d, at) {
    const from = Number.isFinite(at) ? Math.max(0, at) : null;
    if (current === d.id) {
      if (from === null) { audio.paused ? audio.play() : audio.pause(); return; }
      audio.currentTime = from; audio.play().catch(() => {}); return;
    }
    current = d.id;
    currentD = { id: d.id, file: d.file, title: d.title, by: d.by || '', art: d.art || '' };
    const isExternal = d.file.startsWith('http://') || d.file.startsWith('https://');
    audio.src = isExternal ? d.file : '/audio/' + encodeURIComponent(d.file);
    audio.playbackRate = speed;
    $('#playerTitle').textContent = d.title;
    player.classList.add('on');
    let pos = from ?? Number(store.get('kiku.pos.' + d.id) || 0);
    if (from === null) fetch('/api/positions').then((r) => r.json()).then((p) => { const sp = Number(p[d.id]?.seconds || 0); if (sp > pos) { pos = sp; if (audio.readyState >= 1 && audio.currentTime < 5 && pos < audio.duration - 10) audio.currentTime = pos; } }).catch(() => {});
    audio.addEventListener('loadedmetadata', () => { if (from !== null) audio.currentTime = from; else if (pos > 5 && pos < audio.duration - 10) audio.currentTime = pos; }, { once: true });
    audio.play().catch(() => {});
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: d.title, artist: d.by || 'Kiku', album: 'Kiku', artwork: [{ src: d.art || '/cover.png', sizes: '1400x1400', type: 'image/png' }] });
      navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
      navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration, audio.currentTime + 30); });
      // There is no next track in kiku, so the headphones' and the lock screen's "next" marks the moment.
      try { navigator.mediaSession.setActionHandler('nexttrack', () => { mark(false); }); } catch {}
    }
    document.querySelectorAll('.item').forEach((el) => el.classList.toggle('playing', el.dataset.id === d.id));
  }
  let lastSave = 0;
  let lastPush = 0;
  const push = (id, secs) => fetch('/api/position/' + id, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seconds: secs }), keepalive: true }).catch(() => {});
  audio.addEventListener('timeupdate', () => { if (!current) return; const now = Date.now(); if (now - lastSave > 3000) { lastSave = now; store.set('kiku.pos.' + current, String(Math.floor(audio.currentTime))); } if (now - lastPush > 10000) { lastPush = now; push(current, Math.floor(audio.currentTime)); } });
  audio.addEventListener('pause', () => { if (current) push(current, Math.floor(audio.currentTime)); });
  audio.addEventListener('ended', () => { if (current) { store.set('kiku.pos.' + current, String(Math.floor(audio.duration))); push(current, Math.floor(audio.duration)); } if (!SETUP) loadLibrary(); });

  // --- notes: mark a moment, or say what it made you think; both kept on this machine ---
  const pnote = $('#pnote'), markBtn = $('#markBtn'), speakBtn = $('#speakBtn');
  const clip = (t, n) => { t = String(t || '').replace(/\\s+/g, ' ').trim(); n = n || 90; return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  let sayTimer = 0;
  function say(msg, ms, cls) {
    clearTimeout(sayTimer);
    pnote.className = 'pnote' + (cls ? ' ' + cls : '');
    pnote.textContent = msg; pnote.hidden = false;
    if (ms) sayTimer = setTimeout(() => { pnote.hidden = true; }, ms);
  }
  async function mark(quiet) {
    if (!currentD) return null;
    const at = audio.currentTime || 0;
    try {
      const r = await postJson('/api/notes', { itemId: currentD.id, at, title: currentD.title, by: currentD.by, file: currentD.file, art: currentD.art });
      if (!quiet) say('marked ' + fmt(at) + (r.note.quote ? ' · ' + clip(r.note.quote) : r.note.pending ? ' · hearing the half minute before it' : ''), 6000);
      if (!quiet) refreshNotes();
      return r.note;
    } catch (e) { say(e.message, 6000); return null; }
  }
  markBtn.addEventListener('click', () => mark(false));

  // Speaking: pause, mark, record until pressed again, resume, then transcribe here while it plays on.
  let rec = null;
  async function startSpeaking() {
    if (!currentD) return;
    if (!window.isSecureContext || !navigator.mediaDevices || !window.MediaRecorder) {
      say('speaking needs this page on localhost or its https address; mark works here', 8000); return;
    }
    const wasPlaying = !audio.paused;
    audio.pause();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { say('the microphone was not allowed', 6000); if (wasPlaying) audio.play().catch(() => {}); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec = { mr, stream, chunks, wasPlaying, t0: Date.now(), note: mark(true), at: audio.currentTime || 0 };
    mr.start(1000);
    speakBtn.classList.add('rec'); speakBtn.textContent = 'stop';
    const tick = () => { if (!rec) return; const s = (Date.now() - rec.t0) / 1000; say('recording at ' + fmt(rec.at) + ' · ' + fmt(s) + ' · press stop when done', 0, 'rec'); if (s >= 180) stopSpeaking(); };
    tick(); rec.timer = setInterval(tick, 500);
  }
  async function stopSpeaking() {
    const r = rec; if (!r) return; rec = null;
    clearInterval(r.timer);
    const stopped = new Promise((done) => { r.mr.onstop = done; });
    r.mr.stop(); await stopped;
    r.stream.getTracks().forEach((t) => t.stop());
    speakBtn.classList.remove('rec'); speakBtn.textContent = 'speak';
    if (r.wasPlaying) audio.play().catch(() => {});
    const note = await r.note;
    if (!note) return;
    say('writing down what you said…');
    try {
      const blob = new Blob(r.chunks, { type: r.mr.mimeType || 'application/octet-stream' });
      const res = await fetch('/api/notes/' + note.id + '/voice', { method: 'POST', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'could not transcribe it');
      say('noted at ' + fmt(note.at) + (d.heard ? ' · “' + clip(d.heard, 70) + '”' : ' · nothing was heard'), 8000);
    } catch (e) { say('the mark is kept; the words were not: ' + e.message, 9000); }
    refreshNotes();
  }
  speakBtn.addEventListener('click', () => (rec ? stopSpeaking() : startSpeaking()));
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !currentD) return;
    const t = e.target;
    if (t && (t.closest('input, textarea, select, [contenteditable]'))) return;
    if (e.key === 'm') { e.preventDefault(); mark(false); }
  });

  // The notes view: every note by reading, newest reading first, its moments in time order.
  let noteCounts = {};
  let notesTimer = 0;
  function refreshNotes() { if (!$('#notesSec').hidden) loadNotes(); else loadLibrary(); }
  async function loadNotes() {
    if ($('#notesSec').hidden) return;
    clearTimeout(notesTimer);
    let d;
    try { d = await (await fetch('/api/notes')).json(); } catch { return; }
    const groups = {};
    for (const n of d.notes) (groups[n.sourceId] = groups[n.sourceId] || []).push(n);
    const order = Object.keys(groups).sort((a, b) => {
      const last = (k) => groups[k].reduce((m, n) => (n.createdAt > m ? n.createdAt : m), '');
      return last(b).localeCompare(last(a));
    });
    $('#notesCount').textContent = d.notes.length ? d.notes.length + (d.notes.length === 1 ? ' note' : ' notes') + ' · ' + order.length + (order.length === 1 ? ' reading' : ' readings') : '';
    if (!order.length) return;
    $('#notes').innerHTML = order.map((k) => {
      const src = d.sources[k] || { id: k, title: 'A reading that is gone', kind: 'reading' };
      const can = d.playable[k];
      const list = groups[k].sort((a, b) => a.at - b.at);
      return '<div class="nsrc" id="n-' + esc(k) + '" data-id="' + esc(k) + '" data-file="' + esc(src.file || '') + '" data-title="' + esc(src.title) + '" data-by="' + esc(src.by || '') + '" data-art="' + esc(src.art || '') + '">'
        + '<div class="nhead"><span class="t">' + esc(src.title) + '</span><span class="m">' + [src.by ? esc(src.by) : '', src.kind === 'episode' ? 'episode' : '', list.length + (list.length === 1 ? ' note' : ' notes'), can ? '' : 'the audio is gone'].filter(Boolean).join(' · ') + '</span></div>'
        + list.map((n) => {
          const stamp = can ? '<button class="stamp" type="button" data-at="' + n.at + '" title="Play from here">' + fmt(n.at) + '</button>' : '<span class="stamp">' + fmt(n.at) + '</span>';
          const q = n.pending ? '<blockquote class="q wait">hearing the half minute before this…</blockquote>'
            : n.quote ? '<blockquote class="q"><span class="qt">' + esc(n.quote) + '</span>' + (n.approx ? '<small>the paragraph is approximate: this reading was made before times were kept</small>' : '') + '</blockquote>' : '';
          return '<div class="note" data-note="' + esc(n.id) + '">' + stamp
            + '<div class="nbody">' + q + (n.said ? '<p class="said">' + esc(n.said) + '</p>' : '') + '</div>'
            + '<div class="acts"><button class="act write" type="button">' + (n.said ? 'edit' : 'write') + '</button>'
            + '<button class="icon del" type="button" title="Remove this note" aria-label="Remove this note">' + ICON.x + '</button></div></div>';
        }).join('') + '</div>';
    }).join('');
    $$('#notes .q .qt').forEach((el) => { if (el.scrollHeight > el.clientHeight + 2) el.parentElement.classList.add('more'); });
    if (location.hash && !loadNotes.scrolled) { loadNotes.scrolled = true; const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView({ block: 'start' }); }
    if (d.notes.some((n) => n.pending)) notesTimer = setTimeout(loadNotes, 4000);
  }
  $('#notes').addEventListener('click', async (e) => {
    const src = e.target.closest('.nsrc'); if (!src) return;
    const more = e.target.closest('.q.more');
    if (more) { more.classList.toggle('open'); return; }
    const stamp = e.target.closest('button.stamp');
    if (stamp) { play(src.dataset, Number(stamp.dataset.at)); return; }
    const row = e.target.closest('.note'); if (!row) return;
    const id = row.dataset.note;
    const del = e.target.closest('.del');
    if (del) {
      if (!arm(del, 'remove', 3000)) return;
      row.classList.add('leaving');
      await fetch('/api/notes/' + id, { method: 'DELETE' }).catch(() => {});
      setTimeout(loadNotes, 180); return;
    }
    if (e.target.closest('.write')) {
      const body = row.querySelector('.nbody');
      if (body.querySelector('textarea')) return;
      const said = body.querySelector('.said');
      const ta = document.createElement('textarea');
      ta.value = said ? said.textContent : ''; ta.placeholder = 'what it made you think'; ta.setAttribute('aria-label', 'Your words for this moment');
      const bar = document.createElement('div'); bar.className = 'row';
      bar.innerHTML = '<button class="link" type="button" data-cancel>cancel</button><button class="btn-2" type="button" data-save>save</button>';
      if (said) said.hidden = true;
      body.append(ta, bar); ta.focus();
      bar.querySelector('[data-cancel]').addEventListener('click', () => loadNotes());
      bar.querySelector('[data-save]').addEventListener('click', async () => {
        await fetch('/api/notes/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ said: ta.value }) }).catch(() => {});
        loadNotes();
      });
    }
  });

  // --- sources: one list with a tab per kind, a finder and an order, built to prune a long list ---
  let sources = { feeds: [], shows: [], mail: [] };
  // What each source has waiting, counted from the inbox the page already holds (set by the inbox code).
  let waitingBy = {};
  const PAGE = 40;
  let srcShown = PAGE;
  let srcTab = ['feeds', 'shows', 'mail'].includes(store.get('kiku.srcTab')) ? store.get('kiku.srcTab') : 'feeds';
  const SORTS = ['name', 'waiting', 'quiet', 'failing'];
  if (SORTS.includes(store.get('kiku.srcSort'))) $('#srcSort').value = store.get('kiku.srcSort');
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\\./, ''); } catch { return ''; } };
  const when = (iso) => { const d = new Date(iso); return d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', year: 'numeric' }); };
  const keyOf = (tab, s) => (tab === 'mail' ? 'mail:' + s.name : s.id);
  const titleOf = (tab, s) => (tab === 'mail' ? s.user : (s.title || '').trim() || hostOf(s.feedUrl) || s.feedUrl);
  // A press arms a destructive button and says what it will do; a second press within a few seconds does it.
  function arm(btn, label, ms) {
    if (btn.classList.contains('arm')) { clearTimeout(btn._t); return true; }
    btn.dataset.was = btn.innerHTML; btn.classList.add('arm'); btn.textContent = label;
    btn._t = setTimeout(() => disarm(btn), ms || 3000);
    return false;
  }
  function disarm(btn) {
    clearTimeout(btn._t);
    if (!btn.classList.contains('arm')) return;
    btn.classList.remove('arm'); btn.innerHTML = btn.dataset.was; delete btn.dataset.was;
  }
  function srcMeta(tab, s) {
    const n = waitingBy[keyOf(tab, s)] || 0;
    const parts = [tab === 'mail' ? esc(s.name) + ' · ' + esc(s.host) + ':' + s.port : esc(hostOf(s.feedUrl))];
    if (n) parts.push(SETUP ? n + ' waiting' : '<a href="#inboxSec" class="srcName wait" data-key="' + esc(keyOf(tab, s)) + '" data-title="' + esc(titleOf(tab, s)) + '" title="Show these in the inbox">' + n.toLocaleString() + ' waiting</a>');
    if (s.latest) parts.push('last post ' + when(s.latest));
    const checked = tab === 'mail' ? s.lastSynced : s.lastPolled;
    if (s.lastError) parts.push('<span class="fail">failing: ' + esc(s.lastError) + '</span>');
    else if (!checked) parts.push('not checked yet');
    else if (tab === 'mail') parts.push('checked ' + when(checked));
    return parts.join(' · ');
  }
  function srcRow(tab, s) {
    const label = tab === 'mail' ? 'Remove mailbox' : 'Unsubscribe';
    const art = tab !== 'shows' ? '' : s.artworkUrl ? '<img class="art" src="' + esc(s.artworkUrl) + '" alt="" loading="lazy">' : '<span class="art"></span>';
    const row = \`<div class="feed-row\${tab === 'shows' ? ' show-head' : ' plain'}" data-id="\${esc(s.id || '')}" data-name="\${esc(s.name || '')}">
      \${art}
      <div class="body">
        <span class="t">\${esc(titleOf(tab, s))}</span>
        <span class="m">\${srcMeta(tab, s)}</span>
      </div>
      <button class="icon unsub" type="button" title="\${label}" aria-label="\${label}">\${ICON.x}</button>
    </div>\`;
    return tab === 'shows' ? '<div class="show" data-id="' + esc(s.id) + '">' + row + '<div class="episodes" hidden></div></div>' : row;
  }
  function srcVisible() {
    const q = $('#srcFind').value.trim().toLowerCase();
    const all = sources[srcTab] || [];
    const list = q ? all.filter((s) => [titleOf(srcTab, s), s.feedUrl, s.host, s.name].filter(Boolean).join(' ').toLowerCase().includes(q)) : all.slice();
    const name = (a, b) => titleOf(srcTab, a).localeCompare(titleOf(srcTab, b));
    const w = (s) => waitingBy[keyOf(srcTab, s)] || 0;
    const order = {
      name,
      waiting: (a, b) => w(b) - w(a) || name(a, b),
      // Oldest last post first; a source that has not reported one yet goes to the end.
      quiet: (a, b) => (a.latest ? 0 : 1) - (b.latest ? 0 : 1) || String(a.latest || '').localeCompare(String(b.latest || '')) || name(a, b),
      failing: (a, b) => (b.lastError ? 1 : 0) - (a.lastError ? 1 : 0) || name(a, b),
    }[$('#srcSort').value] || name;
    return list.sort(order);
  }
  function renderSources() {
    const counts = { feeds: sources.feeds.length, shows: sources.shows.length, mail: sources.mail.length };
    const n = counts.feeds + counts.shows + counts.mail;
    $('#sourceCount').textContent = n ? [counts.feeds ? counts.feeds + ' feeds' : '', counts.shows ? counts.shows + ' shows' : '', counts.mail ? counts.mail + (counts.mail === 1 ? ' mailbox' : ' mailboxes') : ''].filter(Boolean).join(' · ') : '';
    $('#srcTools').hidden = n === 0;
    if (n && !counts[srcTab]) srcTab = ['feeds', 'shows', 'mail'].find((t) => counts[t]);
    $$('#srcTabs button').forEach((b) => {
      const t = b.dataset.tab, on = t === srcTab;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
      b.querySelector('span').textContent = counts[t] ? String(counts[t]) : '';
      b.hidden = !counts[t];
    });
    const list = srcVisible();
    $('#srcList').innerHTML = list.length ? list.slice(0, srcShown).map((s) => srcRow(srcTab, s)).join('') : n ? '<div class="empty">No source matches.</div>' : '';
    const left = list.length - srcShown;
    $('#srcMore').hidden = left <= 0;
    $('#srcMore').textContent = 'show ' + Math.min(left, PAGE) + ' more · ' + left + ' not shown';
    if (openShow) { const el = document.querySelector('#srcList .show[data-id="' + CSS.escape(openShow) + '"]'); if (el) toggleEpisodes(el, true); }
  }
  async function loadSources() {
    try { const d = await (await fetch('/api/sources')).json(); if (d && d.feeds) sources = d; } catch {}
    renderSources();
    if (SETUP && sources.feeds.length + sources.shows.length + sources.mail.length > 0) $('#setupDone').hidden = false;
  }
  $$('#srcTabs button').forEach((b) => b.addEventListener('click', () => { srcTab = b.dataset.tab; store.set('kiku.srcTab', srcTab); srcShown = PAGE; renderSources(); }));
  $('#srcFind').addEventListener('input', () => { srcShown = PAGE; renderSources(); });
  $('#srcSort').addEventListener('change', () => { store.set('kiku.srcSort', $('#srcSort').value); srcShown = PAGE; renderSources(); });
  $('#srcMore').addEventListener('click', () => { srcShown += PAGE; renderSources(); });

  // A show opens to its episodes. The list survives a re-render, so a refresh never closes it under you.
  const episodesOf = new Map();
  let openShow = null;
  function episodeHtml(show, ep) {
    return \`<div class="item\${current === ep.id ? ' playing' : ''}" data-id="\${ep.id}" data-file="\${esc(ep.enclosureUrl)}" data-title="\${esc(ep.title)}" data-by="\${esc(show.title)}" data-art="\${esc(show.artworkUrl || '')}">
      <button class="play" type="button" aria-label="Play">\${ICON.play}</button>
      <div class="body">
        <span class="t">\${esc(ep.title)}</span>
        <span class="m">\${ep.seconds ? fmt(ep.seconds) + ' · ' : ''}\${day(ep.pubDate)}</span>
      </div>
    </div>\`;
  }
  async function toggleEpisodes(show, keepOpen) {
    const id = show.dataset.id, panel = show.querySelector('.episodes');
    const opening = keepOpen || panel.hidden;
    panel.hidden = !opening;
    openShow = opening ? id : openShow === id ? null : openShow;
    if (!opening) return;
    const fill = (d) => { panel.innerHTML = d.episodes.length ? d.episodes.map((ep) => episodeHtml(d.show, ep)).join('') : '<div class="empty">No episodes found.</div>'; };
    if (episodesOf.has(id)) return fill(episodesOf.get(id));
    panel.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const d = await (await fetch('/api/podcasts/' + id + '/episodes')).json();
      if (!d.episodes) throw new Error(d.error || 'Could not load episodes.');
      episodesOf.set(id, d); fill(d);
    } catch (e) { panel.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  const addForm = $('#addForm'), addUrl = $('#addUrl'), addErr = $('#addErr');
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    addErr.textContent = ''; addErr.classList.remove('ok');
    const url = addUrl.value.trim();
    if (!url) return;
    try {
      const r = await postJson('/api/sources', { kind: $('#addKind').value, url });
      addUrl.value = '';
      addErr.textContent = (r.kind === 'show' ? 'show: ' : 'feed: ') + (r.kind === 'show' ? r.show.title : r.feed.title);
      addErr.classList.add('ok');
      srcTab = r.kind === 'show' ? 'shows' : 'feeds'; $('#srcFind').value = '';
      loadSources();
    } catch (e) { addErr.textContent = e.message; }
  });
  $('#opmlFile').addEventListener('change', async () => {
    const f = $('#opmlFile').files[0]; if (!f) return;
    $('#opmlName').textContent = f.name;
    $('#importText').value = await f.text();
  });
  $('#importBtn').addEventListener('click', async () => {
    const importErr = $('#importErr');
    importErr.textContent = ''; importErr.classList.remove('ok');
    const text = $('#importText').value.trim();
    if (!text) { importErr.textContent = 'Paste some addresses or an OPML file first.'; return; }
    const body = /<opml|<outline/i.test(text) ? { opml: text } : { feeds: text.split('\\n').map((l) => l.trim()).filter(Boolean) };
    body.kind = $('#importKind').value;
    $('#importBtn').disabled = true; $('#importBtn').textContent = 'importing…';
    try {
      const r = await postJson('/api/feeds/import', body);
      importErr.textContent = r.added + ' added' + (r.shows ? ' (' + r.shows + ' shows)' : '') + (r.skipped ? ', ' + r.skipped + ' already there' : '') + (r.failed.length ? ', ' + r.failed.length + ' failed: ' + r.failed.map((f) => f.feedUrl).join(', ') : '');
      importErr.classList.add('ok');
      $('#importText').value = ''; $('#opmlName').textContent = '';
      loadSources();
    } catch (e) { importErr.textContent = e.message; }
    finally { $('#importBtn').disabled = false; $('#importBtn').textContent = 'import'; }
  });
  const mailPreset = $('#mailPreset');
  const syncPreset = () => { const other = mailPreset.value === 'other'; $('#mailHostRow').hidden = !other; $('#mailUser').placeholder = mailPreset.value === 'gmail' ? 'you@gmail.com' : mailPreset.value === 'proton' ? 'you@proton.me' : 'you@example.org'; $('#mailPass').placeholder = mailPreset.value === 'gmail' ? '16-character app password' : mailPreset.value === 'proton' ? 'the Bridge mailbox password' : 'password'; };
  mailPreset.addEventListener('change', syncPreset); syncPreset();
  $('#mailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mailErr = $('#mailErr'); mailErr.textContent = ''; mailErr.classList.remove('ok');
    const preset = mailPreset.value;
    const body = { kind: 'mail', preset, user: $('#mailUser').value.trim(), pass: $('#mailPass').value, name: preset };
    if (preset === 'other') { body.host = $('#mailHost').value.trim(); body.port = Number($('#mailPort').value || 993); body.secure = $('#mailSecure').checked; body.name = body.host; }
    try {
      await postJson('/api/sources', body);
      $('#mailUser').value = ''; $('#mailPass').value = ''; $('#mailHost').value = ''; $('#mailPort').value = '';
      mailErr.textContent = 'added — checking it now'; mailErr.classList.add('ok');
      srcTab = 'mail';
      loadSources();
      setTimeout(loadSources, 8000);
    } catch (e) { mailErr.textContent = e.message; }
  });
  $('#srcList').addEventListener('click', async (e) => {
    const wait = e.target.closest('.wait');
    if (wait) { e.preventDefault(); document.dispatchEvent(new CustomEvent('kiku:scope', { detail: { key: wait.dataset.key, title: wait.dataset.title } })); return; }
    const ep = e.target.closest('.episodes .item');
    if (ep) { play(ep.dataset); return; }
    const row = e.target.closest('.feed-row'); if (!row) return;
    const unsub = e.target.closest('.unsub');
    if (!unsub) { if (srcTab === 'shows') toggleEpisodes(row.closest('.show')); return; }
    if (!arm(unsub, srcTab === 'mail' ? 'remove' : 'unsubscribe')) return;
    const url = srcTab === 'mail' ? '/api/sources/mail/' + encodeURIComponent(row.dataset.name) : (srcTab === 'shows' ? '/api/podcasts/' : '/api/feeds/') + row.dataset.id;
    const gone = row.closest('.show') || row;
    gone.classList.add('leaving');
    const res = await fetch(url, { method: 'DELETE' }).catch(() => null);
    if (!res || !res.ok) { gone.classList.remove('leaving'); disarm(unsub); unsub.title = 'Could not remove it. Try again.'; return; }
    await loadSources();
    if (!SETUP) loadInbox();
  });

  // --- readiness (one line, only when something this machine needs is missing) ---
  async function checkReady() {
    let report = null;
    try { report = await (await fetch('/health')).json(); } catch { return; }
    const bad = (report.checks || []).filter((c) => !c.ok);
    const model = (report.checks || []).find((c) => c.name === 'ollama');
    document.documentElement.dataset.see = model && model.ok ? 'on' : 'off';
    if (model && !model.ok && $('#mode') && $('#mode').value === 'see') setMode('listen');
    const box = $('#ready');
    box.hidden = bad.length === 0;
    // Something a reading needs is in the accent; something only one half uses stays quiet.
    box.classList.toggle('soft', bad.every((c) => c.level === 'want'));
    box.innerHTML = bad.map((c) => '<div' + (c.level === 'want' ? ' class="soft"' : '') + '>' + esc(c.name) + ' — ' + esc(c.detail) + (c.fix ? '<code>' + esc(c.fix) + '</code>' : '') + '</div>').join('');
  }
  checkReady();
  setInterval(checkReady, 60000);
  loadSources();

  if (SETUP) return;

  // --- compose ---
  const form = $('#compose'), input = $('#input'), file = $('#file'), err = $('#err'), go = $('#go');
  file.addEventListener('change', () => { $('#filename').textContent = file.files[0] ? file.files[0].name : ''; });
  ['dragenter', 'dragover'].forEach((ev) => form.addEventListener(ev, (e) => { e.preventDefault(); form.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => form.addEventListener(ev, (e) => { e.preventDefault(); form.classList.remove('drag'); }));
  form.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { file.files = e.dataTransfer.files; file.dispatchEvent(new Event('change')); } });
  const savedVoice = store.get('kiku.voice'); if (savedVoice) $('#voice').value = savedVoice;
  $('#voice').addEventListener('change', () => store.set('kiku.voice', $('#voice').value));

  // --- listen, see or read: the one choice on the form. Voice and speed belong to listening; sets to seeing.
  const LABELS = { listen: 'Read it to me', see: 'Draw it for me', read: 'Clean it to read' };
  function setMode(mode) {
    $('#mode').value = mode;
    $$('.seg button').forEach((b) => { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    $('#voice').hidden = mode !== 'listen'; $('#speed').hidden = mode !== 'listen'; $('#sets').hidden = mode !== 'see';
    go.textContent = LABELS[mode];
    store.set('kiku.mode', mode);
  }
  $$('.seg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  setMode(LABELS[store.get('kiku.mode')] ? store.get('kiku.mode') : 'listen');

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
    // An interrupted job stays until it is tried again or dismissed; other errors fade after ten minutes.
    const recent = jobs.filter((j) => j.status === 'error' && (j.detail === 'interrupted' || Date.now() - new Date(j.updatedAt) < 10 * 60 * 1000));
    const show = [...active, ...recent];
    $('#cooking').hidden = show.length === 0;
    $('#jobs').innerHTML = show.map((j) => \`
      <div class="job \${j.status}" data-id="\${esc(j.id)}">
        <span class="t">\${esc(j.title)}</span>
        <div class="m"><span>\${esc(j.status === 'error' ? j.error : j.detail)}</span>\${j.detail === 'interrupted'
          ? '<span class="acts">' + (j.again ? '<button type="button" data-again>again</button>' : '') + '<button type="button" data-dismiss>dismiss</button></span>'
          : '<span>' + esc(j.status) + '</span>'}</div>
        \${j.status === 'error' ? '' : '<div class="bar"><b style="transform:scaleX(' + Math.max(0.02, j.progress || 0) + ')"></b></div>'}
      </div>\`).join('');
    $$('#jobs [data-again]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      const id = b.closest('.job').dataset.id;
      const res = await fetch('/api/jobs/' + id + '/again', { method: 'POST' });
      if (!res.ok) { err.textContent = (await res.json()).error || 'Could not start it again.'; b.disabled = false; return; }
      poll(true);
    }));
    $$('#jobs [data-dismiss]').forEach((b) => b.addEventListener('click', async () => {
      await fetch('/api/jobs/' + b.closest('.job').dataset.id, { method: 'DELETE' });
      poll(true);
    }));
    const doneNow = jobs.some((j) => j.status === 'done' && Date.now() - new Date(j.updatedAt) < 4000);
    if (doneNow || fast) loadLibrary();
    pollTimer = setTimeout(() => poll(false), active.length ? 1500 : 8000);
  }

  // --- library ---
  async function loadLibrary() {
    let items = [];
    let serverPos = {};
    try { const d = await (await fetch('/api/library')).json(); items = d.items; serverPos = d.positions || {}; noteCounts = d.notes || {}; } catch {}
    const heard = items.filter((it) => !it.kind || it.kind === 'audio').length, drawn = items.filter((it) => it.kind === 'artifact').length, texts = items.filter((it) => it.kind === 'text').length;
    $('#count').textContent = [heard ? heard + (heard === 1 ? ' reading' : ' readings') : '', drawn ? drawn + ' drawn' : '', texts ? texts + ' to read' : ''].filter(Boolean).join(' · ');
    if (!items.length) { $('#library').innerHTML = '<div class="empty">Nothing yet.</div>'; return; }
    $('#library').innerHTML = items.map((it) => {
      const pos = Math.max(Number(store.get('kiku.pos.' + it.id) || 0), Number(serverPos[it.id]?.seconds || 0));
      const done = pos > 0 && it.seconds - pos < 20;
      const by = Array.from(new Set([it.author, it.site].filter(Boolean))).join(' · ');
      const proton = it.exportedAt ? ' · <span title="A copy is in Proton Drive">proton</span>' : '';
      if (it.kind === 'artifact') {
        const href = '/artifacts/' + encodeURIComponent(it.file);
        return \`<div class="item art" data-id="\${it.id}" data-title="\${esc(it.title)}">
        <a class="play" href="\${href}" target="_blank" rel="noopener" aria-label="Open">\${ICON.see}</a>
        <div class="body">
          <a class="t" href="\${href}" target="_blank" rel="noopener">\${esc(it.title)}</a>
          <span class="m">\${by ? esc(by) + ' · ' : ''}\${it.sets || 3} sets · drawn here by \${esc(it.model || 'a local model')} · \${day(it.createdAt)}\${proton}</span>
        </div>
        <div class="acts">
          <a class="act" href="\${href}" download title="Download html">html</a>
          <button class="act del" type="button" title="Remove" aria-label="Remove">×</button>
        </div>
      </div>\`;
      }
      if (it.kind === 'text') {
        const href = '/read/' + encodeURIComponent(it.id);
        return \`<div class="item art" data-id="\${it.id}" data-title="\${esc(it.title)}">
        <a class="play" href="\${href}" aria-label="Read">\${ICON.read}</a>
        <div class="body">
          <a class="t" href="\${href}">\${esc(it.title)}</a>
          <span class="m">\${by ? esc(by) + ' · ' : ''}\${(it.words || 0).toLocaleString()} words · \${Math.max(1, Math.round((it.words || 0) / 230))} min · \${day(it.createdAt)}</span>
        </div>
        <div class="acts">
          <button class="act del" type="button" title="Remove" aria-label="Remove">×</button>
        </div>
      </div>\`;
      }
      return \`<div class="item\${current === it.id ? ' playing' : ''}" data-id="\${it.id}" data-file="\${esc(it.file)}" data-title="\${esc(it.title)}" data-by="\${esc(by)}">
        <button class="play" type="button" aria-label="Play">\${ICON.play}</button>
        <div class="body">
          <span class="t">\${esc(it.title)}</span>
          <span class="m">\${by ? esc(by) + ' · ' : ''}\${fmt(it.seconds)} · \${day(it.createdAt)}\${done ? ' · <span class="done">finished</span>' : pos > 30 ? ' · at ' + fmt(pos) : ''}\${proton}</span>
        </div>
        <div class="acts">
          <a class="act" href="/read/\${encodeURIComponent(it.id)}" title="Read the text">text</a>
          \${noteCounts[it.id] ? '<a class="act" href="/notes#n-' + it.id + '" title="The moments kept from this reading">' + noteCounts[it.id] + (noteCounts[it.id] === 1 ? ' note' : ' notes') + '</a>' : ''}
          <a class="act" href="/audio/\${encodeURIComponent(it.file)}" download title="Download mp3">mp3</a>
          <button class="act del" type="button" title="Remove" aria-label="Remove">×</button>
        </div>
      </div>\`;
    }).join('');
  }
  $('#library').addEventListener('click', async (e) => {
    const row = e.target.closest('.item'); if (!row) return;
    if (e.target.closest('a')) return;
    if (e.target.closest('.del')) {
      if (!confirm('Remove "' + row.dataset.title + '"?')) return;
      await fetch('/api/library/' + row.dataset.id, { method: 'DELETE' });
      if (current === row.dataset.id) { audio.pause(); player.classList.remove('on'); current = null; }
      loadLibrary(); return;
    }
    if (row.classList.contains('art')) return;
    if (e.target.closest('.play') || e.target.closest('.body')) play(row.dataset);
  });

  // --- inbox: what the sources published since you subscribed, waiting for one of four verbs ---
  // The page narrows it by kind, by source and by words, and draws fifty at a time. Narrowing
  // chooses nothing: every item still waits for a verb, and dismissing many is a verb pressed twice.
  const SRC = { feed: 'feed', show: 'episode', mail: 'letter' };
  const NOUN = { all: ['item', 'items'], feed: ['post', 'posts'], show: ['episode', 'episodes'], mail: ['letter', 'letters'] };
  const INBOX_CAP = ${inboxCap};
  const IPAGE = 50;
  let inboxItems = [];
  let inboxShown = IPAGE;
  const view = { kind: 'all', key: '', title: '', q: '' };
  function inboxHtml(it) {
    const isShow = it.source === 'show';
    const title = it.link
      ? '<a class="t" href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">' + esc(it.title) + '</a>'
      : '<span class="t" title="Listen">' + esc(it.title) + '</span>';
    return \`<div class="item\${current === it.id ? ' playing' : ''}" data-id="\${it.id}" data-source="\${it.source}">
      <button class="play listen" type="button" aria-label="Listen" title="\${isShow ? 'Play' : 'Read it to me'}">\${ICON.play}</button>
      <div class="body">
        \${title}
        <span class="m"><span class="src">\${SRC[it.source] || it.source}</span> · <a href="#inboxSec" class="srcName" data-key="\${esc(it.feedId)}" data-title="\${esc(it.feedTitle)}" title="Only this source">\${esc(it.feedTitle)}</a> · \${day(it.pubDate)}\${it.seconds ? ' · ' + fmt(it.seconds) : ''}</span>
      </div>
      <div class="acts">
        <button class="act see" type="button" title="Draw it as sets"\${isShow ? ' hidden' : ''}>see</button>
        <button class="act read" type="button" title="\${isShow ? 'Read the show notes' : 'Clean it to read'}">read</button>
        <button class="act dismiss" type="button" title="Dismiss" aria-label="Dismiss">×</button>
      </div>
    </div>\`;
  }
  const matches = (it) => (view.kind === 'all' || it.source === view.kind) && (!view.key || it.feedId === view.key) && (!view.q || (it.title + ' ' + it.feedTitle).toLowerCase().includes(view.q));
  function recount() {
    const w = {};
    for (const it of inboxItems) w[it.feedId] = (w[it.feedId] || 0) + 1;
    const changed = JSON.stringify(w) !== JSON.stringify(waitingBy);
    waitingBy = w;
    if (changed) renderSources();
  }
  function renderInbox() {
    const counts = { all: inboxItems.length, feed: 0, show: 0, mail: 0 };
    for (const it of inboxItems) counts[it.source] = (counts[it.source] || 0) + 1;
    const n = inboxItems.length;
    $('#inboxCount').textContent = n ? n.toLocaleString() + (n >= INBOX_CAP ? ' · full, the oldest fall off' : '') : '';
    // Fewer than a screenful needs no filters; they appear as the inbox grows, and stay while one is in use.
    $('#inboxTools').hidden = n < 8 && view.kind === 'all' && !view.q && !view.key;
    $$('#inboxKinds button').forEach((b) => {
      const k = b.dataset.kind, on = k === view.kind;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
      b.querySelector('span').textContent = counts[k] ? counts[k].toLocaleString() : '';
      b.hidden = k !== 'all' && !counts[k] && !on;
    });
    const list = inboxItems.filter(matches);
    const narrowed = view.kind !== 'all' || view.key || view.q;
    $('#inboxScope').hidden = !narrowed;
    const bulk = $('#bulk');
    disarm(bulk);
    if (narrowed) {
      $('#scopeText').textContent = list.length.toLocaleString() + ' ' + NOUN[view.kind][list.length === 1 ? 0 : 1] + (view.key ? ' from ' + view.title : '') + (view.q ? ' matching “' + view.q + '”' : '');
      bulk.hidden = list.length === 0;
      bulk.textContent = list.length === 1 ? 'dismiss it' : 'dismiss these ' + list.length.toLocaleString();
    }
    $('#inbox').innerHTML = list.length ? list.slice(0, inboxShown).map(inboxHtml).join('') : '<div class="empty">' + (n ? 'Nothing here matches.' : 'Nothing new. What your sources publish from now on lands here.') + '</div>';
    const left = list.length - inboxShown;
    $('#inboxMore').hidden = left <= 0;
    $('#inboxMore').textContent = 'show ' + Math.min(left, IPAGE) + ' more · ' + left.toLocaleString() + ' not shown';
  }
  async function loadInbox() {
    let items = null;
    try { items = await (await fetch('/api/inbox')).json(); } catch {}
    if (!Array.isArray(items)) return;
    inboxItems = items;
    recount();
    renderInbox();
  }
  function scope(key, title) {
    Object.assign(view, { kind: 'all', key, title, q: '' });
    $('#inboxFind').value = ''; inboxShown = IPAGE; $('#inboxErr').textContent = '';
    renderInbox();
  }
  document.addEventListener('kiku:scope', (e) => {
    scope(e.detail.key, e.detail.title);
    $('#inboxSec').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  $$('#inboxKinds button').forEach((b) => b.addEventListener('click', () => { view.kind = b.dataset.kind; inboxShown = IPAGE; renderInbox(); }));
  let findTimer = null;
  $('#inboxFind').addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(() => { view.q = $('#inboxFind').value.trim().toLowerCase(); inboxShown = IPAGE; renderInbox(); }, 120); });
  $('#scopeClear').addEventListener('click', () => scope('', ''));
  $('#inboxMore').addEventListener('click', () => { inboxShown += IPAGE; renderInbox(); });
  $('#bulk').addEventListener('click', async () => {
    const b = $('#bulk');
    const ids = inboxItems.filter(matches).map((it) => it.id);
    if (!ids.length) return;
    if (!arm(b, 'press again to dismiss ' + ids.length.toLocaleString(), 4000)) return;
    b.disabled = true;
    const inboxErr = $('#inboxErr');
    try {
      const r = await postJson('/api/inbox/dismiss', { ids });
      const gone = new Set(ids);
      inboxItems = inboxItems.filter((it) => !gone.has(it.id));
      scope('', '');
      inboxErr.textContent = r.dismissed.toLocaleString() + ' dismissed';
      inboxErr.classList.add('ok');
      setTimeout(() => { inboxErr.textContent = ''; inboxErr.classList.remove('ok'); }, 4000);
    } catch (e) { inboxErr.classList.remove('ok'); inboxErr.textContent = e.message; }
    finally { b.disabled = false; recount(); renderInbox(); }
  });
  $('#inbox').addEventListener('click', async (e) => {
    const row = e.target.closest('.item'); if (!row) return;
    const name = e.target.closest('.srcName');
    if (name) { e.preventDefault(); scope(name.dataset.key, name.dataset.title); return; }
    const id = row.dataset.id;
    if (e.target.closest('a.t')) return; // the article itself, in its own tab
    const verb = e.target.closest('.dismiss') ? 'dismiss' : e.target.closest('.see') ? 'see' : e.target.closest('.read') ? 'read' : (e.target.closest('.listen') || e.target.closest('span.t')) ? 'listen' : null;
    if (!verb) return;
    const inboxErr = $('#inboxErr');
    inboxErr.textContent = ''; inboxErr.classList.remove('ok');
    row.classList.add('leaving');
    try {
      const [r] = await Promise.all([
        postJson('/api/inbox/' + id + '/' + verb, verb === 'see' ? { sets: Number(store.get('kiku.sets') || 3) } : {}),
        new Promise((done) => setTimeout(done, 180)),
      ]);
      if (r.play) play({ id: r.play.id, file: r.play.file, title: r.play.title, by: r.play.by, art: r.play.art });
      inboxItems = inboxItems.filter((it) => it.id !== id);
      recount(); renderInbox();
    } catch (e) { row.classList.remove('leaving'); inboxErr.textContent = e.message; loadInbox(); }
    if (verb !== 'dismiss') poll(true);
  });

  // --- ?u= prefill (used by the Shortcut fallback) ---
  const params = new URLSearchParams(location.search);
  const pre = params.get('u') || params.get('url') || params.get('text');
  if (pre) { form.hidden = false; input.value = pre; history.replaceState(null, '', location.pathname); form.requestSubmit(); }

  loadLibrary();
  loadInbox();
  loadNotes();
  poll(false);
  setInterval(loadInbox, 60000);
})();
</script>
${THEME_JS}
</body>
</html>`;
}

type ReadProps = {
  title: string;
  author?: string;
  site?: string;
  sourceUrl?: string;
  paragraphs: string[];
  words: number;
};

/** A cleaned reading as a page. The same words Kokoro would speak, set for the eye instead. */
export function readPage(r: ReadProps): string {
  const by = [r.author, r.site].filter(Boolean).join(" · ");
  const minutes = Math.max(1, Math.round(r.words / 230));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${THEME_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
${THEME_METAS}
<meta name="referrer" content="no-referrer">
<link rel="icon" href="/cover.png">
<title>${esc(r.title)} · Kiku</title>
<style>
  ${BASE_CSS}
  body { padding: 0 20px 80px; }
  main { max-width: 640px; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 32px 0 48px; font-size: 12px; color: var(--ink-3); }
  .top a { text-decoration: none; color: var(--ink-2); }
  .top a:hover { color: var(--ink); }
  h1 { font: 500 20px/1.5 var(--mono); margin: 0 0 8px; }
  .by { font-size: 12px; line-height: 1.7; color: var(--ink-3); margin: 0 0 40px; overflow-wrap: anywhere; }
  .by a { color: inherit; }
  article p { font-size: 15px; line-height: 1.8; margin: 0 0 1.4em; }
</style>
</head>
<body>
<main>
  <div class="top"><a href="/">← kiku</a><span class="htools"><span>${r.words.toLocaleString()} words · ${minutes} min</span>${THEME_BUTTON}</span></div>
  <h1>${esc(r.title)}</h1>
  <p class="by">${by ? esc(by) : ""}${r.sourceUrl ? `${by ? " · " : ""}<a href="${esc(r.sourceUrl)}" rel="noopener noreferrer">${esc(r.sourceUrl)}</a>` : ""}</p>
  <article>
${r.paragraphs.map((p) => `    <p>${esc(p)}</p>`).join("\n")}
  </article>
</main>
${THEME_JS}
</body>
</html>`;
}
