# 产品白模预演工作台

一个跑在 [DeepSeek-Harness](https://github.com/deepseek-ai/deepseek-harness) 里的产品预演工作台：导入真实 GLB，用简化人偶和真实摄像机编排镜头，实时双视图预览，最后导出一部完整白模 MP4。

面向广告 / 产品片的拍前预演：先用低成本白模把**运镜、动作、节奏**定下来，再交给真人实拍或 AI 视频模型。

## 能做什么

- **真实模型进来**：导入 GLB，自动剥出白模（去掉贴图、UV、复杂材质，保留部件层级、变换和米制尺度）。原始素材只读复制，不改源文件。
- **产品动作**：分部件绑定关节（轴心、轴向、角度范围、父子链），做关节运动、整体位移、拆解与回装。
- **人物**：分关节简化人偶，支持站 / 坐 / 走、转身、抬手、伸手，逐帧姿态混合。
- **布景**：地面、方块、屏幕（可真实贴图 / 显示文字，可挂到产品部件上随动）、灯光。
- **双视图**：左边是观察三维场景（不改变拍摄机位），右边是真实摄影机监看。焦段、景别、构图所见即所得。
- **时间线**：绝对帧求值，关键帧可编辑曲线；撤销 / 重做持久化。
- **导出**：Remotion 逐帧渲染，导出 MP4。

## 核心设计

**同一个求值核心**同时驱动编辑器预览和离线渲染。`evaluateProject(project, frame)` 是纯函数，给定项目和帧号返回该帧的完整状态（相机位姿、对象变换、每个产品部件的矩阵、人偶骨架、屏幕内容）。所以你在视口里看到的就是导出的画面，不存在"预览和成片不一致"。

这也意味着**任意帧可随机访问**——拖动时间线、倒序定位、跳帧都不依赖播放历史。

`src/core/types.ts` 是共享契约：米制单位、Y 轴向上、整数帧、镜头左闭右开 `[start, end)`。

## 运镜求解

运镜不是手写米数，而是按意图求解。在 `scripts/stage-shots.mjs` 里给每个镜头写：

- `az` 水平方向角
- `el` 俯角
- `fill` 主体应占画面高度的比例（1 = 满幅）
- `focal` 焦段

求解器按真实投影算出机位和注视点，`npm run audit:camera` 再逐帧检查主体有没有出画。运镜求解器有 7 项单元测试（投影正确性、构图占比、距离单调性、指定屏幕落点、方位角、俯角、不可达拒绝）。

```bash
npm run stage:shots    # 按意图重算机位
npm run audit:camera   # 逐帧检查是否有主体出画
```

## 安装

作为 DSH 插件安装：

```bash
git clone <this-repo> dsh-product-previs
# 在 DSH 插件管理器中安装该目录，或把路径加进 profile 的 dependencies
```

安装不需要执行构建脚本——仓库里已带 `dist/`（编辑器页面）、`render-dist/`（Remotion 场景）和 `host/generated-core.mjs`（宿主用的求值核心）。这样安装器不会被 esbuild 之类的 postinstall 卡住。

> `dist/` 和 `render-dist/` 默认在 `.gitignore` 里。发包前需要先 `npm run build`，再强制添加：`git add -f dist render-dist host/generated-core.mjs`。

## 开发

```bash
npm ci --ignore-scripts
npm run build      # 编辑器 + Remotion 场景 + 宿主核心
npm run check      # TypeScript
npm test           # 核心求值 / 命令 / 校验（vitest）
npm run test:host  # 宿主接口 + 浏览器半边 + 运镜求解
```

测试共 42 项，分四组：

- **核心 28 项**：绝对帧求值、关节矩阵与限位、拆解回装、相机轨迹与目标跟随、屏幕挂载、人物姿态混合、命令校验、版本冲突、持久撤销。其中一项用真实 GLB 做 fixture（720 帧逐帧求值 + 部件尺寸校验），需要 `PREVIS_FIXTURE=/path/to/project.json` 才运行。
- **宿主 5 项**：原子修订锁、HTTP / Range、白模转换、渲染任务历史、素材目录授权。
- **浏览器半边 2 项**：侧栏与主视图注册、缺少右侧栏注册表时优雅降级。
- **运镜求解 7 项**。

```bash
PREVIS_FIXTURE=/path/to/project.json npm test
```

## 目录

```
src/core/       共享类型、纯求值、命令与校验
src/stage/      真实 GLB 部件、人偶骨架、屏幕、灯光、双视口
src/editor/     场景树、属性面板、镜头、时间线、保存与 DSH 上下文
src/render/     Remotion ThreeCanvas，复用同一 SceneContent 与相机函数
host/           项目存储、素材处理、SSE、修订锁、DSH 工具、后台导出
scripts/        构建、运镜求解、逐帧审计、交接包生成
```

## 项目数据

保存在 `~/Desktop/产品白模预演/<项目ID>/`：

```
project.json            assets / objects / shots / tracks 一份场景数据
.history.json           每批修改的持久撤销重做历史
assets/original/        原始素材只读副本
assets/white/           生成的白模 GLB
output/                 版本快照、导出任务记录、MP4
```

## 已知限制

- 这是白模动作 / 运镜工具，不追求材质写实。
- 人偶是分关节简化骨架，不是精细手指或面部动画，也没有物理接触仿真。
- 屏幕支持图片和文字；视频素材目前显示文件名占位，不播放视频贴图。
- 焦段真实影响构图；焦点和光圈有参数记录，但不做景深模糊。
- GLB 导入保持单位与层级，拒绝缺外部资源或不支持的几何压缩（Draco / meshopt）。新产品关节需人工校准，不自动推断机械结构。

## 许可

MIT。参考了 [StageFlow](https://github.com/taruma/stageflow)（MIT）的观察相机 / 拍摄相机分离、绝对时间求值和空间编排思路；实现代码为重新编写。详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

Remotion 按其自身许可使用。用户素材不属于本仓库。
