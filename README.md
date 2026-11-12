# 产品白模预演工作台

给 CyboPal 这种 AI 显示器机械臂做拍前预演。一条时间线上有两种镜头：三维白模（three.js）和代码 B-roll（Remotion 排版、参数、界面、结构示意）。编辑器预览和导出共用同一个纯函数 `evaluateProject(project, frame)`。所有修改都走一份白名单命令，所以对话、Codex、DeepSeek 或任何 MCP 客户端改的是同一份数据，并且可以撤销。

样片 1 对标 [Mac Studio M5](https://www.youtube.com/watch?v=3uAIqqg8ZHo)：黑场、无旁白、178 BPM、大字和慢后拉。导演规则在 [`skills/director/SKILL.md`](skills/director/SKILL.md)。

## 架构

```
简报
  → 编剧 writeNarrative        故事、字幕、有没有旁白
  → 导演 directShots           段落 → 镜头（3d | broll-code）
  → 摄影 photograph            命名运镜 + 构图预设
  → 剪辑 editRhythm            按 BPM 把切点放上节拍
  → compileFilm                编译成白名单命令，applyCommands 写入项目
  → 几何评分 + 最多两轮自动修正
  → Remotion 合成 MP4、关键帧、分镜 HTML、逐镜视频提示词
```

| 层 | 位置 | 做什么 |
| --- | --- | --- |
| 求值 | `src/core` | 绝对帧、关节矩阵、命令校验。schema 仍是 2，新字段都可选 |
| 产品 | `src/product` | 底座 → 五段臂 → 支架 → 屏幕。模型里各段是平级的，链在代码里串。IK 和动作库 |
| 机位 | `src/camera` | 原有意图求解，加上 slow-pull、locked、orbit、crane、macro、handheld、over-shoulder |
| 声音 | `src/audio` | 178 BPM 占位律动、检拍、切点重排 |
| 导演 | `src/director` | 四个角色、评分、自动修正 |
| 模型 | `src/agent/models.ts` | `scripted`（默认）、`deepseek`、`codex` |
| 接口 | `cli/main.ts` | 同一套命令的 CLI 和 MCP |

手动拖动只留在原编辑器里，当作最后微调。样片不靠它。

## 命令

```bash
npm run previs -- commands
npm run previs -- direct --brief-file films/cybopal-wow/BRIEF.txt --out films/cybopal-wow
npm run previs -- evaluate --project films/cybopal-wow/project.json --frame 120
npm run previs -- apply --project films/cybopal-wow/project.json --commands batch.json
npm run previs -- undo --project films/cybopal-wow/project.json
npm run build          # 编辑器 + Remotion 场景。渲染前需要
npm run previs -- render --project films/cybopal-wow/project.json --width 1280 --height 720
```

`batch.json` 是命令数组。白名单：

`project.update` `asset.add` `object.add|update|remove` `rig.set` `shot.add|update|remove` `track.set|remove` `keyframe.set` `film.set` `sequence.add|update|remove` `audio.set` `arm.action` `camera.apply` `timeline.align`

机械臂动作：`hold` `unfold` `fold` `rise` `lower` `follow-face` `portrait` `landscape` `nod` `cable-tuck`。

`follow-face` 把屏幕送到人脸前，默认 0.6 米，并可同时转竖屏。

运镜：`slow-pull` `slow-push` `locked` `orbit` `crane` `macro` `handheld` `over-shoulder`。构图：`centered` `macro` `side` `front` `angle45` `low` `top` `over-shoulder`。品牌片的慢后拉锁在 0.10 m/s。

换模型（可选，失败会退回脚本导演）：

```bash
# DeepSeek：需要 DEEPSEEK_API_KEY
npm run previs -- direct --model deepseek --brief "..." --out films/from-deepseek

# Codex CLI：机器上要有 codex
npm run previs -- direct --model codex --brief "..." --out films/from-codex
```

看图打分是可选的。不设置时用投影测量构图和主体大小。设置 `PREVIS_VISION_URL` 后，同一份分数会 POST 给那个服务再改回来。

## MCP

任何支持 stdio MCP 的客户端都可以接。服务名 `previs`，工具和 CLI 子命令一一对应：`previs_commands` `previs_direct` `previs_apply` `previs_evaluate` `previs_beats` `previs_align` `previs_storyboard` `previs_prompts` `previs_undo` `previs_redo`。

```json
{
  "mcpServers": {
    "previs": {
      "command": "npm",
      "args": ["run", "previs", "--silent", "--", "mcp"],
      "cwd": "/绝对路径/dsh-product-previs"
    }
  }
}
```

`previs_apply` 的 `commands` 就是上面的白名单。一次调用是一个撤销步，历史在 `project.json.history.json`（不进 git）。

DeepSeek-Harness 里原来的 `previs_apply` 也认识这些新命令。

## 换音乐

样片的节奏按 Raf Riley x Avelino《WOW.》的大约 178 BPM。那首歌有版权，仓库里没有，也不要把它提交进来。现在用的是程序生成的 178 BPM 占位律动：`films/cybopal-wow/assets/bed.wav`，每拍一个底鼓，所以检拍能对上。

换成你自己的文件（wav、mp3 都可以）时，这一条会转码、检拍、按每镜记下的拍数重排切点和动作、重写分镜，然后重新渲染：

```bash
npm run previs -- music:swap --project films/cybopal-wow/project.json --audio /path/to/track.wav --width 1280 --height 720
```

只重排、先不渲染：加上 `--no-render`。

## 换产品模型

源 GLB（KeyShot，约 148MB，毫米、根节点已缩放到米）不要提交。放到仓库外或这里：

```bash
mkdir -p models
# 把文件放成 models/cybopal-arm.glb ，或 export PREVIS_ARM_GLB=/绝对路径
npm run arm:calibrate
```

校准表是 `src/product/arm.calibration.json`。第一到第四段的铰链要对上 2mm 以内。各段在 GLB 里是平级节点，运动链是代码串起来的；转轴默认在节点原点，段 1–4 绕局部 Z，竖屏绕屏幕法线 +X。限位是预演默认值，直接改 JSON。

渲染用的是这份表生成的白模，大约十几 KB：

```bash
npm run arm:white
# 默认写到 assets/models/arm-white.glb
```

样片项目里的副本是 `films/cybopal-wow/assets/arm-white.glb`。重新 `direct` 会再复制一次。带贴图的精修预览还没接上这 148MB 文件，见文末。

## 样片

`films/cybopal-wow/`：

- `BRIEF.txt` 简报
- `project.json` 28 个镜头，约 40.1 秒，24fps，母版 1920×1080
- `outline.json` `scores.json` 四个角色和几何评分
- `storyboard.html` 分镜
- `prompts.json` 给 Kling / Veo 的英文提示词
- `assets/bed.wav` 占位律动
- `output/sample.mp4` 已包含的 1280×720、40.2 秒成片（母版时间线仍是 1920×1080）
- `output/frames/` 28 张镜头关键帧

重新导出：

```bash
npm run build
npm run previs -- render --project films/cybopal-wow/project.json --width 1280 --height 720
```

去掉 `--width/--height` 就按项目的 1920×1080 渲。`--no-grade` 关掉景深和辉光。`--frame 200` 只出一帧，用来看画面。

## 开发

```bash
npm ci --ignore-scripts
npm test           # 求值、命令、IK、节拍、整片编译
npm run test:host  # 宿主、浏览器半边、运镜求解
npm run check
```

原来的 42 项还在：核心 28（其中 1 项要 `PREVIS_FIXTURE` 才跑真实 GLB）、宿主 5、浏览器半边 2、运镜求解 7。新增的是 IK、白名单命令、178 BPM 检拍和样片编译。

```bash
PREVIS_FIXTURE=/path/to/project.json npm test
```

## 原来的工作台

DSH 插件的编辑器还在：双视图、时间线、撤销、Remotion 导出。安装方式没变，项目仍可以放在 `~/Desktop/产品白模预演/<项目ID>/`。`dist/`、`render-dist/` 和 `host/generated-core.mjs` 需要构建后强制加入发布包。

```bash
npm run stage:shots
npm run audit:camera
```

米制、Y 向上、整数帧、镜头区间左闭右开。参考了 [StageFlow](https://github.com/taruma/stageflow) 的观察相机和拍摄相机分离，实现是重写的。见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 这一版还不稳的地方

- 画面是按真实铰链尺寸做的白模，不是那份 148MB 贴图网格。微距能看出是简化圆柱。
- 评分默认不看像素。`PREVIS_VISION_URL` 留好了，但没有默认的视觉模型。
- 编辑器还是原来的布局，没有对话侧栏。这一轮先把管线跑通。
- 景深和辉光走 postprocessing。软件渲染上如果某一帧失败，用 `--no-grade` 退回灯光和反射。
- 关节限位是从模型推断的，需要你用校准表改成工程值。
- 屏幕上的视频素材仍然只显示文件名。样片的屏幕内容是文字。
- `scripted` 导演是确定性的，样片由它生成。Codex 和 DeepSeek 已接上，输出不是合法镜头 JSON 时会退回这套规则。
