# reddit-rss-to-watch

[English](README.md)

Reddit 已说明 RSS 在 **2026-11-13** 停止。这个小脚本读取你阅读器里的 Reddit 地址（一份清单，或导出的 OPML），把每一条变成按天或按周运行的 SocialToAI 监控，并给出一个私有订阅地址，可以贴回原来的阅读器。

SocialToAI 团队发布。它是我们付费 API 的客户端，每次运行都要花积分。它只是下面几个选择之一，请先看完。

## 先看 Reddit 自己提供了什么

[Reddit 在 r/modnews 的原帖](https://www.reddit.com/r/modnews/comments/1wubgvt/continuing_our_infrastructure_updates_whats/)（2026-09-30，2026-11-06 重读）写明 RSS 在 2026 年 11 月 13 日停止，你不管理的社区的订阅没有替代；版主可以用一个 Devvit 应用把提醒转到 Discord，2027-01-12 前没有登记的应用会失去访问。媒体报道还提到新的公开 API 申请 2026-10-31 已关闭，公开访问 2027 年 3 月结束：[TechCrunch](https://techcrunch.com/2026/09/30/reddit-is-killing-rss-feeds-ending-public-api-access-because-of-ai-bots/)、[Decrypt](https://decrypt.co/379892/reddit-killing-rss-feeds-and-public-api-access-to-fight-ai-scrapers)。以 Reddit 官方页面为准，日期可能变动。

按这个顺序选：

1. **你是这个社区的版主：** 用 Reddit 自己的工具。
2. **你已有登记过的 Reddit 应用：** 继续用，遵守 Reddit 的 [Data API Terms](https://redditinc.com/policies/data-api-terms)。
3. **你只是想继续看几个版块：** 可以直接在 Reddit 上关注，或者试试这个脚本。

## 脚本做什么

```bash
# 看计划和费用：不用 Key，不发送任何东西
node reddit-rss-to-watch.mjs https://www.reddit.com/r/selfhosted/new/.rss
node reddit-rss-to-watch.mjs --opml reader-export.opml

# 建监控：Key 只从环境变量读
export SOCIALTOAI_API_KEY="<YOUR_API_KEY>"
node reddit-rss-to-watch.mjs --opml reader-export.opml --apply --out new-feeds.opml
```

然后把 `new-feeds.opml` 导入阅读器。需要 Node 18 或更新版本，没有依赖。`node --test test.mjs` 不联网跑解析测试。

2026-11-06 用一条订阅真实跑的结果（私有订阅地址没有显示）：

```text
$ node reddit-rss-to-watch.mjs https://www.reddit.com/r/selfhosted/new/.rss --apply
Plan: 1 watch(es), daily, 09:00.
  r/selfhosted (new)  <-  https://www.reddit.com/r/selfhosted/new/.rss
Cost: 2 credits a run at today's price, at most 62 credits a month (about $0.21 on the $10 pack). Failed runs cost nothing.
Made: r/selfhosted (new)

1 feed address(es) written to new-feeds.opml. Import that file into your reader.
Each address is private: anyone who has it can read that feed. Rotate one with POST /v1/schedules/{id}/feed or in the console.
```

第一次运行把最新的 24 条记作起点，订阅里没有条目；第二天早上那次运行找到 13 条新帖，每次运行 2 积分。下面是阅读器收到的第一条（这里截短了），里面没有作者名：

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

重复运行是安全的：已有的监控会跳过，它的订阅地址仍写进文件。

### 哪些订阅能迁，哪些不能

| Reddit 地址 | 变成 | |
| --- | --- | --- |
| `/r/name/.rss`、`/r/name/hot/.rss` | `reddit.subreddit_posts`，热门 | |
| `/r/name/new/.rss` | `reddit.subreddit_posts`，最新在前 | 最接近原来的订阅 |
| `/r/name/top/.rss` | `reddit.subreddit_posts`，最高分 | |
| `/r/a+b/.rss` | 每个版块一个监控 | 各算各的积分 |
| `/search.rss?q=…` | `reddit.search` | 保留 `sort` 和 `t`，默认最新在前 |
| `/user/name/.rss`、`/submitted/.rss` | `reddit.user_posts` | |
| `/r/name/comments/id/…/.rss` | `reddit.comments`，最新在前 | 一个帖子的评论 |
| `/r/name/search.rss?restrict_sr=on` | **不迁** | 监控不能把搜索限制在一个版块。`--broaden` 改成搜全站，并会明确提示 |
| `/r/name/comments/.rss` | **不迁** | 没有读整个版块评论的调用 |
| `/.rss`、`?feed=…&user=…` | **不迁** | 这些订阅绑定你自己的账号。里面的令牌不打印也不保存 |

## 和原来的订阅有什么不同

- **按天或按周运行，不是实时。** 用 `--time` 和 `--timezone` 选时间。
- **只给上次运行之后的新内容。** 第一次运行只把现有内容记作起点（我们试的时候是 24 条），订阅是空的；从第二次运行起才有新条目。
- **条目的标题和开头文字保留 24 小时**，之后只留平台、日期和链接。每天检查的阅读器能拿到；想留的请自己存。
- **订阅里没有作者名**，评论者一律匿名。
- **地址里带着密钥。** 拿到地址的人就能读这个订阅，请像密码一样保管。用 `POST /v1/schedules/{id}/feed` 或控制台的“换地址”更换。脚本写出的文件只有你自己能读，加 `--print-feeds` 才打印地址。

这不是 Reddit API Key，也不是 Reddit 账号，不用你的账号，不会牵连你的账号。读到的内容如果用于商业用途，仍受 Reddit 条款约束。

## 费用

2026-11-05 查询 [`/v1/capabilities`](https://api.socialtoai.com/v1/capabilities)，价格版本 `pv_29229c6acba5`。`reddit.subreddit_posts`、`reddit.search`、`reddit.user_posts`、`reddit.comments` 每次都是 2 积分。

| 频率 | 一个监控，一个月最多 | $10 档（3,000 积分）折合 |
| --- | --- | --- |
| 每天 | 62 积分 | $0.21 |
| 每周 | 10 积分 | $0.03 |

注册送 100 积分，不用绑卡。免费账户可留 1 个监控，赠送积分够它跑约 50 次。更多监控需要购买，付费账户最多 20 个。失败不扣；正常运行但没有结果也算一次。

## 拿 Key

在[控制台](https://socialtoai.com/console/keys/?utm_source=github&utm_medium=repo&utm_campaign=reddit-rss-to-watch-20261106)创建，打开“管理定时任务”的权限，只显示一次。脚本只从 `SOCIALTOAI_API_KEY` 读取，只放在请求头里，并拒绝命令行传入。Key 不进网址。

不想跑脚本？把 SocialToAI 接到你的 AI 应用，说“每天早上帮我看 r/selfhosted”，AI 会先预览并征求你同意。见[定时任务文档](https://socialtoai.com/zh/docs/schedules/?utm_source=github&utm_medium=repo&utm_campaign=reddit-rss-to-watch-20261106)。

## 支持

support@socialtoai.com。MIT 许可。SocialToAI 团队发布。
