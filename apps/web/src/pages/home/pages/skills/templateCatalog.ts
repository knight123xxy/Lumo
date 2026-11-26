// 整集模板结构目录。供应用市场页与模板弹窗共用，避免两处硬编码不一致。
export type TemplateStructure = { id: "vertical-beat" | "product-three" | "knowledge-qa" | "data-brief"; name: string; summary: string; cover: string };

export const templateCatalog: TemplateStructure[] = [
  { id: "vertical-beat", name: "竖屏卡点", summary: "标题 → 录屏 → 纸片卡 → 主张 → 结果 → 行动，适合产品演示与口播。", cover: "/covers/vertical-beat.mp4" },
  { id: "product-three", name: "三段产品片", summary: "痛点 → 解法 → 证据 → 行动，四拍讲清一个产品。", cover: "/covers/product-three.mp4" },
  { id: "knowledge-qa", name: "知识三问", summary: "提问 → 拆解 → 例证 → 收束，适合讲解类与科普内容。", cover: "/covers/knowledge-qa.mp4" },
  { id: "data-brief", name: "数据播报", summary: "数字 → 来源 → 图表 → 结论，适合财经与数据解读。", cover: "/covers/data-brief.mp4" },
];
