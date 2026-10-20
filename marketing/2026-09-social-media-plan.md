# MyPetLink 社交媒体执行计划｜Linko AI 版｜2026 年 9 月 18–30 日

**更新：**2026-09-17，马来西亚时间。9 月 17 日准备素材；9 月 18–30 日每天发布一条主内容。本计划用于小红书、Instagram、TikTok、Facebook 等**对外社交账号**，与产品内的 MyPetLink Social 功能无关。

## 本月的制作前提

- **Linko 是唯一固定主角。**没有真实宠物可拍；Linko 是 AI 创作的品牌角色。照片帖使用 Linko AI 图片或真实 MyPetLink 页面截图；视频帖使用 AI 制作的 Linko 镜头，再在剪辑中叠加经过核对的真实页面截图。无需拍宠物、手机或创办人。
- **实体 Smart Tag 还没拿到。**本月不安排吊牌开箱、实拍扫描或上身展示。已有 [Linko 六格参考图](xiaohongshu/posts/004-linko-home-route/source/reference-storyboard.png) 中的吊牌、二维码、手机画面都是故事示意；不能当成已量产产品或真实页面。若用到类似镜头，画面标「情境示意」，二维码不可扫描，产品旁标「即将推出」。拿到产品后再另做真实开箱和实测系列。
- **目标：**让马来西亚宠物主人认识 Linko 与 MyPetLink，理解免费档案、Public Share Profile 和 Safety Profile 的价值；引导看可用的真实范例或建立免费档案。内容以实用提示和小故事为主，不每天硬销。
- **目前可讲的事实：**免费最多 3 只宠物档案；Public Share Profile、Safety Profile、可下载 QR、主人选择开启的 WhatsApp / 电话、基础照护记录、每只宠物最多 10 则 Moments。QR + NFC Smart Tag 是可选的一次性实体加购，当前**即将推出**；Premium **Coming Soon**；GPS Safety **Coming Later**。扫码不能实时定位。发布当天再核对 [官网](https://mypetlink.com.my/) 和实际功能。

本计划从 [现有小红书题材库](xiaohongshu/02-content-calendar.md) 调整而来。旧的 [实拍批量计划](xiaohongshu/03-filming-batching-plan.md) 要求真实宠物与真人出镜，**本月不采用**。若日更制作压力过大，先确保每条成品准确、完整，再调整下一月频率。

## Linko 视觉规则与工具分工

**角色参考：**以现有六格图里 Linko 的形象为准：橘色虎斑、白色口鼻／胸口／爪子、圆眼、温暖的 3D 插画质感。先从原图制作一张**干净的角色参考图**：只有 Linko，不带文字、手机、QR、号码或产品吊牌。把这张参考图固定用于本月所有生成任务；每次检查花纹、脸型、眼睛和体型是否一致。蓝色项圈可以保留；不生成可识别的实体吊牌设计。

| 用途 | 工具 | 做法 |
| --- | --- | --- |
| Linko 图文主图、视频首帧 | **Runway Image / References** | 上传干净的 Linko 参考图，生成 3:4 单张画面；同一角色图反复引用。手绘文字、Logo、QR 和页面不要交给图像模型画。 |
| Linko 的短动作 | **Runway Gen-4.5 Image to Video** | 用已选好的 Linko 图当首帧，只写动作与镜头移动。每次先做一个短镜头，确认角色没有变形再继续。 |
| 需要场景变化的故事 | **Google Flow** | 用 Linko 参考图或首尾帧做竖版场景，生成走廊、家门、街区等情境；不生成产品 UI、QR 或联络画面。明确标「AI 情境示意」。 |
| 真实产品说明 | **现有页面截图 / capture 工具** | 从 MyPetLink 的真实测试页面获取静态画面，遮蔽个人资料。把截图作为剪辑图层放入 AI 视频，配真实准确的说明；不是手机实拍，也不让 AI 重新画页面。 |
| 封面、字幕、轮播、剪辑 | **Canva** 或 [现有制作脚本](xiaohongshu/production/README.md) | 统一 1080 × 1440 图文、1080 × 1920 视频。中文字、Logo、CTA 在这里加；导出无其他平台水印的母版。 |
| 标题和配文 | 文字助手 | 使用下方 P01–P13；每条发布前人工核对产品事实。 |

参考资料：[Runway References](https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References)、[Runway Gen-4.5](https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5)、[Google Flow 创建视频](https://support.google.com/flow/answer/16353334?hl=en)、[Flow 可用地区](https://support.google.com/flow/answer/16353544?hl=en)。Flow 在马来西亚可用，但模型、时长、点数和功能以账号实际界面为准。**两套视频工具是按镜头分工，不必每条同时使用。**

### 通用 Linko 视觉提示词 P00

每次上传干净角色参考图，再把下面这段放在**图像生成提示词的最前面**。照片帖也用它，避免今天的 Linko 与明天不像同一只猫。

```text
Use the supplied clean reference image as the exact character design for Linko, a fictional MyPetLink mascot. Preserve the same orange tabby markings, white muzzle, white chest and paws, round eyes, proportions, and warm 3D illustrated style. A plain blue collar is allowed. Keep Linko clearly recognizable in every shot. Vertical composition with room for a headline added later. Do not generate text, logos, QR codes, phone screens, contact details, product tags, or extra pets.
```

**一致性检查：**一次只改场景与动作；尽量复用同一张角色参考、同一色调和已通过审核的首帧。若生成结果多了假吊牌、假 QR、错误 Logo、不同花纹或多一只猫，丢弃重做。不能靠字幕掩盖错误产品画面。

## 9 月 17 日素材准备

1. 整理 Linko 干净参考图，做 6 张可复用的 AI 静帧：家中、门口、走廊、安静街区、留白封面、与抽象手机外框同框。背景有马来西亚生活感即可，不假装某个真实地点或事件。
2. 从**批准的测试账号**截取 Public Share Profile、Safety Profile、QR 下载、照护记录、建立档案的真实页面。可用 [现有 capture 流程](xiaohongshu/production/README.md)。截图中不得有真实客户资料、完整电话、住址、安全码或能连接真实账号的二维码。
3. 建两份 Canva 模板：3:4 图文轮播、9:16 视频。延续 [视觉系统](xiaohongshu/production/templates/visual-system.md) 的奶油、珊瑚、蓝、薄荷色。视频首 2 秒有清楚问题，全部镜头配字幕。
4. 把 AI 原图、视频片段、真实页面截图和最终成品分开存放。建议按 `2026-09-日期-主题` 命名；记录使用的参考图、提示词、模型和发布链接，方便以后复做。
5. 预先做好 9/18–9/21 的封面与配文。一天只需完成一条主内容；视频可拆成 2–3 个短 AI 镜头，必要时用静帧推进，控制制作时间和点数。

## 每天发什么

图文默认 5–7 页；视频默认 15–35 秒、竖版。小红书先用中文版本；图文同步 IG / FB，视频同步 IG Reels / TikTok。20:30 MYT 可以作为第一轮固定测试时间，之后按实际数据调整。每条**只有一个 CTA**。P01–P13 是下方可复制的提示词。

| 日期 | Linko 主题与开头 | 形式 | AI 与真实素材 | CTA | 提示词 |
| --- | --- | --- | --- | --- | --- |
| 9/18 五 | 「如果 Linko 第一天到新家」：新手的 4 项准备 | 图文 | Runway Linko 图 + Canva | 收藏清单 | P01 |
| 9/19 六 | 「走失前先存好 5 样资料」：让别人更容易描述与联系 | 图文 | Runway Linko 图 + Canva | 转给养宠朋友 | P02 |
| 9/20 日 | 「有人遇见 Linko，却不知道怎么联系」：虚构情境与 Safety Profile | 视频 | Google Flow Linko 故事 + 真实页面截图 | 看真实范例 | P03 |
| 9/21 一 | 「一般区域够了，不用公开家门口」：隐私清单 | 图文 | Runway Linko 图 + Canva 图解 | 收藏清单 | P04 |
| 9/22 二 | 「Linko 为什么有两种页面？」：分享给朋友与给拾获者 | 视频 | Runway Linko 动作 + 两张真实页面截图 | 看真实范例 | P05 |
| 9/23 三 | 「去 vet 前整理什么？」：5 项基础记录 | 图文 | Runway Linko 图 + Canva 清单 | 收藏空白模板 | P06 |
| 9/24 四 | 「如果有人发现 Linko，看到什么？」：联系选项如何出现 | 视频 | Google Flow / Runway Linko 镜头 + 真实 Safety Profile 截图 | 看真实范例 | P07 |
| 9/25 五 | 「宠物的哪 3 个时刻值得记？」：Moments 灵感 | 图文 | Runway Linko 三个虚构生活场景 + Canva | 留言一个想记住的时刻 | P08 |
| 9/26 六 | 「扫 QR 就能定位吗？」：清楚解释不能 | 图文 | Linko AI 图 + Canva 流程图 + 真实页面局部 | 收藏解释图 | P09 |
| 9/27 日 | 「想把 Linko 今天的样子留给明年」：回忆感短片 | 视频 | Runway Linko 图生视频 + Canva 字幕 | 分享想留住的瞬间 | P10 |
| 9/28 一 | 「免费建立 Linko 档案，先做 3 步」：真实步骤 | 图文 | Linko AI 封面 + 真实测试页截图 | 建立免费宠物档案 | P11 |
| 9/29 二 | 「Linko 用 30 秒介绍 MyPetLink」：安全、照护、回忆 | 视频 | Flow / Runway Linko 镜头 + 真实页面截图 | 看真实范例 | P12 |
| 9/30 三 | 「这个月最需要解释的 3 件事」：月末 FAQ | 图文 | Runway Linko 图 + Canva；问题以真实反馈为准 | 选一个：看范例或免费建档 | P13 |

若小红书的图片和 IG 图片共用画面，可只改封面字和配文；TikTok 只发布视频。不要把 AI 情境写成「真实宠物走失」「真实团聚」「用户案例」。已有 [Linko 短片草稿](xiaohongshu/posts/004-linko-home-route/brief.md) 可供 9/20 参考节奏，但它当前包含示意吊牌、示意 QR 和完整号码，**不能原样发布**。

## 每日可复制提示词

**使用方法：**图文日，把 P00 加到对应的 Runway 图像提示词前；画面生成后，再让文字助手依据主题写 5–7 页短文案，在 Canva 排版。视频日按指定工具生成短镜头；所有产品说明用真实截图在 Canva 加入。下面的英文是给影像模型的提示词，中文是文案与剪辑指令。

### P01｜9/18｜新家第一天｜Runway Image + 文字助手

```text
Linko sits calmly inside a new Malaysian home beside a water bowl, a quiet resting corner and a pet carrier. Warm morning light, reassuring mood, clean uncluttered 3:4 composition. No human, no text, no medical objects.
```

文字助手：写 6 页《新宠物第一天，先准备这 4 件事》，包括安静空间、水与食物、观察状态、保存可联系主人的资料；每页标题 4–8 字、解释不超过 35 字，结尾请收藏。用「如果 Linko 第一天到新家」讲**示例**，不写成我真的养了 Linko。

### P02｜9/19｜走失前的资料｜Runway Image + 文字助手

```text
Linko poses for a clear front-facing identification portrait against a simple neutral background. A second composition shows his full body and distinctive orange tabby markings. Friendly practical illustrated style, 3:4, no text, no collar tag, no QR.
```

文字助手：做 6 页清单：清楚的正面照、全身照、特别记号、一般区域、可公开联络方式及最近照片日期。不要用「一定找回」的承诺；不展示完整住址与电话。

### P03｜9/20｜有人遇见 Linko｜Google Flow + 真实截图

先把干净 Linko 图作为角色参考。Flow 只生成前半段；后半段使用当日真实 Safety Profile 截图。

```text
Use the supplied Linko character reference consistently. Vertical 9:16, warm 3D illustrated story in an ordinary Malaysian apartment corridor at dusk. Linko waits calmly near a closed gate. An adult passerby notices him from a respectful distance. Gentle camera movement, two short shots, hopeful but restrained. No chase, injury, rescue ending, pet tag, phone, text, logo or QR code. Fictional illustrative scenario.
```

剪辑字幕：开头「情境示意｜如果有人遇见 Linko」；切到**真实**截图时说明「主人可选择让拾获者通过 Safety Profile 联系」，结尾「看看真实范例」。不要让 Flow 生成页面。

### P04｜9/21｜公开到什么程度｜Runway Image + 文字助手

```text
Linko sitting at a tidy desk next to a simple blank map of a broad city area, warm cream and blue palette, approachable 3D illustration, 3:4. Leave open space for a privacy checklist. No street address, map pin, GPS icon, text or phone screen.
```

文字助手：做 5 页「一般区域 vs 完整住址」图文；以「Ampang, KL」示例一般区域，门牌、楼层、单位号不公开。强调主人自己检查可公开内容；最后给发布前自查表。

### P05｜9/22｜两种页面｜Runway 视频 + 真实截图

先用 P00 和 Runway Image 制作 Linko 坐在两个**空白**竖版卡片之间的首帧，再用图生视频：

```text
Preserve Linko exactly as in the input image. He glances left, then right, while the camera makes a slow gentle push-in. The two blank cards remain completely blank and motionless. No text, UI, QR code, tag or extra objects appear.
```

剪辑时才把 Public Share Profile 和 Safety Profile 的**真实截图**贴进两张卡片，字幕：「给朋友看故事」／「给遇见它的人看联络方式」。联络按钮只在主人开启时显示。结尾「看真实范例」。

### P06｜9/23｜看 vet 前整理｜Runway Image + 文字助手

```text
Linko resting comfortably beside a closed notebook, a blank pet care card and a travel carrier in a bright home. Friendly 3D illustrated style, 3:4, no veterinarian, syringe, medicine label, diagnosis, text or real document details.
```

文字助手：写 6 页「看 vet 前整理 5 项」：既往状况、目前药物、过敏、接种或驱虫记录、想问的问题；最后一页给空白模板。不要提供诊断、剂量或接种时间表，也不要说 MyPetLink 会自动提醒。

### P07｜9/24｜拾获者看到什么｜Google Flow / Runway + 真实截图

```text
Use the supplied Linko reference exactly. Vertical 9:16 illustrated close-up: Linko looks toward an adult passerby in a calm public walkway; the passerby stops and pays attention. Subtle eye movement and slow camera push. No phone, tag, QR code, rescue, text, logo or contact detail. Fictional scenario.
```

剪辑：前段标「情境示意」，随后叠加真实测试用 Safety Profile 截图，依序指向名字、一般区域和已开启的联系选项。字幕说明拾获者不需安装应用；不显示可用的测试二维码或完整号码。CTA「看真实范例」。

### P08｜9/25｜值得记住的时刻｜Runway Image + 文字助手

```text
Create three separate 3:4 scenes with the same Linko reference: first day resting at home; a small playful achievement with a toy; a quiet afternoon nap by the window. Consistent orange markings and warm 3D illustration. No text, date, extra pet, product tag or claim that these events really happened.
```

文字助手：写 5 页「哪 3 个宠物时刻值得记？」；用 Linko 的**虚构场景**举例，不写成真实养宠日记或真实客户故事。可以轻提 MyPetLink Moments；不要承诺无限储存。

### P09｜9/26｜QR 不等于定位｜Runway Image + 文字助手

```text
Linko beside three simple blank visual panels that can later hold a manual flow diagram. Calm explanatory 3D illustration, 3:4, cream background. Do not draw a QR code, GPS map, phone screen, text or tag.
```

文字助手：第一页直接答「不能实时定位」。后面做流程：「有人遇见宠物 → 打开 Safety Profile → 若主人开启联络方式，可联系主人」。把「拾获者主动提供发现位置」与「实时 GPS」清楚区分，最后请收藏。

### P10｜9/27｜留住今天｜Runway 图生视频

先用 P00 生成 Linko 在家中窗边的静帧，再上传 Runway Gen-4.5：

```text
Preserve Linko's exact orange tabby markings, white muzzle and paws, face shape, blue collar and warm illustrated style from the input. Linko blinks once and makes a small natural head turn toward the window. Very slow camera push-in. No new objects, people, tag, text, logo, UI or transformation.
```

视频由 2–3 个 Linko AI 短镜头和静帧组成。字幕「AI 角色故事｜想留住它今天的样子」；只谈保留回忆的心情，不把生成动作说成真实发生的回忆。

### P11｜9/28｜免费开始三步｜Linko AI 封面 + 真实截图

```text
Linko sits next to a completely blank upright card with generous empty space for a real screenshot added during editing. Friendly warm 3D illustration, 3:4, no rendered text, logo, QR, phone UI or product tag.
```

文字助手：依据当天提供的 3 张真实测试页截图写 5 页图文：建立宠物档案、选择公开内容、保存分享链接与可下载 QR。按钮名称必须照截图写；不清楚就标待核对。说明不买实体 Smart Tag 也能开始。

### P12｜9/29｜Linko 介绍 MyPetLink｜Google Flow / Runway + 真实截图

```text
Use the supplied Linko reference consistently. Vertical 9:16, three gentle illustrated moments: Linko looking toward the camera at home; Linko beside a blank memory album; Linko sitting safely near a doorway. Smooth simple motion, warm Malaysian home atmosphere, clean areas reserved for later screenshot overlays. No spoken dialogue, text, product tag, QR code, interface, fabricated phone or rescue claim.
```

剪辑用 3 组字幕对应「安全」「照护」「回忆」，需要展示功能时插入当天**真实**页面截图；结尾「认识 Linko，也看看真实的 MyPetLink」。不要造创办人的口述或让 Linko 说自己是现实中的宠物。

### P13｜9/30｜月末 FAQ｜Runway Image + 文字助手

```text
Linko sits calmly beside three blank question cards, friendly 3D illustrated brand style, cream background, coral and blue accents, 3:4. Leave all cards empty for text added later. No generated letters, phone, QR, tag or extra characters.
```

文字助手：用实际收到、可公开且已去识别的评论或私信整理 3 个问题。若没有足够反馈，就改题为「最需要解释的 3 件事」：免费档案、两种页面、QR 与定位；不要写「大家都在问」或编造增长数字。选一个 CTA。

## 发布与复盘

**每天发布前：**核对产品功能及 CTA 链接；确认每个 Linko 镜头角色一致；所有 AI 情境有标示；所有 UI 为真实截图；无完整电话、真实客户资料、可扫描测试 QR、假 Logo 或假产品吊牌。若范例页当天不可用，改为免费建档或收藏 CTA。参照 [人工检查表](xiaohongshu/production/review/manual-review-checklist.md)。

**记录：**日期、平台、成品路径、发布链接、播放或浏览、收藏、分享、评论、主页访问、范例页访问、免费建档。没有数据就留空。9 月 30 日比较图文收藏／分享、视频观看与互动、以及实际建档，再决定 10 月继续哪些系列。

**拿到实体 Smart Tag 后：**另开真实产品内容系列，拍实物、QR 和 NFC 的实际操作；先验证购买状态、价格、变体、页面和联络流程，再修改文案。AI 版本与真实实测分开标注。
