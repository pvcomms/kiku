// The one page. Warm paper, New York serif, no external requests of any kind.
import type { Voice } from "./tts.ts";

type PageProps = {
  voices: Voice[];
  defaultVoice: string;
  hosts: string[];
  /** No sources yet: show the setup page instead of the inbox. */
  setup: boolean;
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

/** Fonts, palette and the base rules, shared by the page and the read view. */
const BASE_CSS = `
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
  body { margin: 0; font-family: var(--sans); font-size: 16px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
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
  .wordmark a { text-decoration: none; }
  .wordmark span { color: var(--ink-3); font-weight: 400; font-size: 22px; margin-left: 10px; letter-spacing: 0; font-family: var(--sans); }
  footer { padding: 56px 0 20px; font: 12px/1.6 var(--mono); color: var(--ink-3); }
`;

const ICON = {
  play: `<svg viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z" fill="currentColor"/></svg>`,
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
}: PageProps): string {
  const voiceOptions = voices
    .map(
      (v) =>
        `<option value="${v.id}"${v.id === defaultVoice ? " selected" : ""}>${esc(v.name)} — ${esc(v.note)}</option>`,
    )
    .join("");
  const hostsJson = JSON.stringify(hosts);

  const sources = `
  <section class="rise" id="sources">
    <h2>Sources <small id="sourceCount"></small></h2>
    <form class="feedbox" id="addForm" autocomplete="off">
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

    <form class="feedbox" id="mailForm" autocomplete="off" style="margin-top:16px">
      <p>A mailbox, for the newsletters that only arrive by mail — every paid Substack among them. Read over IMAP from this machine; the password goes in <code>~/Kiku/accounts.json</code> and is never shown again.</p>
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

    <div id="mailList"></div>
    <div id="shows"></div>
    <div id="feedsList"></div>
  </section>`;

  const phone = `
  <section class="rise">
    <h2>On your phone</h2>
    <div class="feedbox">
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
    <div class="feedbox"><p>That is a source. <a href="/">Open the inbox.</a></p></div>
  </section>`
    : `
  <p class="lede rise">What you subscribed to, and nothing else. Listen to it, see it, or read it.</p>
  <div class="ready rise" id="ready" hidden role="status"></div>

  <form class="compose rise" id="compose" autocomplete="off">
    <textarea id="input" name="input" placeholder="or paste a link, a file, or the words themselves" spellcheck="false" aria-label="Link or text"></textarea>
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

  <section class="rise">
    <h2>Inbox <small id="inboxCount"></small></h2>
    <div id="inbox"><div class="empty">Nothing new. What your sources publish from now on lands here.</div></div>
  </section>

  <section class="rise">
    <h2>Library <small id="count"></small></h2>
    <div id="library"><div class="empty">Nothing yet.</div></div>
  </section>
  ${sources}
  ${phone}`;

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
  ${BASE_CSS}
  body { padding: 0 20px calc(140px + env(safe-area-inset-bottom)); }
  .status { font: 12px/1 var(--mono); color: var(--ink-2); letter-spacing: 0.02em; display: inline-flex; align-items: center; gap: 8px; }
  .status i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); display: inline-block; }
  .status i.busy { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.25; } }
  .lede { color: var(--ink-2); margin: 0 0 28px; font-family: var(--display); font-size: 22px; line-height: 1.35; letter-spacing: -0.005em; }

  .compose { border: 1px solid var(--line); border-radius: 12px; background: var(--paper-2); padding: 8px; transition: border-color 200ms var(--ease), box-shadow 200ms var(--ease); }
  .compose.drag { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(181,84,45,0.12); }
  textarea {
    width: 100%; min-height: 96px; resize: vertical; border: 0; background: transparent; color: var(--ink);
    font: 17px/1.55 var(--sans); padding: 12px 12px 4px; display: block;
  }
  textarea::placeholder { color: var(--ink-3); }
  textarea:focus { outline: none; }
  .compose:focus-within { border-color: var(--ink-3); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 6px 4px 4px; }
  .row .grow { flex: 1 1 auto; }
  .row[hidden] { display: none; }
  select, .btn, .btn-2 {
    height: 44px; border-radius: 6px; font-family: var(--sans); font-size: 15px; font-weight: 500; cursor: pointer;
    transition: transform 160ms var(--ease), background-color 160ms var(--ease), color 160ms var(--ease), border-color 160ms var(--ease);
  }
  select { border: 1px solid var(--line); background: var(--paper); color: var(--ink); padding: 0 32px 0 12px; appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%236B665E' stroke-width='1.5'/></svg>"); background-repeat: no-repeat; background-position: right 12px center; max-width: 100%; }
  select.speed { width: 84px; }
  select.kind { height: 40px; font-size: 14px; }
  select.sets { width: 96px; }
  .seg { display: inline-flex; height: 44px; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; background: var(--paper); }
  .seg button { border: 0; background: transparent; color: var(--ink-2); font: 500 15px var(--sans); padding: 0 14px; cursor: pointer; transition: background-color 160ms var(--ease), color 160ms var(--ease); }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button:hover { color: var(--ink); }
  .seg button.on { background: var(--ink); color: var(--paper); }
  .seg button:focus-visible { outline-offset: -3px; }
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
  .err.ok { color: var(--ink-2); }

  section { padding-top: 48px; }
  h2 { font: 12px/1 var(--mono); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-2); margin: 0 0 14px; font-weight: 500; display: flex; justify-content: space-between; align-items: baseline; }
  h2 small { letter-spacing: 0; text-transform: none; color: var(--ink-3); }
  h3 { font: 12px/1 var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); margin: 28px 0 6px; font-weight: 500; }
  .empty { color: var(--ink-3); font-style: italic; padding: 8px 0 0; }

  .job { padding: 14px 0; border-top: 1px solid var(--line); }
  .job:last-child { border-bottom: 1px solid var(--line); }
  .job .t { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--display); font-size: 20px; line-height: 1.3; }
  .job .m { font: 12px/1.4 var(--mono); color: var(--ink-2); margin-top: 4px; display: flex; justify-content: space-between; gap: 12px; }
  .bar { height: 2px; background: var(--line); margin-top: 10px; overflow: hidden; border-radius: 1px; }
  .bar b { display: block; height: 100%; width: 100%; background: var(--accent); transform-origin: left; transform: scaleX(0); transition: transform 700ms var(--ease); }
  .job.error .t { color: var(--accent); }
  .job.error .m { color: var(--accent); }
  .job .m .acts { display: inline-flex; gap: 6px; flex: none; }
  .job .m button { font: 12px/1 var(--mono); color: var(--ink); background: var(--paper-2); border: 1px solid var(--line); border-radius: 4px; padding: 5px 9px; cursor: pointer; transition: transform 160ms var(--ease), background-color 160ms var(--ease), border-color 160ms var(--ease); }
  .job .m button:hover { background: var(--paper-3); border-color: var(--ink-3); }
  .job .m button:active { transform: scale(0.98); }

  .ready { margin: -12px 0 28px; padding: 12px 14px; border: 1px solid var(--accent); border-radius: 8px; font: 12px/1.7 var(--mono); color: var(--accent); }
  .ready.soft { border-color: var(--line); }
  .ready .soft { color: var(--ink-2); }
  .ready div + div { margin-top: 6px; }
  .ready code { display: block; color: var(--ink); user-select: all; white-space: pre-wrap; word-break: break-word; }
  .item .pd { color: var(--ink-3); }

  .item { display: grid; grid-template-columns: 40px 1fr auto; gap: 14px; align-items: center; padding: 14px 6px; margin: 0 -6px; border-top: 1px solid var(--line); border-radius: 8px; transition: background-color 160ms var(--ease); }
  .item:last-child { border-bottom: 1px solid var(--line); }
  .item:hover { background: var(--paper-2); }
  .item.playing .t { color: var(--accent); }
  .play { width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--line); background: var(--paper); color: var(--ink); display: grid; place-items: center; cursor: pointer; padding: 0; transition: transform 160ms var(--ease), background-color 160ms var(--ease), color 160ms var(--ease), border-color 160ms var(--ease); text-decoration: none; }
  .play:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .play:active { transform: scale(0.94); }
  .play svg { width: 14px; height: 14px; display: block; }
  .item .body { min-width: 0; cursor: pointer; }
  .item .t { display: block; font-family: var(--display); font-size: 21px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .m { font: 12px/1.4 var(--mono); color: var(--ink-2); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .m .done { color: var(--accent); }
  .item .m .src { color: var(--ink-3); }
  .more { display: flex; gap: 2px; }
  .icon { width: 34px; height: 34px; border: 0; background: transparent; color: var(--ink-3); border-radius: 6px; cursor: pointer; display: grid; place-items: center; transition: color 160ms var(--ease), background-color 160ms var(--ease); text-decoration: none; }
  .icon:hover { color: var(--ink); background: var(--paper-3); }
  .icon svg { width: 16px; height: 16px; }
  .icon[hidden] { display: none; }

  .feedbox { border: 1px solid var(--line); border-radius: 10px; background: var(--paper-2); padding: 16px; }
  .feedbox p { margin: 0 0 10px; color: var(--ink-2); font-size: 15px; }
  .feedbox p:last-child { margin: 0; }
  .feedbox code { font: 13px var(--mono); }
  .url { display: flex; gap: 8px; align-items: center; margin: 12px 0; }
  .url code { flex: 1; font: 13px/1.4 var(--mono); background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .url .btn-2 { height: 40px; }
  ol { padding-left: 20px; margin: 6px 0 0; color: var(--ink-2); font-size: 15px; }
  ol li { margin: 4px 0; }
  .alts { font: 12px/1.6 var(--mono); color: var(--ink-3); margin-top: 12px; }
  .ways { margin-top: 4px; }
  .ways summary { font: 13px var(--sans); color: var(--ink-2); cursor: pointer; padding: 6px 0; }
  .ways summary:hover { color: var(--ink); }
  .ways textarea { border: 1px solid var(--line); border-radius: 6px; background: var(--paper); font: 13px/1.5 var(--mono); min-height: 88px; margin: 8px 0 4px; padding: 10px 12px; }
  .check { font-size: 14px; color: var(--ink-2); display: inline-flex; align-items: center; gap: 6px; }

  .text { height: 44px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); font: 15px var(--sans); padding: 0 12px; min-width: 0; }
  .text::placeholder { color: var(--ink-3); }
  .text:focus { outline: none; border-color: var(--ink-3); }
  .url .text { flex: 1; }
  .show-head { display: flex; align-items: center; gap: 12px; padding: 14px 6px; margin: 0 -6px; border-top: 1px solid var(--line); border-radius: 8px; cursor: pointer; transition: background-color 160ms var(--ease); }
  .show:last-child .show-head { border-bottom: 1px solid var(--line); }
  .show-head:hover { background: var(--paper-2); }
  .show-head .art { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; background: var(--paper-3); flex-shrink: 0; }
  .show-head .t { flex: 1; font-family: var(--display); font-size: 21px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .episodes .item:first-child { border-top: none; }

  .feed-row { display: flex; align-items: center; gap: 12px; padding: 14px 6px; margin: 0 -6px; border-top: 1px solid var(--line); border-radius: 8px; transition: background-color 160ms var(--ease); }
  .feed-row:last-child { border-bottom: 1px solid var(--line); }
  .feed-row:hover { background: var(--paper-2); }
  .feed-row .body { flex: 1 1 auto; min-width: 0; }
  .feed-row .t { display: block; font-family: var(--display); font-size: 21px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .feed-row .m { font: 12px/1.4 var(--mono); color: var(--ink-2); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .feed-row .m.error { color: var(--accent); }

  .player { position: fixed; left: 0; right: 0; bottom: 0; background: color-mix(in srgb, var(--paper-2) 88%, transparent); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-top: 1px solid var(--line); padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); transform: translateY(110%); transition: transform 500ms var(--ease); }
  .player.on { transform: none; }
  .player .in { max-width: 620px; margin: 0 auto; }
  .player .prow { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
  .player .t { display: block; font-family: var(--display); font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .player audio { width: 100%; display: block; height: 40px; }
  .speedBtn { height: 26px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper); color: var(--ink-2); font: 12px/1 var(--mono); cursor: pointer; flex-shrink: 0; transition: background-color 160ms var(--ease), color 160ms var(--ease), border-color 160ms var(--ease); }
  .speedBtn:hover { color: var(--ink); border-color: var(--ink-3); }
  .speedBtn:active { transform: scale(0.96); }
  @media (max-width: 480px) { .wordmark { font-size: 40px; } .lede { font-size: 20px; } .item { gap: 12px; } .item .t { font-size: 19px; } }
</style>
</head>
<body>
<main>
  <header class="rise">
    <h1 class="wordmark"><a href="/">kiku</a> <span>聞く</span></h1>
    <span class="status" id="status"><i></i><span id="statusText">${setup ? "setup" : "studio"}</span></span>
  </header>
  ${body}
  <footer>everything stays on this machine · kokoro-82m via mlx · ~/Kiku</footer>
</main>

<div class="player" id="player">
  <div class="in">
    <div class="prow">
      <span class="t" id="playerTitle"></span>
      <button class="speedBtn" id="speedBtn" type="button" title="Playback speed">1×</button>
    </div>
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
  function play(d) {
    if (current === d.id) { audio.paused ? audio.play() : audio.pause(); return; }
    current = d.id;
    const isExternal = d.file.startsWith('http://') || d.file.startsWith('https://');
    audio.src = isExternal ? d.file : '/audio/' + encodeURIComponent(d.file);
    audio.playbackRate = speed;
    $('#playerTitle').textContent = d.title;
    player.classList.add('on');
    let pos = Number(store.get('kiku.pos.' + d.id) || 0);
    fetch('/api/positions').then((r) => r.json()).then((p) => { const sp = Number(p[d.id]?.seconds || 0); if (sp > pos) { pos = sp; if (audio.readyState >= 1 && audio.currentTime < 5 && pos < audio.duration - 10) audio.currentTime = pos; } }).catch(() => {});
    audio.addEventListener('loadedmetadata', () => { if (pos > 5 && pos < audio.duration - 10) audio.currentTime = pos; }, { once: true });
    audio.play().catch(() => {});
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: d.title, artist: d.by || 'Kiku', album: 'Kiku', artwork: [{ src: d.art || '/cover.png', sizes: '1400x1400', type: 'image/png' }] });
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
  audio.addEventListener('ended', () => { if (current) { store.set('kiku.pos.' + current, String(Math.floor(audio.duration))); push(current, Math.floor(audio.duration)); } if (!SETUP) loadLibrary(); });

  // --- sources: shows, feeds, mailboxes; one add box, one import box, one mailbox form ---
  function showHtml(s) {
    const status = s.lastError ? 'error: ' + s.lastError : s.lastPolled ? 'checked ' + day(s.lastPolled) : 'not checked yet';
    return \`<div class="show" data-id="\${s.id}" data-title="\${esc(s.title)}">
      <div class="show-head">
        \${s.artworkUrl ? '<img class="art" src="' + esc(s.artworkUrl) + '" alt="">' : '<span class="art"></span>'}
        <span class="t">\${esc(s.title)}</span>
        <span class="m\${s.lastError ? ' error' : ''}" style="font:12px var(--mono);color:var(--ink-3)">\${esc(status)}</span>
        <button class="icon unsub" type="button" title="Unsubscribe">\${ICON.x}</button>
      </div>
      <div class="episodes" hidden></div>
    </div>\`;
  }
  function episodeHtml(show, ep) {
    return \`<div class="item\${current === ep.id ? ' playing' : ''}" data-id="\${ep.id}" data-file="\${esc(ep.enclosureUrl)}" data-title="\${esc(ep.title)}" data-by="\${esc(show.title)}" data-art="\${esc(show.artworkUrl || '')}">
      <button class="play" type="button" aria-label="Play">\${ICON.play}</button>
      <div class="body">
        <span class="t">\${esc(ep.title)}</span>
        <span class="m">\${ep.seconds ? fmt(ep.seconds) + ' · ' : ''}\${day(ep.pubDate)}</span>
      </div>
    </div>\`;
  }
  function feedRowHtml(f) {
    const status = f.lastError ? 'error: ' + f.lastError : f.lastPolled ? 'checked ' + day(f.lastPolled) : 'not checked yet';
    return \`<div class="feed-row" data-id="\${f.id}" data-title="\${esc(f.title)}">
      <div class="body">
        <span class="t">\${esc(f.title)}</span>
        <span class="m\${f.lastError ? ' error' : ''}">\${esc(status)}</span>
      </div>
      <button class="icon unsub" type="button" title="Unsubscribe">\${ICON.x}</button>
    </div>\`;
  }
  function mailRowHtml(a) {
    const status = a.lastError ? 'error: ' + a.lastError : a.lastSynced ? 'checked ' + day(a.lastSynced) : 'not checked yet';
    return \`<div class="feed-row" data-name="\${esc(a.name)}">
      <div class="body">
        <span class="t">\${esc(a.user)}</span>
        <span class="m\${a.lastError ? ' error' : ''}">\${esc(a.name)} · \${esc(a.host)}:\${a.port} · \${esc(status)}</span>
      </div>
      <button class="icon unsub" type="button" title="Remove mailbox">\${ICON.x}</button>
    </div>\`;
  }
  async function loadSources() {
    let s = { feeds: [], shows: [], mail: [] };
    try { s = await (await fetch('/api/sources')).json(); } catch {}
    const n = s.feeds.length + s.shows.length + s.mail.length;
    $('#sourceCount').textContent = n ? [s.feeds.length ? s.feeds.length + ' feeds' : '', s.shows.length ? s.shows.length + ' shows' : '', s.mail.length ? s.mail.length + (s.mail.length === 1 ? ' mailbox' : ' mailboxes') : ''].filter(Boolean).join(' · ') : '';
    $('#mailList').innerHTML = s.mail.length ? '<h3>Mailboxes</h3>' + s.mail.map(mailRowHtml).join('') : '';
    $('#shows').innerHTML = s.shows.length ? '<h3>Shows</h3>' + s.shows.map(showHtml).join('') : '';
    $('#feedsList').innerHTML = s.feeds.length ? '<h3>Feeds</h3>' + s.feeds.map(feedRowHtml).join('') : '';
    if (SETUP && n > 0) $('#setupDone').hidden = false;
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
      loadSources();
      setTimeout(loadSources, 8000);
    } catch (e) { mailErr.textContent = e.message; }
  });
  $('#mailList').addEventListener('click', async (e) => {
    const unsub = e.target.closest('.unsub'); if (!unsub) return;
    const row = e.target.closest('.feed-row');
    if (!confirm('Remove the mailbox "' + row.dataset.name + '"? Its waiting letters go with it.')) return;
    await fetch('/api/sources/mail/' + encodeURIComponent(row.dataset.name), { method: 'DELETE' });
    loadSources(); if (!SETUP) loadInbox();
  });
  $('#shows').addEventListener('click', async (e) => {
    const unsub = e.target.closest('.unsub');
    if (unsub) {
      const show = e.target.closest('.show');
      if (!confirm('Unsubscribe from "' + show.dataset.title + '"?')) return;
      await fetch('/api/podcasts/' + show.dataset.id, { method: 'DELETE' });
      loadSources(); if (!SETUP) loadInbox();
      return;
    }
    const epRow = e.target.closest('.item');
    if (epRow) { play(epRow.dataset); return; }
    const head = e.target.closest('.show-head');
    if (head) {
      const show = head.closest('.show');
      const panel = show.querySelector('.episodes');
      const opening = panel.hidden;
      panel.hidden = !opening;
      if (opening && !panel.dataset.loaded) {
        panel.innerHTML = '<div class="empty">Loading…</div>';
        try {
          const d = await (await fetch('/api/podcasts/' + show.dataset.id + '/episodes')).json();
          if (!d.episodes) throw new Error(d.error || 'Could not load episodes.');
          panel.dataset.loaded = '1';
          panel.innerHTML = d.episodes.length ? d.episodes.map((ep) => episodeHtml(d.show, ep)).join('') : '<div class="empty">No episodes found.</div>';
        } catch (e) { panel.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
      }
    }
  });
  $('#feedsList').addEventListener('click', async (e) => {
    const unsub = e.target.closest('.unsub'); if (!unsub) return;
    const row = e.target.closest('.feed-row');
    if (!confirm('Unsubscribe from "' + row.dataset.title + '"?')) return;
    await fetch('/api/feeds/' + row.dataset.id, { method: 'DELETE' });
    loadSources(); if (!SETUP) loadInbox();
  });

  // --- readiness (one line, only when something this machine needs is missing) ---
  async function checkReady() {
    let report = null;
    try { report = await (await fetch('/health')).json(); } catch { return; }
    const bad = (report.checks || []).filter((c) => !c.ok);
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
    $('#status i').className = active.length ? 'busy' : '';
    $('#statusText').textContent = active.length ? 'making' : 'studio';
    const doneNow = jobs.some((j) => j.status === 'done' && Date.now() - new Date(j.updatedAt) < 4000);
    if (doneNow || fast) loadLibrary();
    pollTimer = setTimeout(() => poll(false), active.length ? 1500 : 8000);
  }

  // --- library ---
  async function loadLibrary() {
    let items = [];
    let serverPos = {};
    try { const d = await (await fetch('/api/library')).json(); items = d.items; serverPos = d.positions || {}; } catch {}
    const heard = items.filter((it) => !it.kind || it.kind === 'audio').length, drawn = items.filter((it) => it.kind === 'artifact').length, texts = items.filter((it) => it.kind === 'text').length;
    $('#count').textContent = [heard ? heard + (heard === 1 ? ' reading' : ' readings') : '', drawn ? drawn + ' drawn' : '', texts ? texts + ' to read' : ''].filter(Boolean).join(' · ');
    if (!items.length) { $('#library').innerHTML = '<div class="empty">Nothing yet.</div>'; return; }
    $('#library').innerHTML = items.map((it) => {
      const pos = Math.max(Number(store.get('kiku.pos.' + it.id) || 0), Number(serverPos[it.id]?.seconds || 0));
      const done = pos > 0 && it.seconds - pos < 20;
      const by = [it.author, it.site].filter(Boolean).join(' · ');
      if (it.kind === 'artifact') {
        const href = '/artifacts/' + encodeURIComponent(it.file);
        return \`<div class="item art" data-id="\${it.id}" data-href="\${href}" data-title="\${esc(it.title)}">
        <a class="play" href="\${href}" target="_blank" rel="noopener" aria-label="Open">\${ICON.see}</a>
        <div class="body">
          <span class="t">\${esc(it.title)}</span>
          <span class="m">\${by ? esc(by) + ' · ' : ''}\${it.sets || 3} sets · drawn here by \${esc(it.model || 'a local model')} · \${day(it.createdAt)}\${it.exportedAt ? ' · <span class="pd" title="A copy is in Proton Drive">proton</span>' : ''}</span>
        </div>
        <div class="more">
          <a class="icon" href="\${href}" download title="Download html">\${ICON.down}</a>
          <button class="icon del" type="button" title="Remove">\${ICON.x}</button>
        </div>
      </div>\`;
      }
      if (it.kind === 'text') {
        const href = '/read/' + encodeURIComponent(it.id);
        return \`<div class="item art" data-id="\${it.id}" data-href="\${href}" data-title="\${esc(it.title)}">
        <a class="play" href="\${href}" aria-label="Read">\${ICON.read}</a>
        <div class="body">
          <span class="t">\${esc(it.title)}</span>
          <span class="m">\${by ? esc(by) + ' · ' : ''}\${(it.words || 0).toLocaleString()} words · \${Math.max(1, Math.round((it.words || 0) / 230))} min · \${day(it.createdAt)}</span>
        </div>
        <div class="more">
          <button class="icon del" type="button" title="Remove">\${ICON.x}</button>
        </div>
      </div>\`;
      }
      return \`<div class="item\${current === it.id ? ' playing' : ''}" data-id="\${it.id}" data-file="\${esc(it.file)}" data-title="\${esc(it.title)}" data-by="\${esc(by)}">
        <button class="play" type="button" aria-label="Play">\${ICON.play}</button>
        <div class="body">
          <span class="t">\${esc(it.title)}</span>
          <span class="m">\${by ? esc(by) + ' · ' : ''}\${fmt(it.seconds)} · \${day(it.createdAt)}\${done ? ' · <span class="done">finished</span>' : pos > 30 ? ' · at ' + fmt(pos) : ''}\${it.exportedAt ? ' · <span class="pd" title="A copy is in Proton Drive">proton</span>' : ''}</span>
        </div>
        <div class="more">
          <a class="icon" href="/read/\${encodeURIComponent(it.id)}" title="Read the text">\${ICON.read}</a>
          <a class="icon" href="/audio/\${encodeURIComponent(it.file)}" download title="Download mp3">\${ICON.down}</a>
          <button class="icon del" type="button" title="Remove">\${ICON.x}</button>
        </div>
      </div>\`;
    }).join('');
  }
  $('#library').addEventListener('click', async (e) => {
    const row = e.target.closest('.item'); if (!row) return;
    if (e.target.closest('a.icon')) return;
    if (e.target.closest('.del')) {
      if (!confirm('Remove "' + row.dataset.title + '"?')) return;
      await fetch('/api/library/' + row.dataset.id, { method: 'DELETE' });
      if (current === row.dataset.id) { audio.pause(); player.classList.remove('on'); current = null; }
      loadLibrary(); return;
    }
    if (row.classList.contains('art')) {
      if (e.target.closest('.body')) window.open(row.dataset.href, row.dataset.href.startsWith('/read/') ? '_self' : '_blank', 'noopener');
      return;
    }
    if (e.target.closest('.play') || e.target.closest('.body')) play(row.dataset);
  });

  // --- inbox: what the sources published since you subscribed, waiting for one of four verbs ---
  const SRC = { feed: 'feed', show: 'episode', mail: 'letter' };
  function inboxHtml(it) {
    const isShow = it.source === 'show';
    return \`<div class="item\${current === it.id ? ' playing' : ''}" data-id="\${it.id}" data-source="\${it.source}">
      <button class="play listen" type="button" aria-label="Listen" title="\${isShow ? 'Play' : 'Read it to me'}">\${ICON.play}</button>
      <div class="body" title="Listen">
        <span class="t">\${esc(it.title)}</span>
        <span class="m"><span class="src">\${SRC[it.source] || it.source}</span> · \${esc(it.feedTitle)} · \${day(it.pubDate)}\${it.seconds ? ' · ' + fmt(it.seconds) : ''}</span>
      </div>
      <div class="more">
        <button class="icon see" type="button" title="Draw it as sets"\${isShow ? ' hidden' : ''}>\${ICON.see}</button>
        <button class="icon read" type="button" title="\${isShow ? 'Read the show notes' : 'Clean it to read'}">\${ICON.read}</button>
        <button class="icon dismiss" type="button" title="Dismiss">\${ICON.x}</button>
      </div>
    </div>\`;
  }
  async function loadInbox() {
    let items = [];
    try { items = await (await fetch('/api/inbox')).json(); } catch {}
    $('#inboxCount').textContent = items.length ? String(items.length) : '';
    $('#inbox').innerHTML = items.length ? items.map(inboxHtml).join('') : '<div class="empty">Nothing new. What your sources publish from now on lands here.</div>';
  }
  $('#inbox').addEventListener('click', async (e) => {
    const row = e.target.closest('.item'); if (!row) return;
    const id = row.dataset.id;
    const verb = e.target.closest('.dismiss') ? 'dismiss' : e.target.closest('.see') ? 'see' : e.target.closest('.read') ? 'read' : (e.target.closest('.listen') || e.target.closest('.body')) ? 'listen' : null;
    if (!verb) return;
    try {
      const r = await postJson('/api/inbox/' + id + '/' + verb, verb === 'see' ? { sets: Number(store.get('kiku.sets') || 3) } : {});
      if (r.play) play({ id: r.play.id, file: r.play.file, title: r.play.title, by: r.play.by, art: r.play.art });
    } catch (e) { err.textContent = e.message; }
    loadInbox();
    if (verb !== 'dismiss') poll(true);
  });

  // --- ?u= prefill (used by the Shortcut fallback) ---
  const params = new URLSearchParams(location.search);
  const pre = params.get('u') || params.get('url') || params.get('text');
  if (pre) { input.value = pre; history.replaceState(null, '', location.pathname); form.requestSubmit(); }

  loadLibrary();
  loadInbox();
  poll(false);
  setInterval(loadInbox, 60000);
})();
</script>
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
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="no-referrer">
<link rel="icon" href="/cover.png">
<title>${esc(r.title)} · Kiku</title>
<style>
  ${BASE_CSS}
  body { padding: 0 20px 80px; }
  main { max-width: 640px; }
  .top { display: flex; justify-content: space-between; align-items: baseline; padding: 32px 0 40px; font: 12px/1 var(--mono); color: var(--ink-3); }
  .top a { text-decoration: none; color: var(--ink-2); }
  .top a:hover { color: var(--ink); }
  h1 { font-family: var(--display); font-weight: 400; font-size: 40px; line-height: 1.1; letter-spacing: -0.015em; margin: 0 0 12px; }
  .by { font: 13px/1.6 var(--mono); color: var(--ink-2); margin: 0 0 40px; }
  .by a { color: inherit; }
  article p { font-family: var(--display); font-size: 21px; line-height: 1.5; margin: 0 0 1.1em; }
  article p:first-of-type::first-letter { font-size: 1.6em; line-height: 1; padding-right: 2px; }
  .end { margin-top: 56px; font: 12px/1.6 var(--mono); color: var(--ink-3); }
  @media (max-width: 480px) { h1 { font-size: 32px; } article p { font-size: 19px; } }
</style>
</head>
<body>
<main>
  <div class="top"><a href="/">← kiku</a><span>${r.words.toLocaleString()} words · ${minutes} min</span></div>
  <h1>${esc(r.title)}</h1>
  <p class="by">${by ? esc(by) : ""}${r.sourceUrl ? `${by ? " · " : ""}<a href="${esc(r.sourceUrl)}" rel="noopener noreferrer">${esc(r.sourceUrl)}</a>` : ""}</p>
  <article>
${r.paragraphs.map((p) => `    <p>${esc(p)}</p>`).join("\n")}
  </article>
  <div class="end">read on this machine · nothing was fetched to show this page</div>
</main>
</body>
</html>`;
}
