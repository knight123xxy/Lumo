# 259 · OpenMontage 借鉴清单 + MotionGit 集成方案（2026-11-21）

> 只借鉴思路，不搬代码（OpenMontage 为 AGPL-3.0，传染性强，与 opentake 同理）。

---

## 一、两个项目是什么

| | OpenMontage | MotionGit |
|---|---|---|
| 仓库 | `OpenMontageInc/OpenMontage` ⭐8.2 万 | `motiontemplates/all` + `adunext/*`（MIT）|
| License | **AGPL-3.0**（不可闭源 fork）| 模板 MIT / 格式开放 |
| 本质 | **Agent 技能包**（无 GUI，LLM 助手即控制面）| **`.motion` 动效模板格式**（ZIP+JSON+动画源码）|
| 规模 | 12 条流水线、181 工具、700+ skill、20 产物 schema | 164 模板、166 Demo |

---

## 二、OpenMontage 关键思路（可借鉴）

### 核心范式：Agent 即控制面
> 「There is no runtime Python orchestrator; the agent _is_ the control plane.」
LLM 助手读流水线清单 → 按阶段读技能 → 调工具 → 写检查点 → 自审 → 人工确认。**没有硬编码编排器**。

### 1. 流水线清单化（Pipeline as YAML）
每条流水线（`pipeline_defs/*.yaml`）是纯声明：
```yaml
stages:
  - name: research
    skill: pipelines/explainer/research-director   # 该阶段的导演技能
    produces: [research_brief]                      # 产出物
    checkpoint_required: false
    human_approval_default: false
    review_focus: [ ... ]                           # 评审焦点
    success_criteria: [ ... ]                       # 成功标准
```
统一阶段流：`research → proposal → script → scene_plan → assets → edit → compose`。

### 2. 导演技能（Director skills）
每个阶段一个 markdown「导演技能」：研究导演 / 提案导演 / 脚本导演 / 分镜导演 / 素材导演 / 剪辑导演 / 合成导演 / 发布导演 + 元技能（reviewer、checkpoint-protocol、skill-creator）。

### 3. 研究先行（research-first）
写脚本前先做 web 研究（YouTube/Reddit/HN/新闻/学术），输出**带引用**的 research_brief：≥3 数据点、≥3 角度、≥5 来源。视频内容基于真实信息，不靠幻觉。

### 4. 检索式真视频素材（Retrieval-first corpus）★ 最有区分度
`lib/` 有 `corpus.py` + `clip_embedder.py`（CLIP 索引）+ `scoring.py`（语义排序）。Documentary Montage 流水线从 **17 个免费素材库**（Pexels/Archive.org/NASA/Wikimedia/Unsplash）检索真实运动镜头，剪成时间线——**不是「动画静图当视频」**，而是真 B-roll。

### 5. 成本治理（Cost governance）
`cost_tracker.py`：estimate → reserve → reconcile。每条流水线默认预算（如 $2.00）、每阶段最多修订 3 次、最多驳回 3 次、最长 20 分钟。

### 6. 评审门（Review gates）
每阶段有 `review_focus` + `human_approval_default`，创意决策点要人工确认。

### 7. 产物 schema + 检查点
20 个产物 schema（research_brief → publish_log），每阶段写 JSON 检查点，可恢复续跑。

---

## 三、OpenMontage → Lumo 借鉴优先级

| 优先级 | 借鉴点 | 落到 Lumo 的什么 |
|---|---|---|
| ★★★ | 检索式真视频素材（CLIP 索引免费库）| 新增「真实 B-roll 素材」能力，补 Lumo「全靠生成」的短板 |
| ★★★ | 流水线清单 + 导演技能 | 把「一键成片」升级为结构化流水线；技能编码进 Skill Hub |
| ★★☆ | 成本治理 + 评审门 | 接算力汇后加「预算预估 + 限额」+「阶段确认」 |
| ★★☆ | 研究先行 | 创作助手加「写脚本前先研究」阶段 |
| ★☆☆ | 产物 schema + 检查点 | 生成任务可恢复（Toonflow 已有 saveTaskData，可扩展）|

---

## 四、MotionGit `.motion` 集成方案（已实测样本 385712）

### 实测包结构（17MB，解包后）
```
00-START-HERE.md        # AI 交接：怎么跑模板、plan→prepare→preview→render 流程
CREATION.md             # 制作指南
adapter.py              # 运行时适配器（Python）：plan() 编排 + prepare() 媒体处理
chrome.mjs              # Chrome 无头渲染入口
asset-manifest.json     # 素材契约：path/role/sha256/license/use
content-boundary.json   # 文件完整性：每个文件 role + sha256
core/basic.js           # 动画源码（HTML/JS，Chrome 渲染）
core/audio-events.json  # 声音设计
core/assets/ + core/brand/  # 素材 + 预渲染帧（469 个文字槽）
```
> 公开版用 `content-boundary.json` + `asset-manifest.json` 做契约，`motion.json`/`guide.json` 是官网个人版才有的文件。

### 运行栈 = Python(adapter.py) + Chrome 无头 + ffmpeg
依赖：Node 22+ / Python 3.11+ / uv / ffmpeg / Chrome。
工作流：`plan(input)` → `prepare(input,out)`（ffmpeg 裁切/人脸/抽帧）→ Chrome 渲染帧 → ffmpeg 合成 → `-with-audio.mp4`。

### 关键结论：Lumo 已有大部分运行时
- Lumo（Toonflow）**已内置 Chrome headless + ffmpeg**（edit-host/插件运行时）。
- 只需补 **Python 3.11 + uv**（或把 adapter.py 的职责用 bun/node 重实现）。
- 所以集成成本低：不是从零搭渲染，而是「解析 .motion + 跑 adapter 流水线」。

### 集成落点（Lumo = Toonflow fork）
做一个「**动效模板**」插件/节点，复用 Toonflow 插件系统 + 已有 Chrome/ffmpeg：
1. **`.motion` 解析器**：unzip → 校验 `content-boundary.json`（sha256）→ 读 `asset-manifest.json` 拿素材槽位。
2. **模板浏览 + 素材表单**：列模板（预览/尺寸/帧率）+ 填文案 + 替换图片/视频/音频（对应素材槽位 role）。
3. **运行时适配器**：跑 `adapter.py` 的 plan→prepare→preview→render（或重写成 bun 版），Chrome 渲染帧 + ffmpeg 合成，输出 mp4。

### 待确认
- adapter.py 的 `preview`/`render` 完整入口（样本里只见 plan/prepare，render 可能在 chrome.mjs 或后续命令）。
- 官网个人版（motion.json/guide.json）与公开版的结构差异。

### ⚠️ 实测发现：公开版是完整自包含的（更正）
初次 `unzip | head -40` 会 SIGPIPE 提前杀掉解压进程，误判「缺 render.mjs/mix.py」。**用完整解压（不截断）后确认：公开版 329 个文件全部 sha256 通过，是完整包**。

完整结构：
```
motion.json             # 清单：template / runtime(entry=adapter.py) / parameters / output / license / permissions / ai / extensions
params.schema.json      # 参数契约（JSON Schema）：mode/language/layout/duration/title/presenterLabel/scenes/content文字槽/media/soundEffects/captions
adapter.py              # 运行时适配器：plan / prepare / preview / events / render
render.mjs + mix.py     # 渲染入口：Chrome 无头渲染帧 → mix.py 合成音频
guide.json / guide.en.json  # AI 指南
content-boundary.json + integrity.json  # 文件完整性（sha256）
asset-manifest.json     # 素材契约：path/role/sha256/license/use
chrome.mjs / core/      # Chrome 解析 + 动画源码（basic.js + audio-events.json + assets + brand）
package.json + licenses/ + examples/
```

### 集成结论
`.motion` 是自包含的「模板工程」。Lumo 集成三步：
1. **解析器**（已实现 `packages/motiongit/parseMotion.ts`，329/329 校验通过）：读 `motion.json` + `params.schema.json` + 校验 integrity。
2. **参数表单**：由 `params.schema.json` 生成表单（scenes/content 文字槽/media/soundEffects）。
3. **渲染运行器**：跑 `adapter.py plan→prepare→render`（Python+jsonschema）+ `render.mjs`（Chrome 无头）+ `mix.py`（ffmpeg 合成）→ mp4。Lumo 已有 Chrome+ffmpeg，需补 Python 3.11+jsonschema（或把 adapter 重写成 bun）。

---

## 五、下一步

1. 下载一个 `.motion` 样本包（编号 385712 公开版），解包看 `motion.json` + 目录结构，拿到精确契约。
2. 据此在 Lumo 里实现「动效模板」节点/插件的最小闭环：解析 → 填参 → 渲染导出。
3. OpenMontage 的「检索式真视频素材」作为独立功能另行立项（需要接入免费素材库 + CLIP 索引）。
