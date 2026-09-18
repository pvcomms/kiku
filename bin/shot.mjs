#!/usr/bin/env node
// shot.mjs — render the page for the README screenshot (docs/img/kiku.png) with headless Chromium.
// Point it at a second kiku instance seeded with synthetic entries (KIKU_HOME=$(mktemp -d),
// another KIKU_PORT), never at your real library. Playwright is not a dependency of this repo:
// set PLAYWRIGHT to an existing install that has its browsers, for example
//   PLAYWRIGHT=/path/to/some-project/node_modules/playwright node bin/shot.mjs http://127.0.0.1:4749/
import path from "node:path";
import { pathToFileURL } from "node:url";

const pw = process.env.PLAYWRIGHT;
if (!pw) { console.error("set PLAYWRIGHT to a playwright package directory"); process.exit(1); }
const { chromium } = await import(pathToFileURL(path.join(pw, "index.mjs")).href);
const [url = "http://127.0.0.1:4749/", out = "docs/img/kiku.png"] = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1200); // let the entrance animations finish
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
