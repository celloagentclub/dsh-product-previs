# HANDOFF / 交接

Another agent owns film production from here. This note is the whole brief: what already runs, what the owner rejected, and what the next film has to do. Do not treat sample #1 as acceptable.

下一位 agent 从这里接手成片。这份说明是全部任务：已经能跑的部分、主人否掉的样片，以及下一条片子必须做到的事。样片 1 不能当成品。

## Status / 现状

Branch `cursor/agent-director-pipeline-0da9`, PR https://github.com/celloagentclub/dsh-product-previs/pull/1

The pipeline from a text brief to an MP4 **does run**. Sample #1 is in the repo and was rejected:

- Film: `films/cybopal-wow/output/sample.mp4` (40.2s, 1280×720, 24fps)
- Stills: `films/cybopal-wow/output/frames/s01.png` … `s28.png`
- Storyboard: `films/cybopal-wow/storyboard.html`
- Prompts: `films/cybopal-wow/prompts.json`

Sample #1 renders **cylinder/box proxies**, not the KeyShot GLB. Most shots hold the arm still. The owner stopped further rendering on this run. **No second MP4 was made.**

这条分支上，从文字简报到 MP4 的管线是通的。样片 1 在仓库里，已被否掉：

- 成片：`films/cybopal-wow/output/sample.mp4`（40.2 秒，1280×720，24fps）
- 关键帧：`films/cybopal-wow/output/frames/s01.png` … `s28.png`
- 分镜：`films/cybopal-wow/storyboard.html`
- 提示词：`films/cybopal-wow/prompts.json`

样片 1 渲的是圆柱和方块，不是 KeyShot GLB。大部分镜头手臂不动。主人要求这次停渲。**没有第二条成片。**

Tests at handoff: `npm test` 37 passed, 1 skipped (the optional real-GLB fixture). `npm run test:host` 14 passed. `npx tsc --noEmit` clean.

交接时测试：`npm test` 37 项通过、1 项跳过（可选的真实 GLB fixture）。`npm run test:host` 14 项通过。`npx tsc --noEmit` 干净。

## Owner feedback on sample #1 / 主人对样片 1 的反馈

Not acceptable. Three points:

1. **The 3D looks bad.** It is proxy geometry (cylinders and boxes), not the product.
2. **The product basically does not move on screen.** Unfold was only about 40° on one joint, many shots were holds, and the locked wide frame made the travel small.
3. **Camera work is not exciting enough.** Slow pull-backs on a static proxy.

Music will be replaced. The owner is generating a track with real dynamics: **intro, build, drop, breakdown, second drop/climax, outro**. The edit will be re-cut to that track later. Do not spend time improving the 178 BPM placeholder (`films/cybopal-wow/assets/bed.wav`). Keep shot lengths in **beats** (`shot.intent.beats`) so `music:swap` can retime them.

不合格。三点：

1. **三维很差。** 是代理几何（圆柱、方块），不是产品。
2. **产品在画面里基本不动。** 展开只有一个关节大约 40 度，很多镜头是静止保持，固定机位又框得太宽，位移被吃掉了。
3. **运镜不够好看。** 对着静止代理做慢后拉。

音乐会换。主人正在做一条有结构的曲子：**intro、build、drop、breakdown、第二次 drop/高潮、outro**。剪辑以后按这条重切。不要再打磨 178 BPM 占位音（`films/cybopal-wow/assets/bed.wav`）。镜头时长继续用**拍数**（`shot.intent.beats`），这样 `music:swap` 能重排。

## Agreed ~40s story / 约定的约 40 秒故事

Product name on screen: **ZEESWAY A1** (tentative). Category line: **The AI agent with a body.** Slogan: **You focus. It handles the rest.** (tentative).

Beat order, data-driven so it can be retimed:

1. Close-up of the **base screen** running a task (`Listening`, then `Working · Step 2 of 3`). The arm is still folded.
2. The arm **unfolds and lifts the display to eye height**. Camera locked (Dyson rule: when the arm moves, the camera does not).
3. A hand wave **pulls the screen closer**. No realistic person is required; the product move has to read. A short type card may stand in for the wave.
4. The task finishes. The screen **turns toward the user**. Base screen reads `Done · 6 min`. Landscape-to-portrait can sit in this beat if it stays readable.
5. Slogan, then the name: `You focus.` / `It handles the rest.` / `ZEESWAY A1`.

`src/director/plan.ts` (`BRAND`) already lists this shot order with beats, actions (`hold-folded`, `unfold-eye`, `pull-closer`, `turn-toward`, `portrait`, `hold-portrait`) and moves (`rack-focus`, `fly-along`, `whip`, `locked`, `macro-orbit`, `push-impact`). **That list has not been rendered.** Running `previs direct` will compile it. The checked-in MP4 is still the old CYBOPAL cut.

屏幕上的产品名：**ZEESWAY A1**（暂定）。品类句：**The AI agent with a body.** 口号：**You focus. It handles the rest.**（暂定）。

按拍排列，方便以后改音乐：

1. **底座小屏**特写，任务在跑（`Listening`，然后 `Working · Step 2 of 3`）。手臂仍收着。
2. 手臂**展开，把显示器抬到眼睛高度**。机位锁死（戴森规则：产品在动，机位不动）。
3. 挥一下手，**屏幕被拉近**。不必做真人。动作本身要看得懂。可以用一张很短的字卡代替挥手。
4. 任务完成。屏幕**转向使用者**。底座屏显示 `Done · 6 min`。横屏转竖屏可以放在这一拍里，但必须看得清。
5. 口号，然后名字：`You focus.` / `It handles the rest.` / `ZEESWAY A1`。

`src/director/plan.ts` 的 `BRAND` 已经按这个顺序写了拍数、动作和运镜。**还没有渲过。** 跑 `previs direct` 会把它编译成项目。仓库里的 MP4 仍是旧的 CYBOPAL 版本。

## ZEESWAY selling points / 卖点（来自首页方案 v5）

Source: the owner's homepage plan (2026-11-11). Treat parenthetical items as tentative.

- **What it is:** A1 = an AI-agent base plus a short arm. The base has a small screen. The agent reads the user's display, works across apps, and uses a cloud model. The monitor on the arm is the **user's own display**, not part of the kit.
- **Crowdfunding features:** Agent, motion tracking, gesture control, anti-gravity mechanical lock. There is **no physical confirm button**.
- **Systems:** Mac and Windows. Launch target about June 2027, Kickstarter first, the site takes a deposit. Other arms (Apple-style single, dual, simple non-AI lift) are not this film.
- **Who it is for:** People who work all day at a desk with an external monitor. Two core groups: (1) cross-app repetitive work (ops, sales, finance, assistants, sellers) who need the agent; (2) deep-focus makers (design, edit, code) who need tracking and gesture. Desk-setup taste is a **distribution look**, not the story.
- **Story spine:** Today's desk just sits there. A1 is an AI agent with a body: it reads the screen, does the chores across apps, and moves the display. You focus. It handles the rest.
- **Why it has to be hardware:** (1) the screen moves, which an app cannot do; (2) the screen turning toward you **is** the notification, when you leave it folds away and keeps working, when you return it faces you; (3) raising a hand stops the agent, no mouse, no button.
- **Tell the agent first, then the body.** Tracking and gesture are evidence that it needs a body, not a spec war with CyboPal. Safety splits in two: "will it misuse my computer" and "will the arm drop my display". The anti-gravity lock means the display stays put if power or the cable is lost.
- **Afternoon beats** (useful inserts, not a second film): sit down and the screen meets the eyes; change posture and a wave pulls the screen closer or turns it toward someone else.

来源是主人的首页方案（2026-11-11）。括号里的都是暂定。

- **是什么：** A1 = AI Agent 底座加一条短臂。底座带小屏。Agent 能读用户的屏幕、跨应用干活、用云端模型。臂上的显示器是**用户自己的屏**，不在套装里。
- **众筹功能：** Agent、动作追踪、手势控制、反重力机械锁。**没有实体确认键。**
- **系统：** Mac 和 Windows。上线大约 2027 年 6 月，先 Kickstarter，官网收定金。苹果风格单臂、双臂、非 AI 简易升降不是这条片子。
- **给谁：** 每天用外接显示器坐在桌前的人。两群核心用户：（1）跨应用重复搬数据的人（运营、销售、财务、助理、电商），要的是 Agent；（2）长时间盯一个软件的人（设计、剪辑、写代码），要的是追踪和手势。桌搭审美只决定**画面往哪投**，不决定讲什么。
- **故事：** 今天的桌子是被动的。A1 是有身体的 AI Agent：读屏、跨应用干杂活、还会移动显示器。你专注，杂事交给它。
- **为什么必须是硬件：**（1）屏幕会动，App 做不到；（2）屏幕转向你**本身就是提醒**，人离开时它收起并继续干活，人回来时屏幕迎向你；（3）举手就能叫停，不用找鼠标、不用按钮。
- **先讲 Agent，再讲身体。** 追踪和手势是「它为什么需要身体」的证据，不要一上来和 CyboPal 比参数。安全分成两件事：「会不会乱操作电脑」和「会不会把显示器摔下来」。反重力锁的意思是断电或线掉了，屏幕停在原位。
- **一个下午里可以用的插入：** 坐下，屏幕升到眼睛高度；换姿势，挥一下，屏幕拉近或转给旁边的人。

## Visual fixes still to do / 还要做的画面修正

Do these before calling a film done. Sample #1 failed all of the first three.

做完这些再交片子。样片 1 前三条都没过。

1. **Real geometry.** Render the owner's GLB, not proxies. Drive file: https://drive.google.com/file/d/1laS08lVB8YCPYdybRQYlttEvu5Xx3F7b/view (KeyShot, ~148MB, millimetres, root scaled to metres, no Draco/meshopt, ~76MB of PNG textures). **Do not commit that file.** A decimated derivative with our own materials may be committed if it is small. Nodes include base, arm segments 1–5 (siblings, not a parent chain), monitor bracket and thumb nut, Studio Display, desk, Mac Studio, Type-C, and three KeyShot cameras. Pivots sit near the segment origins. Measured arm-group origin in metres: `[-0.2918, 0.8, 0]`. Segments 1–4 hinge about local Z. Portrait is a roll about the screen normal +X. Calibration: `src/product/arm.calibration.json`. Check with `npm run arm:calibrate` (must stay within 2mm on segments 1–4).
2. **Large, readable motion.** Actions that must read on screen: unfold to eye height, rise/lower, follow-face, landscape↔portrait, gesture pull-closer, turn-toward-user. Code poses now aim at this (`folded` seg2 −50°, `closer`, `turned` yaw 72°, `unfold-eye`, `pull-closer`, `turn-toward`). Unit test `moves the screen by a clearly readable distance` checks travel (>0.28m unfold, >0.15m pull, >0.2m yaw) on the **proxy** FK. That is not a picture. The next agent must confirm the same travel on the **real mesh**, in frame, with the base and pivots still visible on action shots.
3. **Premium materials and light.** Brushed/anodized metal on the arm, matte black on the base, glass on the display. Black studio, rim/edge light, reflections, depth of field, motion blur, bloom. CG-ad level, not a clay viewport.
4. **Offline renderer.** three.js stays the live preview. Final frames should move to a code-driven offline renderer. Headless Blender 4.0.2 (`bpy`, Eevee or Cycles) is the intended option. `scripts/blender/render_plates.py` is a **draft that has not been run**. It imports the GLB, replaces materials, applies the same Y-up joint deltas (converted to Blender Z-up), and writes PNG plates. Prove one frame before a full render. `scripts/blender/inspect_glb.py` only lists the imported scene.
5. **Cinematic camera, with the Dyson lock.** When the arm moves, the camera stays locked and the frame contains the whole move. On holds, use the new grammar already named in `src/camera/moves.ts`: `fly-along`, `macro-orbit`, `whip`, `push-impact` (ease-out, fast in / slow out), `rack-focus`. Also keep `slow-pull`, `slow-push`, `orbit`, `crane`, `macro`, `handheld`, `over-shoulder`.
6. **Look at pixels.** `src/director/pixels.ts` is a pixel diff (product visible, motion obvious). Wire it to real frames and auto-redo failing shots. A vision model may replace it later via `PREVIS_VISION_URL` (`src/director/rubric.ts`). Geometric scores alone were not enough; sample #1 scored 0.969 and was still rejected.
7. **Re-cut to the owner's music** once the file exists. Do not author a new placeholder. Map sections (intro, build, drop, breakdown, second drop, outro) onto sequences, then `music:swap`.

1. **真实几何。** 渲主人的 GLB，不要代理体。网盘：https://drive.google.com/file/d/1laS08lVB8YCPYdybRQYlttEvu5Xx3F7b/view （KeyShot，约 148MB，毫米，根节点已缩放到米，无 Draco/meshopt，约 76MB PNG 贴图）。**不要提交这个文件。** 减面、换成我们自己的材质之后，如果文件小，可以提交衍生品。节点包括底座、机械臂 1–5 段（平级，不是父子链）、显示器支架和手拧螺母、Studio Display、办公桌、Mac Studio、Type-C，以及三个 KeyShot 机位。转轴靠近各段原点。臂组世界原点（米）：`[-0.2918, 0.8, 0]`。1–4 段绕局部 Z。竖屏绕屏幕法线 +X。校准表：`src/product/arm.calibration.json`。用 `npm run arm:calibrate` 检查（1–4 段要在 2mm 内）。
2. **动作要大、要看得懂。** 必须在画面里读出来的动作：展开到眼高、升降、跟随人脸、横竖屏、手势拉近、转向使用者。代码里的姿态已经朝这个改（`folded` 的 seg2 −50°、`closer`、`turned` 偏航 72°，以及 `unfold-eye`、`pull-closer`、`turn-toward`）。单测 `moves the screen by a clearly readable distance` 只在**代理**正向运动学上检查行程（展开 >0.28m，拉近 >0.15m，转向 >0.2m）。这不是画面。下一位必须在**真实网格**上确认同样的行程，并且动作镜里底座和转轴仍在画内。
3. **材质和光。** 手臂拉丝/阳极金属，底座哑光黑，屏幕玻璃。黑棚、轮廓光、反射、景深、运动模糊、辉光。要达到广告 CG，不是白模视口。
4. **离线渲染。** three.js 留作实时预览。成片改由代码驱动的离线渲染器。方向是无界面 Blender 4.0.2（`bpy`，Eevee 或 Cycles）。`scripts/blender/render_plates.py` 是**没跑过的草稿**。它导入 GLB、替换材质、用同一套 Y 向上关节增量（转换到 Blender 的 Z 向上），写出 PNG 图版。全片之前先证明一帧。`scripts/blender/inspect_glb.py` 只列出导入后的场景。
5. **电影感运镜，同时守住戴森规则。** 手臂在动，机位锁死，画面装得下整个动作。静止镜头用 `src/camera/moves.ts` 里已经命名的：`fly-along`、`macro-orbit`、`whip`、`push-impact`（ease-out，先快后慢）、`rack-focus`。原有的 `slow-pull`、`slow-push`、`orbit`、`crane`、`macro`、`handheld`、`over-shoulder` 仍在。
6. **看像素。** `src/director/pixels.ts` 做像素差（产品在不在、动作明不明显）。要接到真实画面上，不合格就自动重做。以后可以用视觉模型，通过 `PREVIS_VISION_URL`（`src/director/rubric.ts`）。只靠几何分不够：样片 1 均分 0.969，仍然被否。
7. **等主人的音乐来了再重切。** 不要再做一条占位曲。把段落对上 intro、build、drop、breakdown、第二次 drop、outro，然后跑 `music:swap`。

## Architecture / 架构

One project document. `evaluateProject(project, frame)` is a pure function shared by the editor and Remotion. Shots are `[start, end)` in integer frames. Metres, Y up.

```
brief
  → writeNarrative / directShots / photograph / editRhythm     src/director/plan.ts
  → compileFilm                                                src/director/compile.ts
  → applyCommands (whitelist, validated, undoable)            src/core/commands.ts
  → scoreProject (geometry) + scorePixels (when frames exist) src/director/rubric.ts, pixels.ts
  → Remotion MP4                                              cli/render.ts, src/render/Composition.tsx
```

Long form is film → sequences → shots. Shot `kind` is `3d` or `broll-code`. B-roll is Remotion/HTML type (`src/render/Broll.tsx`). 3D is three.js today. If `usePlates` is set and `output/plates/0000.png` exists, Remotion shows those PNGs instead of the viewport. That hook is how Blender frames should enter the edit. It has not been used.

The arm chain is built in code because the GLB segments are siblings. Joints: `base_yaw`, `seg1`–`seg4`, `portrait`. Limits in the calibration JSON are previs defaults, not factory stops.

同一份项目。`evaluateProject(project, frame)` 是纯函数，编辑器和 Remotion 共用。镜头区间 `[start, end)`，整数帧。米，Y 向上。

长片是影片 → 段落 → 镜头。`kind` 为 `3d` 或 `broll-code`。B-roll 是 Remotion/HTML 排版（`src/render/Broll.tsx`）。三维目前是 three.js。若设置 `usePlates` 且存在 `output/plates/0000.png`，Remotion 会用这些 PNG 代替视口。这是 Blender 画面进成片的接口。还没用过。

运动链在代码里，因为 GLB 各段是平级的。关节：`base_yaw`、`seg1`–`seg4`、`portrait`。校准 JSON 里的限位是预演默认值，不是出厂值。

## Setup / 环境

```bash
git clone <this-repo>
npm ci --ignore-scripts
npm test
npm run test:host
npm run check
```

Node 22. The editor/Remotion path needs the existing npm deps (`three`, `remotion`, `@react-three/postprocessing`). Chrome is used by Remotion (`/usr/bin/google-chrome` if present).

GLB, not in git:

```bash
mkdir -p models
# download the Drive file to models/cybopal-arm.glb
# or: export PREVIS_ARM_GLB=/absolute/path/to/file.glb
npm run arm:calibrate
```

Blender, only when the next agent starts final frames. This image has Blender 4.0.2 (`sudo apt-get install blender`). Do not commit the 148MB file. Plate PNGs are gitignored (`films/**/output/plates/`).

```bash
npm ci --ignore-scripts
npm test
npm run test:host
npm run check
```

Node 22。编辑器和 Remotion 用现有依赖（`three`、`remotion`、`@react-three/postprocessing`）。Remotion 用 Chrome（有的话用 `/usr/bin/google-chrome`）。

GLB 不进 git：

```bash
mkdir -p models
# 把网盘文件下到 models/cybopal-arm.glb
# 或者 export PREVIS_ARM_GLB=/绝对路径/file.glb
npm run arm:calibrate
```

只有开始做最终画面时才需要 Blender。这台环境是 Blender 4.0.2（`sudo apt-get install blender`）。不要提交 148MB 文件。图版 PNG 已被 gitignore（`films/**/output/plates/`）。

## Brief to film / 从简报到成片

```bash
npm run previs -- direct --brief-file films/cybopal-wow/BRIEF.txt --out films/zeesway-a1
npm run build
npm run previs -- render --project films/zeesway-a1/project.json --width 1280 --height 720
```

`direct` runs the scripted director (no API key): outline, project JSON, beat grid, `storyboard.html`, `prompts.json`, and a placeholder wav. `render` builds nothing by itself; `npm run build` writes `render-dist/`. Without plates, `render` still draws the three.js proxies. That is sample #1's look. Do not ship it again.

Intended final path, after the Blender script is proven:

```bash
npm run previs -- direct --brief "40秒 ZEESWAY A1，黑棚，无旁白。" --out films/zeesway-a1
npm run previs -- anim --project films/zeesway-a1/project.json --out films/zeesway-a1/anim.json
blender -b -P scripts/blender/render_plates.py -- \
  --glb models/cybopal-arm.glb \
  --anim films/zeesway-a1/anim.json \
  --out films/zeesway-a1/output/plates \
  --probe
# read output/plates/probe-score.json; fix any shot whose notes are non-empty; then drop --probe
npm run build
npm run previs -- render --project films/zeesway-a1/project.json --width 1280 --height 720
```

`--probe` is specified to render the first and last frame of each 3D shot and exit 2 if the product is missing or an action shot does not change pixels. **This script has not been executed.** Treat it as a starting point, not a known-good renderer.

Models: `--model scripted` (default), `deepseek` (`DEEPSEEK_API_KEY`), or `codex` (the `codex` CLI). Invalid model JSON falls back to the scripted plan.

`direct` 走脚本导演（不要密钥）：大纲、项目 JSON、节拍、`storyboard.html`、`prompts.json`，以及占位 wav。`render` 自己不构建；`npm run build` 才写出 `render-dist/`。没有图版时，`render` 仍画 three.js 代理。那就是样片 1。不要再交一版。

Blender 脚本被证明可用之后，成片路径是上面的第二段命令。`--probe` 的设计是：每个三维镜头渲首尾帧，产品不在画面里、或动作镜像素几乎没变，就以退出码 2 停下。**这个脚本没跑过。** 把它当起点，不要当已经能用的渲染器。

模型：`--model scripted`（默认）、`deepseek`（`DEEPSEEK_API_KEY`）、`codex`（本机 `codex` CLI）。模型返回的 JSON 不合法时，退回脚本分镜。

## Swap music and re-cut / 换音乐并重切

Put the owner's file anywhere outside git. One command decodes it, detects beats, retimes every shot by `intent.beats`, moves keyframes with their shot, points the project at `assets/score.wav`, rewrites the storyboard and prompts, and renders:

```bash
npm run previs -- music:swap \
  --project films/zeesway-a1/project.json \
  --audio /path/to/owners-track.wav \
  --width 1280 --height 720
```

`--no-render` retimes only. The detected onsets become the grid (`timeline.align`). Map the owner's sections onto sequences before or after that by editing `intent.beats` and sequence ranges, then run `music:swap` or `previs align --project ... --bpm N`. Do not download or commit the copyrighted Raf Riley track. The 178 BPM bed is only a click grid.

把主人的文件放在 git 外面。一条命令会转码、检拍、按 `intent.beats` 重排每个镜头、把关键帧跟着镜头走、把项目指到 `assets/score.wav`、重写分镜和提示词，然后渲染。

`--no-render` 只重排。检测到的重拍成为网格（`timeline.align`）。可以先改 `intent.beats` 和段落范围，把 intro / build / drop / breakdown / 第二次 drop / outro 对上段落，再跑 `music:swap` 或 `previs align --project ... --bpm N`。不要下载或提交有版权的 Raf Riley 曲。178 BPM 底只是节拍网格。

## Director skill / 导演规则

File: `skills/director/SKILL.md`.

It still describes the rejected sample's Apple/Dyson rules (black field, no VO, constant 0.10 m/s pull, accordion timing, lock the camera when the arm moves). Edit that file when a rule changes. Keep numbers (beats, metres, degrees, f-stops), not adjectives. Then change `src/director/plan.ts` so the scripted director obeys the file. The code story and the skill **currently disagree**: the skill is sample #1, the plan is the ZEESWAY cut. Reconcile them before rendering.

文件：`skills/director/SKILL.md`。

它仍是被否掉的样片那套苹果/戴森规则（黑场、无旁白、0.10 m/s 匀速后拉、手风琴节奏、手臂动时机位锁死）。改规则就改这个文件。写数字（拍、米、度、光圈），不要写形容词。然后改 `src/director/plan.ts`，让脚本导演服从这份文件。**代码故事和 skill 现在不一致：** skill 是样片 1，plan 是 ZEESWAY 这一版。渲之前先对齐。

## MCP and CLI / 命令

```bash
npm run previs -- commands
npm run previs -- mcp
```

MCP stdio server, tools: `previs_commands`, `previs_direct`, `previs_apply`, `previs_evaluate`, `previs_beats`, `previs_align`, `previs_storyboard`, `previs_prompts`, `previs_undo`, `previs_redo`.

```json
{
  "mcpServers": {
    "previs": {
      "command": "npm",
      "args": ["run", "previs", "--silent", "--", "mcp"],
      "cwd": "/absolute/path/dsh-product-previs"
    }
  }
}
```

Whitelist applied by `applyCommands` (one batch = one undo step, history in `project.json.history.json`, gitignored):

`project.update` `asset.add` `object.add|update|remove` `rig.set` `shot.add|update|remove` `track.set|remove` `keyframe.set` `film.set` `sequence.add|update|remove` `audio.set` `arm.action` `camera.apply` `timeline.align`

Arm actions: `hold` `hold-folded` `hold-portrait` `unfold` `unfold-eye` `fold` `rise` `lower` `follow-face` `pull-closer` `turn-toward` `portrait` `landscape` `nod` `cable-tuck`.

CLI extras that are not project commands: `direct`, `apply`, `evaluate`, `beats`, `align`, `music:swap`, `storyboard`, `prompts`, `render`, `anim`, `undo`, `redo`, `validate`, `mcp`.

`anim` writes `anim.json` (per 3D frame: joint angles, camera, base-screen text) for Blender. It does not render.

DeepSeek-Harness still exposes `previs_apply` in `host/index.mjs` over the same whitelist. The host bundle is `host/generated-core.mjs` (`npm run` via `node scripts/build-core.mjs`).

MCP 是 stdio。工具：`previs_commands`、`previs_direct`、`previs_apply`、`previs_evaluate`、`previs_beats`、`previs_align`、`previs_storyboard`、`previs_prompts`、`previs_undo`、`previs_redo`。

`applyCommands` 的白名单（一批 = 一步撤销，历史在 `project.json.history.json`，已 gitignore）：见上面的英文列表。

不是项目命令、只在 CLI 里的：`direct`、`apply`、`evaluate`、`beats`、`align`、`music:swap`、`storyboard`、`prompts`、`render`、`anim`、`undo`、`redo`、`validate`、`mcp`。

`anim` 写出 `anim.json`（每个三维帧的关节角、机位、底座屏文字）给 Blender。它不渲染。

DeepSeek-Harness 的 `previs_apply` 在 `host/index.mjs`，用同一份白名单。宿主包是 `host/generated-core.mjs`（`node scripts/build-core.mjs`）。

## Known issues / 已知问题

- Sample #1 is the proxy film. Do not present it as the product.
- `render_plates.py` is untested. Coordinate conversion, base-screen placement, light energy, and Eevee motion blur still need a real frame.
- three.js preview still loads `assets/models/arm-white.glb`, the proxy. A decimated real-mesh preview was not exported.
- `skills/director/SKILL.md` and `src/director/plan.ts` describe different films.
- Geometric rubric can pass a bad picture. Pixel scoring is not yet in the render loop.
- Aperture, bloom, and DOF in the three.js viewport are not the final look.
- Joint limits are inferred. The owner has not supplied factory stops.
- Screen video files still show a filename, not a playing texture.
- No chat sidebar. That was deferred on purpose.

- 样片 1 是代理片。不要把它说成产品。
- `render_plates.py` 没跑过。坐标转换、底座屏位置、灯光能量、Eevee 运动模糊都要先用一帧验证。
- three.js 预览仍加载代理文件 `assets/models/arm-white.glb`。没有导出减面后的真实网格预览。
- `skills/director/SKILL.md` 和 `src/director/plan.ts` 讲的不是同一条片子。
- 几何评分可以给坏画面打高分。像素检查还没进渲染循环。
- three.js 视口里的光圈、辉光、景深不是最终画面。
- 关节限位是推断的。主人还没给工程限位。
- 屏幕上的视频文件仍只显示文件名，不播贴图。
- 没有对话侧栏。这是故意留到成片之后的。

## Next steps / 下一步

1. Read this file and `skills/director/SKILL.md`. Update the skill so it matches the ZEESWAY story above.
2. Download the GLB to `models/cybopal-arm.glb`. Run `npm run arm:calibrate`.
3. Render one Blender still of `unfold-eye` start and end. Confirm the real arm, a large move, and premium light. Fix the script before any full render.
4. Run `--probe`, then pixel-fail any action shot that does not change. Only then render plates and `previs render` with `usePlates`.
5. When the owner's track arrives, map its sections and `music:swap --no-render` first, then re-render.
6. Leave the editor chat UI until a frame the owner accepts exists.

1. 读这份文件和 `skills/director/SKILL.md`。把 skill 改成上面的 ZEESWAY 故事。
2. 把 GLB 下到 `models/cybopal-arm.glb`。跑 `npm run arm:calibrate`。
3. 用 Blender 渲 `unfold-eye` 的首帧和尾帧各一张。确认是真实手臂、动作够大、光是广告级。全片之前先改脚本。
4. 跑 `--probe`。动作镜像素没变化就重做。然后再渲图版，用 `usePlates` 跑 `previs render`。
5. 主人的曲子到了之后，先对段落，`music:swap --no-render`，再重渲。
6. 主人认可画面之前，不要做编辑器对话侧栏。
