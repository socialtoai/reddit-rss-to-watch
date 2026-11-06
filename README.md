# reddit-rss-to-watch

[中文](README.zh.md)

Reddit has said its RSS feeds stop on **2026-11-13**. This small script takes the Reddit addresses in your reader (a list, or an OPML export) and turns each one into a daily or weekly SocialToAI watch, with a private feed address you can put back in the same reader.

Published by the SocialToAI team. It is a client for our paid API, and each run costs credits. It is one option among those below, so read them first.

## First: what Reddit itself offers

[Reddit's own post in r/modnews](https://www.reddit.com/r/modnews/comments/1wubgvt/continuing_our_infrastructure_updates_whats/) (2026-09-30, read again on 2026-11-06) says RSS feeds stop on November 13, 2026, and that for feeds outside communities you moderate there is no replacement. Moderators are pointed to a Devvit app that relays alerts to Discord, and apps that are not registered by 2027-01-12 lose access. Press reports add that new public API requests closed on 2026-10-31 and public access ends in March 2027: [TechCrunch](https://techcrunch.com/2026/09/30/reddit-is-killing-rss-feeds-ending-public-api-access-because-of-ai-bots/), [Decrypt](https://decrypt.co/379892/reddit-killing-rss-feeds-and-public-api-access-to-fight-ai-scrapers). Reddit's own pages are the authority, and dates can change.

So, in order:

1. **You moderate the community:** use Reddit's own tools.
2. **You already have a registered Reddit app:** keep using it within Reddit's [Data API Terms](https://redditinc.com/policies/data-api-terms).
3. **You just want to keep reading a few subreddits:** consider following them on Reddit directly, or try this script.

## What the script does

```bash
# See the plan and the cost. No key needed, nothing is sent.
node reddit-rss-to-watch.mjs https://www.reddit.com/r/selfhosted/new/.rss
node reddit-rss-to-watch.mjs --opml reader-export.opml

# Make the watches. The key comes only from the environment.
export SOCIALTOAI_API_KEY="<YOUR_API_KEY>"
node reddit-rss-to-watch.mjs --opml reader-export.opml --apply --out new-feeds.opml
```

Then import `new-feeds.opml` into your reader. Node 18 or newer; no dependencies. `node --test test.mjs` runs the parser tests with no network.

A real run on 2026-11-06 with one feed (the private feed address is not shown):

```text
$ node reddit-rss-to-watch.mjs https://www.reddit.com/r/selfhosted/new/.rss --apply
Plan: 1 watch(es), daily, 09:00.
  r/selfhosted (new)  <-  https://www.reddit.com/r/selfhosted/new/.rss
Cost: 2 credits a run at today's price, at most 62 credits a month (about $0.21 on the $10 pack). Failed runs cost nothing.
Made: r/selfhosted (new)

1 feed address(es) written to new-feeds.opml. Import that file into your reader.
Each address is private: anyone who has it can read that feed. Rotate one with POST /v1/schedules/{id}/feed or in the console.
```

The first run recorded the 24 newest posts as the starting point and put nothing in the feed. The next morning's run found 13 new posts; like every run, it cost 2 credits. This is the first item the reader got, cut short here; there is no author name in it:

```xml
<item>
  <title>Anyone ever try the Syncthing equivalent of VPNs, Anywherelan?</title>
  <link>https://www.reddit.com/r/selfhosted/comments/1xozg3r/anyone_ever_try_the_syncthing_equivalent_of_vpns/</link>
  <guid isPermaLink="false">reddit:t3_1xozg3r</guid>
  <pubDate>Fri, 06 Nov 2026 00:49:57 GMT</pubDate>
  <description>I recently found this project called Anywherelan on Fdroid and have not been able to find additional information outside of github. It's a mesh VPN with no coordination server. …</description>
  <category>Reddit</category>
</item>
```

Running it twice is safe: a watch that already exists is skipped, and its feed address goes in the file again.

### Which feeds move, and which cannot

| Reddit address | Becomes | |
| --- | --- | --- |
| `/r/name/.rss`, `/r/name/hot/.rss` | `reddit.subreddit_posts`, hot | |
| `/r/name/new/.rss` | `reddit.subreddit_posts`, newest first | Closest to the original feed |
| `/r/name/top/.rss` | `reddit.subreddit_posts`, top score | |
| `/r/a+b/.rss` | One watch each | Each costs its own credits |
| `/search.rss?q=…` | `reddit.search` | Keeps `sort` and `t`, newest first by default |
| `/user/name/.rss`, `/submitted/.rss` | `reddit.user_posts` | |
| `/r/name/comments/id/…/.rss` | `reddit.comments`, newest first | One post's comments |
| `/r/name/search.rss?restrict_sr=on` | **Not moved** | A watch cannot limit a search to one subreddit. `--broaden` searches all of Reddit instead, and it says so. |
| `/r/name/comments/.rss` | **Not moved** | There is no call for all of a subreddit's comments |
| `/.rss`, `?feed=…&user=…` | **Not moved** | Those feeds are tied to your own account. The token is neither printed nor stored. |

## What is different from the old feed

- **It runs once a day or week, not in real time.** Choose the time with `--time` and `--timezone`.
- **It shows what is new since the last run.** The first run only records what is there as the starting point (24 posts when we tried it) and the feed stays empty; new items appear from the second run.
- **An item keeps its title and the start of its text for 24 hours**, then only its platform, date and link. A reader that checks daily will have them; save anything you want to keep.
- **No author names** in the feed, and commenters are never named.
- **Your reader sees an address with a secret in it.** Anyone who has the address can read that feed, so treat it like a password. Change it with `POST /v1/schedules/{id}/feed` or "New address" in the console. The script writes the file readable by you only and prints the addresses only with `--print-feeds`.

This is not a Reddit API key or a Reddit account, and nothing runs under an account of yours. Commercial use of what you read is still subject to Reddit's terms.

## Cost

Checked on 2026-11-05 against [`/v1/capabilities`](https://api.socialtoai.com/v1/capabilities), price version `pv_29229c6acba5`. Each of `reddit.subreddit_posts`, `reddit.search`, `reddit.user_posts` and `reddit.comments` is 2 credits a run.

| Frequency | One watch, at most a month | On the $10 pack (3,000 credits) |
| --- | --- | --- |
| Daily | 62 credits | $0.21 |
| Weekly | 10 credits | $0.03 |

Sign-up gives 100 free credits and no card is needed. A free account keeps 1 watch, which those credits run about 50 times. More watches need a purchase; a paid account keeps up to 20. Failed runs are free, and a run that ran and found nothing is charged.

## Getting a key

Create one at [the console](https://socialtoai.com/console/keys/?utm_source=github&utm_medium=repo&utm_campaign=reddit-rss-to-watch-20261106) and give it the permission to manage schedules. It is shown once. The script reads it only from `SOCIALTOAI_API_KEY`, sends it only in a request header, and refuses a key on the command line. The key never goes in a URL.

No script needed? With SocialToAI connected to your AI app, say "watch r/selfhosted every morning" and your AI previews the watch and asks first. See [Schedules](https://socialtoai.com/docs/schedules/?utm_source=github&utm_medium=repo&utm_campaign=reddit-rss-to-watch-20261106).

## Support

support@socialtoai.com. MIT licence. Published by the SocialToAI team.
