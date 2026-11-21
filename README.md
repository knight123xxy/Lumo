# Lumo 🎬

**Lumo 是一款「短剧/漫剧优先」的 AI 视频工作台** —— 从剧本到成片全程 AI，背后接算力汇（api.ideamine.cn）的 Seedance 视频模型。

> 基于 [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app)（MIT）修改。

## 核心功能（4 个工作界面）

- **画布** —— 无限画布拼素材；生成节点：文生视频 / 图生视频（锁脸）/ 图像生成 / 文本对话
- **白模预演** —— 粘贴剧本，一键 3D 分镜预演
- **时间线剪辑** —— 多轨剪辑：切割 / 变速 / 字幕 / 配音 / 调色 / 导出
- **Agent 对话** —— 自然语言操控全流程

## 算力汇渠道（api.ideamine.cn）

| 类型 | 模型 |
|---|---|
| 视频 | Seedance 2.0/2.5（按秒/按次）、MiniMax H3-X3（锁脸） |
| 图片 | gpt-image 2.5/2.6、qwen-image |
| 文本 | DeepSeek / GLM / Kimi / Qwen / MiMo / MiniMax（14 个模型） |

## 快速开始

```bash
bun install
bun run dev           # Web 端（server :3000 + vite :5173）
bun run dev:desktop   # macOS 桌面客户端（Electrobun）
```

## 开源许可

[MIT License](./LICENSE)。本项目基于 [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) 修改，保留原作者署名；第三方依赖和素材遵循各自的许可与版权声明。
