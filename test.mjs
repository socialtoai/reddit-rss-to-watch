// node --test test.mjs   (no network, no key)
import test from "node:test";
import assert from "node:assert/strict";
import { parseFeed, feedsFromOpml, feedsFromList, monthlyCap, parseArgs } from "./reddit-rss-to-watch.mjs";

test("a subreddit feed becomes a community listing, in the order the feed asked for", () => {
  const [hot] = parseFeed("https://www.reddit.com/r/selfhosted/.rss");
  assert.equal(hot.op, "reddit.subreddit_posts");
  assert.deepEqual(hot.input, { id: "selfhosted", sort: "hot" });
  const [fresh] = parseFeed("https://old.reddit.com/r/selfhosted/new/.rss");
  assert.deepEqual(fresh.input, { id: "selfhosted", sort: "latest" });
  const [top] = parseFeed("reddit.com/r/selfhosted/top.rss?t=week");
  assert.deepEqual(top.input, { id: "selfhosted", sort: "popular" });
});

test("a feed of several subreddits becomes one watch each", () => {
  const plans = parseFeed("https://www.reddit.com/r/rss+selfhosted/new/.rss");
  assert.deepEqual(plans.map((p) => p.input.id), ["rss", "selfhosted"]);
});

test("a search feed becomes a search, newest first unless it said otherwise", () => {
  const p = parseFeed("https://www.reddit.com/search.rss?q=acme%20alternative&t=week");
  assert.equal(p.action, "search");
  assert.deepEqual(p.input, { platform: "reddit", query: "acme alternative", sort: "latest", published_within: "week" });
  assert.equal(parseFeed("https://www.reddit.com/search.rss?q=acme&sort=top").input.sort, "popular");
});

test("search inside one subreddit is not silently widened", () => {
  const p = parseFeed("https://www.reddit.com/r/selfhosted/search.rss?q=rss&restrict_sr=on");
  assert.match(p.unsupported, /no subreddit filter/);
  assert.equal(p.broadenable.action, "search");
});

test("user and post-comment feeds map; the rest is refused with a reason", () => {
  assert.deepEqual(parseFeed("https://www.reddit.com/user/nasa/submitted/.rss").input, { platform: "reddit", username: "nasa" });
  const c = parseFeed("https://www.reddit.com/r/rss/comments/abc123/some_title/.rss");
  assert.equal(c.action, "comments");
  assert.equal(c.input.url, "https://www.reddit.com/r/rss/comments/abc123/");
  assert.ok(parseFeed("https://www.reddit.com/r/rss/comments/.rss").unsupported);
  assert.ok(parseFeed("https://www.reddit.com/.rss").unsupported);
  assert.ok(parseFeed("https://www.reddit.com/user/nasa/comments/.rss").unsupported);
  assert.ok(parseFeed("https://example.com/feed.rss").unsupported);
});

test("the token of a private feed is never kept", () => {
  const p = parseFeed("https://www.reddit.com/.rss?feed=SECRETTOKEN&user=someone");
  assert.ok(p.unsupported);
  assert.ok(!JSON.stringify(p).includes("SECRETTOKEN"));
  assert.ok(!JSON.stringify(p).includes("someone"));
});

test("OPML and plain lists are read", () => {
  const opml = `<opml><body><outline type="rss" xmlUrl="https://www.reddit.com/r/a/.rss"/><outline xmlUrl='https://example.com/x?a=1&amp;b=2'/></body></opml>`;
  assert.deepEqual(feedsFromOpml(opml), ["https://www.reddit.com/r/a/.rss", "https://example.com/x?a=1&b=2"]);
  assert.deepEqual(feedsFromList("# note\n\nhttps://www.reddit.com/r/a/.rss\n"), ["https://www.reddit.com/r/a/.rss"]);
});

test("the monthly cap is what the schedule page says", () => {
  assert.equal(monthlyCap(1, "daily"), 62);
  assert.equal(monthlyCap(3, "weekly"), 30);
});

test("a key on the command line is refused", () => {
  assert.throws(() => parseArgs(["--api-key", "abc"]), /environment variable/);
});
