# Pillar 3 — Product discovery (Posts 16–21)

**Job:** show the thing actually working, on a real screen, doing something a viewer
already told us they care about.
**Product rule:** demonstrate, do not pitch. The CTA stays soft — "go look" rather than
"go sign up". Every one of these is heavily 🤖 AUTO, which makes this the cheapest
pillar to produce.

---

## Post 16 — 一张图，把我的猫介绍完了

| Field | Detail |
| --- | --- |
| **Hook** | 「一张图 + 一个 QR，朋友扫一下就认识我的猫了」 |
| **Pain point** | Sending someone a pet's whole story means spamming 20 photos in a chat. |
| **Story** | You wanted to introduce your cat to a new friend without dumping your camera roll. One card does it — photo, name, breed, and a QR that opens the full profile. |
| **Feature** | **Share Pet Card** (1080×1350 with embedded profile QR). |
| **Format** | 📸 Carousel, 5 slides |
| **Footage** | The card itself, the card being shared in a chat, a phone scanning the card's QR, the profile opening |
| 🤖 AUTO | ✅ The Share Card JPEG straight from `/social/pets/{slug}.jpg?variant=share-card`. Also a screen recording of Share Center → Share Pet Card → the preview appearing. |
| 📱 PHONE | One shot: a second phone scanning the card displayed on a first phone, and the profile opening. This physical proof is what sells it. |
| **On-screen text** | S1 `一张图介绍我的猫` / S2 `照片 + 名字 + 品种` / S3 `右下角有 QR` / S4 `扫一下 → 完整档案` / S5 `免费生成` |
| **Caption** | Note it saves as a normal image, so it works in WhatsApp, Instagram, anywhere. |
| **CTA** | 「主页有 sample，可以先看看」 |

---

## Post 17 — 五个主题，选一个像你家猫的

| Field | Detail |
| --- | --- |
| **Hook** | 「同一只猫，五种风格。你选哪个？」 |
| **Pain point** | Generic pet apps look clinical. Owners want their pet's page to feel like *their* pet. |
| **Story** | Pure visual delight, zero friction. The same cat rendered in all five themes, asked as a poll. |
| **Feature** | **Profile themes** — default, mint, peach, sky, lavender — which now carry through to the Share Card too. |
| **Format** | 📸 Carousel, 6 slides |
| **Footage** | The same pet's Share Card in all five themes, plus a final "which one?" slide |
| 🤖 AUTO | ✅ **100% automatable, zero filming.** Set a QA pet to each theme and fetch the Share Card each time. See `04-asset-capture-guide.md` for the exact loop. |
| 📱 PHONE | None |
| **On-screen text** | S1 `五种主题，选一个` / S2 `1 · 经典` / S3 `2 · 薄荷绿` / S4 `3 · 蜜桃` / S5 `4 · 天空蓝` / S6 `5 · 薰衣草 · 你选哪个？` |
| **Caption** | Very short. The images do the work. Ask for a number in the comments — high engagement, near-zero production cost. |
| **CTA** | 「评论区打数字 1–5 👇」 |

---

## Post 18 — 生日卡片，它自己会出现

| Field | Detail |
| --- | --- |
| **Hook** | 「猫生日那天，app 自己给了我一张卡」 |
| **Pain point** | Owners want to mark milestones but do not want to design anything. |
| **Story** | You opened the app on your cat's birthday and a birthday card variant was simply there — you did not make it. Small delight. |
| **Feature** | **Birthday card variant** (and Adoption Day, same mechanic). Note: these appear **only on the actual day**. |
| **Format** | 📸 Carousel, 4 slides |
| **Footage** | The dashboard "Celebrate today" strip, the birthday card, the adoption card |
| 🤖 AUTO | ✅ Set a QA pet's birthday and adoption day to today, then capture the dashboard occasion strip and fetch both card variants. |
| 📱 PHONE | Optional: your cat with a small treat, to warm it up |
| **On-screen text** | S1 `生日当天自己出现的` / S2 `我什么都没做` / S3 `领养纪念日也有` / S4 `只有当天才有 🎂` |
| **Caption** | Emphasise the surprise. Mention that Adoption Day works the same — a beloved date for the adopter audience from Post 5. |
| **CTA** | 「设好生日就会自动出现」 |

---

## Post 19 — 走失模式：一个开关

| Field | Detail |
| --- | --- |
| **Hook** | 「如果它真的走丢了，我按这个开关」 |
| **Pain point** | In a panic, you cannot be editing a web page. You need one action. |
| **Story** | Follows directly from the Post 7 emergency checklist. Lost Mode is one toggle that adds a missing notice to both public pages at once. |
| **Feature** | **Lost Mode.** |
| **Format** | 🎬 Video, 25s |
| **Footage** | Screen recording: toggle on → confirmation → public page showing the notice → toggle off |
| 🤖 AUTO | ✅ **Fully automatable.** Record the Sharing & Safety section, activate Lost Mode with the confirmation step, then show the resulting `/p/` and `/q/` pages, then Mark as Found. |
| 📱 PHONE | None |
| **On-screen text** | 0s `万一走丢了` / 5s `一个开关` / 10s `两个页面同时更新` / 16s `捡到的人立刻看到` / 21s `找回来了就关掉` |
| **Caption** | Reference the Post 7 checklist explicitly to reward followers. Be honest: this does not find your pet, it makes your pet easier to return. |
| **CTA** | 「配合上次那张清单一起用 📌」 |

---

## Post 20 — 捡到的人看到的是这个

| Field | Detail |
| --- | --- |
| **Hook** | 「陌生人扫到我的猫，看到的是这个页面」 |
| **Pain point** | Owners cannot picture what they are exposing. Uncertainty stops them sharing anything. |
| **Story** | A full, transparent tour of the finder's view. What is shown: pet name, photo, WhatsApp button, Call button, general area, safety notes. What is **not**: home address, full name, anything private. |
| **Feature** | **Safety Profile** in full. |
| **Format** | 📸 Carousel, 7 slides, annotated |
| **Footage** | The `/q/` page with green ticks on what shows and red crosses on what does not |
| 🤖 AUTO | ✅ Screenshot the live Safety Profile of a QA pet at 1080×1440 and annotate in Canva. |
| 📱 PHONE | None |
| **On-screen text** | S1 `陌生人看到的是这个` / S2 `✅ 名字 + 照片` / S3 `✅ WhatsApp 按钮` / S4 `✅ Call 按钮` / S5 `✅ 大概区域` / S6 `❌ 住址` / S7 `❌ 全名 · 私人资料` |
| **Caption** | The two red-cross slides are why this post exists. Transparency is the conversion mechanism here, not features. |
| **CTA** | 「主页 sample 可以自己点进去看」 |

---

## Post 21 — 免费版到底有什么

| Field | Detail |
| --- | --- |
| **Hook** | 「免费版能用什么？我列清楚，不藏。」 |
| **Pain point** | "Free" usually means crippled. Malaysians expect a catch and look for it. |
| **Story** | Complete honesty. Here is exactly what free includes, exactly what the limits are, and exactly what is not built yet. |
| **Feature** | **The Free plan itself** — 3 pets, 10 memories per pet, both profiles, Share Cards, care records, Lost Mode. |
| **Format** | 📸 Carousel, 6 slides |
| **Footage** | Clean typographic slides + the live pricing page |
| 🤖 AUTO | ✅ Screenshot the live `/pricing` page. **Re-check it the day you post** — the plan must match what the site says. |
| 📱 PHONE | None |
| **On-screen text** | S1 `免费版有什么？` / S2 `✅ 3 只宠物` / S3 `✅ 两个页面（分享 + 安全）` / S4 `✅ 卡片 · QR · 走失模式` / S5 `✅ 每只 10 个回忆` / S6 `❌ 还没有：提醒 · 家人共享 · 实体牌` |
| **Caption** | Slide 6 does the heavy lifting. Naming what is missing is what makes slides 2–5 believable. State plainly that Smart Tags and Premium are still coming and there is nothing to buy today. |
| **CTA** | 「不用给信用卡，主页链接直接开」 |
