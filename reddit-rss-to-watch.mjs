#!/usr/bin/env node
// reddit-rss-to-watch: turn Reddit .rss addresses into SocialToAI watches, each with its own private feed address.
//
//   node reddit-rss-to-watch.mjs https://www.reddit.com/r/selfhosted/new/.rss
//   node reddit-rss-to-watch.mjs --opml reader-export.opml
//   node reddit-rss-to-watch.mjs --file feeds.txt --apply --out new-feeds.opml
//
// Without --apply it only prints the plan: no key needed, nothing sent.
// The API key comes only from the environment variable SOCIALTOAI_API_KEY and only goes in a request header.
// Zero dependencies, Node 18+. MIT licence. Published by the SocialToAI team.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_API = "https://api.socialtoai.com/v1";
const CREDITS_PER_RUN = 2; // reddit.search, reddit.subreddit_posts, reddit.user_posts, reddit.comments on 2026-11-05
const USD_PER_CREDIT = 10 / 3000; // the $10 pack

/** A Reddit feed address as a plan, or { unsupported: why }. Never keeps the query string of a private feed. */
export function parseFeed(raw) {
  const original = String(raw).trim();
  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(original) ? original : `https://${original}`);
  } catch {
    return { source: original, unsupported: "not an address" };
  }
  const host = url.hostname.toLowerCase();
  if (host !== "reddit.com" && !host.endsWith(".reddit.com")) return { source: original, unsupported: "not a Reddit address" };
  const shown = `${url.origin}${url.pathname}`; // what is safe to print
  if (url.searchParams.has("feed") || url.searchParams.has("user")) {
    return { source: shown, unsupported: "a private feed of your own account: it stays with Reddit (the token in it was not printed or stored)" };
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\/\.rss$/, "").replace(/\.rss$/, "");
  const parts = path.split("/").filter(Boolean);
  const q = url.searchParams;

  if (parts.length === 0) return { source: shown, unsupported: "the front page depends on your account" };

  if (parts[0] === "search") return searchPlan(shown, q.get("q"), q);

  if (parts[0] === "r" && parts[1]) {
    const communities = parts[1].split("+").filter(Boolean);
    const rest = parts.slice(2);
    if (rest[0] === "search") {
      if (q.get("restrict_sr") === "on" || q.get("restrict_sr") === "1" || q.get("restrict_sr") === "true") {
        return { source: shown, unsupported: `search inside r/${parts[1]}: a watch has no subreddit filter on search. Watch the subreddit, or pass --broaden to search all of Reddit for the same words` , broadenable: searchPlan(shown, q.get("q"), q) };
      }
      return searchPlan(shown, q.get("q"), q);
    }
    if (rest[0] === "comments" && rest[1]) {
      return plan(shown, `Comments on a post in r/${communities[0]}`, { action: "comments", input: { platform: "reddit", url: `https://www.reddit.com/r/${communities[0]}/comments/${rest[1]}/`, sort: "latest" } });
    }
    if (rest[0] === "comments") return { source: shown, unsupported: "all the comments of a subreddit: there is no such call. Watch its posts, or the comments of one post" };
    const sorts = { undefined: "hot", hot: "hot", new: "latest", top: "popular" };
    if (!(rest[0] in sorts) && rest.length > 0) return { source: shown, unsupported: `the /${rest[0]} listing is not offered. hot, new and top are` };
    const sort = sorts[rest[0]];
    return communities.map((id) => plan(shown, `r/${id} (${rest[0] ?? "hot"})`, { op: "reddit.subreddit_posts", input: { id, sort } }));
  }

  if ((parts[0] === "user" || parts[0] === "u") && parts[1]) {
    const tail = parts[2];
    if (tail === undefined || tail === "submitted") return plan(shown, `u/${parts[1]}`, { action: "user_posts", input: { platform: "reddit", username: parts[1] } });
    return { source: shown, unsupported: `a user's /${tail} listing is not offered. Their posts are` };
  }

  return { source: shown, unsupported: "this kind of Reddit feed has no matching call" };
}

function searchPlan(shown, query, q) {
  if (!query) return { source: shown, unsupported: "a search feed without a q= term" };
  const sorts = { relevance: "relevance", new: "latest", top: "popular" };
  const within = { day: "day", week: "week", month: "month", year: "year" };
  const input = { platform: "reddit", query };
  if (sorts[q.get("sort")]) input.sort = sorts[q.get("sort")];
  else input.sort = "latest"; // a feed reader wants what is new
  if (within[q.get("t")]) input.published_within = within[q.get("t")];
  return plan(shown, `Search: ${query}`, { action: "search", input });
}

function plan(source, name, call) {
  return { source, name: name.slice(0, 80), ...call };
}

/** Every xmlUrl in an OPML export, and which of them are Reddit's. */
export function feedsFromOpml(text) {
  const out = [];
  for (const m of text.matchAll(/xmlUrl\s*=\s*("([^"]*)"|'([^']*)')/gi)) out.push(decodeXml(m[2] ?? m[3]));
  return out;
}

function decodeXml(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function encodeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function feedsFromList(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

/** The most a month of runs can cost: 31 daily runs, or 5 weekly ones. */
export function monthlyCap(count, frequency, creditsPerRun = CREDITS_PER_RUN) {
  return count * creditsPerRun * (frequency === "weekly" ? 5 : 31);
}

function sameCall(existing, wanted) {
  const a = { tool: existing.tool ?? null, action: existing.action ?? null, op: existing.op ?? null };
  const b = { tool: null, action: wanted.action ?? null, op: wanted.op ?? null };
  return a.tool === b.tool && a.action === b.action && a.op === b.op && stable(existing.input) === stable(wanted.input);
}

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${k}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export function parseArgs(argv) {
  const o = { inputs: [], file: null, opml: null, apply: false, broaden: false, frequency: "daily", weekday: 1, time: "09:00", timezone: null, email: false, maxCredits: 4, out: "new-feeds.opml", printFeeds: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--file") o.file = next();
    else if (a === "--opml") o.opml = next();
    else if (a === "--apply") o.apply = true;
    else if (a === "--broaden") o.broaden = true;
    else if (a === "--weekly") o.frequency = "weekly";
    else if (a === "--weekday") o.weekday = Number(next());
    else if (a === "--time") o.time = next();
    else if (a === "--timezone") o.timezone = next();
    else if (a === "--email") o.email = true;
    else if (a === "--max-credits") o.maxCredits = Number(next());
    else if (a === "--out") o.out = next();
    else if (a === "--print-feeds") o.printFeeds = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--api-key" || a === "--key") throw new Error("The key is read only from the environment variable SOCIALTOAI_API_KEY, so it stays out of your shell history.");
    else if (a.startsWith("--")) throw new Error(`Unknown option ${a}`);
    else o.inputs.push(a);
  }
  if (!/^\d\d:\d\d$/.test(o.time)) throw new Error("--time is HH:MM, 24-hour");
  if (!Number.isInteger(o.weekday) || o.weekday < 0 || o.weekday > 6) throw new Error("--weekday is 0 (Sunday) to 6 (Saturday)");
  if (!Number.isInteger(o.maxCredits) || o.maxCredits < 2) throw new Error("--max-credits is a whole number, 2 or more");
  return o;
}

const HELP = `reddit-rss-to-watch: Reddit .rss addresses -> SocialToAI watches with private feed addresses

  node reddit-rss-to-watch.mjs [address ...] [--file list.txt] [--opml export.opml] [options]

Without --apply it prints the plan and what it would cost. Nothing is sent.

  --apply            make the watches (needs SOCIALTOAI_API_KEY in the environment)
  --out FILE         OPML with the new feed addresses (default new-feeds.opml, readable by you only)
  --print-feeds      also print the new feed addresses
  --weekly           weekly instead of daily (--weekday 0-6, Sunday first; default Monday)
  --time HH:MM       default 09:00
  --timezone ZONE    an IANA zone; default this machine's
  --email            also email new items
  --max-credits N    the most one run may cost; default 4 (a run is 2 credits today)
  --broaden          search all of Reddit where a feed searched inside one subreddit
`;

async function api(base, key, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "reddit-rss-to-watch/1.0" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, retryAfter: Number(res.headers.get("retry-after")) || 0 };
}

/** What to tell a person about a refusal. Returns stop: true when the rest of the list would fail the same way. */
function explain(res) {
  const e = res.json?.error ?? {};
  switch (e.code) {
    case "unauthorized":
      return { stop: true, text: "The key is missing or not valid. Create one at https://socialtoai.com/console/keys/ (signing up gives 100 free credits, no card) and put it in SOCIALTOAI_API_KEY. Nothing was charged." };
    case "key_scope_denied":
      return { stop: true, text: "This key may not manage schedules. Turn that permission on in the key's settings at https://socialtoai.com/console/keys/ . Nothing was charged." };
    case "plan_limit":
      return { stop: true, text: "A free account keeps 1 watch. Buy credits at https://socialtoai.com/console/billing/ to keep up to 20, then run this again: what is already made is skipped. Nothing was charged." };
    case "insufficient_balance":
      return { stop: true, text: "The balance is too low. Buy credits at https://socialtoai.com/console/billing/ , then run this again: what is already made is skipped. Nothing was charged." };
    case "max_cost_exceeded":
      return { stop: false, text: `A run costs more than --max-credits (quoted ${res.json?.error?.quote_credits ?? "more"}). Raise it and run again. Nothing was charged.` };
    default:
      return { stop: false, text: `${e.code ?? `HTTP ${res.status}`}: ${e.message ?? "no details"}${e.fix?.note ? ` ${e.fix.note}` : ""}${res.json?.request_id ? ` (request ${res.json.request_id})` : ""}` };
  }
}

function opml(entries, dateIso) {
  const items = entries.map((e) => `    <outline type="rss" text="${encodeXml(e.name)}" title="${encodeXml(e.name)}" xmlUrl="${encodeXml(e.rss)}" htmlUrl="https://socialtoai.com/console/" />`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Reddit watches</title><dateCreated>${dateIso}</dateCreated></head>\n  <body>\n${items}\n  </body>\n</opml>\n`;
}

export async function main(argv, env = process.env, log = console.log) {
  const o = parseArgs(argv);
  if (o.help || (o.inputs.length === 0 && !o.file && !o.opml)) {
    log(HELP);
    return 0;
  }
  const raw = [...o.inputs];
  if (o.file) raw.push(...feedsFromList(readFileSync(o.file, "utf8")));
  if (o.opml) raw.push(...feedsFromOpml(readFileSync(o.opml, "utf8")));

  const plans = [];
  const skipped = [];
  let others = 0;
  for (const address of raw) {
    const parsed = parseFeed(address);
    if (Array.isArray(parsed)) plans.push(...parsed);
    else if (parsed.unsupported === "not a Reddit address" && o.opml) others++;
    else if (parsed.unsupported && parsed.broadenable && o.broaden) plans.push(parsed.broadenable);
    else if (parsed.unsupported) skipped.push(parsed);
    else plans.push(parsed);
  }
  const unique = [...new Map(plans.map((p) => [stable({ action: p.action, op: p.op, input: p.input }), p])).values()];

  log(`Plan: ${unique.length} watch(es), ${o.frequency}, ${o.time}.`);
  for (const p of unique) log(`  ${p.name}  <-  ${p.source}`);
  if (others) log(`Left alone: ${others} feed(s) in your export that are not Reddit's.`);
  if (skipped.length) {
    log(`Cannot be moved (${skipped.length}):`);
    for (const s of skipped) log(`  ${s.source}: ${s.unsupported}`);
  }
  const cap = monthlyCap(unique.length, o.frequency);
  log(`Cost: ${CREDITS_PER_RUN} credits a run at today's price, at most ${cap} credits a month (about $${(cap * USD_PER_CREDIT).toFixed(2)} on the $10 pack). Failed runs cost nothing.`);
  if (unique.length > 1) log("A free account keeps 1 watch; the rest need a purchase. Current prices: https://api.socialtoai.com/v1/capabilities");

  if (!o.apply) {
    log("Nothing was sent. Add --apply to make them.");
    return 0;
  }
  if (unique.length === 0) return 0;

  const key = env.SOCIALTOAI_API_KEY;
  if (!key) {
    log("Set SOCIALTOAI_API_KEY first. Create a key at https://socialtoai.com/console/keys/ (signing up gives 100 free credits, no card), with the permission to manage schedules.");
    return 2;
  }
  const base = (env.SOCIALTOAI_API_BASE ?? DEFAULT_API).replace(/\/$/, "");
  if (!base.startsWith("https://") && env.SOCIALTOAI_ALLOW_PLAIN_HTTP !== "1") {
    log("SOCIALTOAI_API_BASE must be https, so that the key is not sent in the clear.");
    return 2;
  }
  const timezone = o.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const list = await api(base, key, "GET", "/schedules");
  if (list.status !== 200) {
    log(explain(list).text);
    return 1;
  }
  const existing = list.json?.schedules ?? [];

  const made = [];
  let failed = 0;
  for (const p of unique) {
    const already = existing.find((s) => sameCall(s, p));
    if (already) {
      log(`Already there: ${p.name}`);
      if (already.feed?.rss) made.push({ name: p.name, rss: already.feed.rss });
      continue;
    }
    const body = { name: p.name, input: p.input, frequency: o.frequency, time: o.time, timezone, max_credits_per_run: o.maxCredits, ...(p.op ? { op: p.op } : { action: p.action }), ...(o.frequency === "weekly" ? { weekday: o.weekday } : {}), ...(o.email ? { email_new_items: true } : {}) };
    let res = await api(base, key, "POST", "/schedules", body);
    if (res.status === 429 && res.retryAfter > 0 && res.retryAfter <= 30) {
      await new Promise((r) => setTimeout(r, res.retryAfter * 1000));
      res = await api(base, key, "POST", "/schedules", body);
    }
    if (res.status === 201 || res.status === 200) {
      log(`Made: ${p.name}`);
      if (res.json?.schedule?.feed?.rss) made.push({ name: p.name, rss: res.json.schedule.feed.rss });
      continue;
    }
    failed++;
    const { stop, text } = explain(res);
    log(`Not made: ${p.name}. ${text}`);
    if (stop) break;
  }

  if (made.length) {
    writeFileSync(o.out, opml(made, new Date().toUTCString()), { mode: 0o600 });
    log(`\n${made.length} feed address(es) written to ${o.out}. Import that file into your reader.`);
    log("Each address is private: anyone who has it can read that feed. Rotate one with POST /v1/schedules/{id}/feed or in the console.");
    if (o.printFeeds) for (const e of made) log(`  ${e.name}: ${e.rss}`);
  }
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message);
      process.exit(2);
    },
  );
}
