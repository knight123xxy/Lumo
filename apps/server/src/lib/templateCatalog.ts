// 整集模板结构目录。供应用市场页与模板弹窗共用，避免两处硬编码不一致。
export type CaseProvenance = { output: string; version: string; source: string; license: string };
export type TemplateStructure = { id: "vertical-beat" | "product-three" | "knowledge-qa" | "data-brief"; name: string; summary: string; cover: string; subject: string; style: string; materials: string; provenance: CaseProvenance };

export const templateCatalog: TemplateStructure[] = [
  { id: "vertical-beat", name: "竖屏卡点", summary: "标题 → 录屏 → 纸片卡 → 主张 → 结果 → 行动，适合产品演示与口播。", cover: "/covers/vertical-beat.mp4", subject: "产品演示、口播", style: "竖屏卡点与纸片标题", materials: "主题文案、产品录屏、结果截图", provenance: { output: "8 秒 1080×1920 H.264 成片；青瓷白、琥珀黑金、蓝图纸三种主题各一份", version: "Lumo 整集模板 vertical-beat · 3 拍结构", source: "内部产品录屏与模板文案，随包样片在 .local/template-sets", license: "Lumo 自有演示素材，仅限应用内展示；对外发布前需复核录屏内容与客户授权" } },
  { id: "product-three", name: "三段产品片", summary: "痛点 → 解法 → 证据 → 行动，四拍讲清一个产品。", cover: "/covers/product-three.mp4", subject: "产品介绍", style: "按痛点、解法和证据分段", materials: "卖点文案、产品录屏、结果截图", provenance: { output: "8 秒 1080×1920 H.264 成片", version: "Lumo 整集模板 product-three · 4 段结构", source: "内部产品录屏与模板文案，随包样片在 .local/template-sets", license: "Lumo 自有演示素材，仅限应用内展示；对外发布前需复核录屏内容与客户授权" } },
  { id: "knowledge-qa", name: "知识三问", summary: "提问 → 拆解 → 例证 → 收束，适合讲解类与科普内容。", cover: "/covers/knowledge-qa.mp4", subject: "讲解、科普", style: "问答卡片与例证", materials: "三个问题、解答文案、示例素材", provenance: { output: "8 秒 1080×1920 H.264 成片", version: "Lumo 整集模板 knowledge-qa · 4 段结构", source: "内部模板文案渲染，随包样片在 .local/template-sets", license: "Lumo 自有演示素材，仅限应用内展示；对外发布前需复核文案来源" } },
  { id: "data-brief", name: "数据播报", summary: "数字 → 来源 → 图表 → 结论，适合财经与数据解读。", cover: "/covers/data-brief.mp4", subject: "财经、数据解读", style: "数字卡片与图表", materials: "数据和出处、图表截图、结论文案", provenance: { output: "8 秒 1080×1920 H.264 成片", version: "Lumo 整集模板 data-brief · 4 段结构", source: "内部模板文案渲染，随包样片在 .local/template-sets", license: "Lumo 自有演示素材，仅限应用内展示；对外发布前需复核数据出处" } },
];

export const projectCase = {
  id: "lumoPromo",
  name: "Lumo 产品宣传片",
  summary: "用产品录屏介绍分镜画布、应用市场和剪辑时间线。",
  subject: "产品演示",
  style: "实录宣传片",
  materials: "示例工程附带产品录屏、片头、片尾与节奏音轨。",
  preview: "/cases/lumoPromo.mp4",
  provenance: { output: "15.5 秒 1080×1920 MP4；附可编辑时间线工程（5 段视频、1 条音轨）", version: "Lumo 产品宣传片 v3", source: "samples/lumo-promo-v3 的录屏、片头片尾与节奏音轨", license: "Lumo 自有素材，可随应用分发；对外二次发布前复核出镜与音乐授权" },
} as const;

export const caseThemes = [
  { id: "celadon-paper", name: "青瓷白" },
  { id: "amber-noir", name: "琥珀黑金" },
  { id: "blueprint-stone", name: "蓝图纸" },
] as const;
export type CaseThemeId = (typeof caseThemes)[number]["id"];
