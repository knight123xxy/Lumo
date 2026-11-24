// 由 apps/web/scripts/generatePipelines.ts 从 assets/pipelines 生成，不要手改。
export type PipelineStage = { name: string; detail: string };
export type Pipeline = { slug: string; name: string; summary: string; category: string; stages: PipelineStage[] };

export const pipelineCatalog: Pipeline[] = [
  {
    "slug": "animated-explainer",
    "name": "动画解说流水线",
    "summary": "从研究到成片的动画解说视频：先做研究，再出脚本分镜，生成动画素材，剪辑合成。",
    "category": "生成类",
    "stages": [
      {
        "name": "研究",
        "detail": "收集事实、数据、来源，输出带引用的研究简报"
      },
      {
        "name": "提案",
        "detail": "把研究浓缩成一个主张、一个角度"
      },
      {
        "name": "样片",
        "detail": "先做 10 秒视觉样片，定风格和节奏"
      },
      {
        "name": "脚本",
        "detail": "写解说词，按画面分段"
      },
      {
        "name": "分镜",
        "detail": "把脚本拆成分镜，每个镜头一句话"
      },
      {
        "name": "素材",
        "detail": "按分镜生成/检索图片、视频、音乐"
      },
      {
        "name": "剪辑",
        "detail": "按节奏剪辑，加字幕音效"
      },
      {
        "name": "合成",
        "detail": "合成成片，统一风格"
      },
      {
        "name": "发布",
        "detail": "输出成片与发布文案"
      }
    ]
  },
  {
    "slug": "animation",
    "name": "动画短片流水线",
    "summary": "纯动画短片，强调角色、场景、动作的一致性。",
    "category": "动画类",
    "stages": [
      {
        "name": "研究",
        "detail": "确定故事背景与参考"
      },
      {
        "name": "提案",
        "detail": "一句话故事 + 视觉方向"
      },
      {
        "name": "样片",
        "detail": "做关键帧样片"
      },
      {
        "name": "脚本",
        "detail": "写故事与对白"
      },
      {
        "name": "分镜",
        "detail": "逐镜拆解"
      },
      {
        "name": "素材",
        "detail": "生成角色、场景、动作素材"
      },
      {
        "name": "剪辑",
        "detail": "按分镜剪辑"
      },
      {
        "name": "合成",
        "detail": "合成与调色"
      },
      {
        "name": "发布",
        "detail": "导出与发布"
      }
    ]
  },
  {
    "slug": "avatar-spokesperson",
    "name": "数字人代言流水线",
    "summary": "数字人口播代言，真人形象+口型同步。",
    "category": "定制类",
    "stages": [
      {
        "name": "立意",
        "detail": "确定代言主题与受众"
      },
      {
        "name": "脚本",
        "detail": "写口播稿"
      },
      {
        "name": "分镜",
        "detail": "确定机位与景别"
      },
      {
        "name": "素材",
        "detail": "准备数字人形象、背景、字幕模板"
      },
      {
        "name": "剪辑",
        "detail": "合成口型与画面"
      },
      {
        "name": "合成",
        "detail": "输出成片"
      },
      {
        "name": "发布",
        "detail": "发布文案与封面"
      }
    ]
  },
  {
    "slug": "character-animation",
    "name": "角色动画流水线",
    "summary": "有角色的动画，角色设计→绑定→表演全流程。",
    "category": "动画类",
    "stages": [
      {
        "name": "研究",
        "detail": "角色背景与风格参考"
      },
      {
        "name": "提案",
        "detail": "角色设定方向"
      },
      {
        "name": "样片",
        "detail": "角色样片"
      },
      {
        "name": "脚本",
        "detail": "故事脚本"
      },
      {
        "name": "角色设计",
        "detail": "角色三视图、表情、配色"
      },
      {
        "name": "绑定",
        "detail": "角色绑定与动作规划"
      },
      {
        "name": "分镜",
        "detail": "逐镜分镜"
      },
      {
        "name": "素材",
        "detail": "生成动作素材"
      },
      {
        "name": "剪辑",
        "detail": "剪辑"
      },
      {
        "name": "合成",
        "detail": "合成"
      },
      {
        "name": "发布",
        "detail": "发布"
      }
    ]
  },
  {
    "slug": "cinematic",
    "name": "电影感流水线",
    "summary": "追求电影质感，讲究光影、构图、情绪。",
    "category": "电影类",
    "stages": [
      {
        "name": "研究",
        "detail": "题材背景"
      },
      {
        "name": "提案",
        "detail": "主题与视觉基调"
      },
      {
        "name": "样片",
        "detail": "影调样片"
      },
      {
        "name": "脚本",
        "detail": "剧本"
      },
      {
        "name": "分镜",
        "detail": "镜头语言设计"
      },
      {
        "name": "素材",
        "detail": "生成电影级素材"
      },
      {
        "name": "剪辑",
        "detail": "节奏与情绪剪辑"
      },
      {
        "name": "合成",
        "detail": "调色与合成"
      },
      {
        "name": "发布",
        "detail": "发布"
      }
    ]
  },
  {
    "slug": "clip-factory",
    "name": "片段工厂流水线",
    "summary": "快速批量产出短视频片段，轻量流程。",
    "category": "定制类",
    "stages": [
      {
        "name": "立意",
        "detail": "确定片段主题"
      },
      {
        "name": "脚本",
        "detail": "短文案"
      },
      {
        "name": "分镜",
        "detail": "简单分镜"
      },
      {
        "name": "素材",
        "detail": "快速生成素材"
      },
      {
        "name": "剪辑",
        "detail": "快剪"
      },
      {
        "name": "合成",
        "detail": "合成"
      },
      {
        "name": "发布",
        "detail": "发布"
      }
    ]
  },
  {
    "slug": "hybrid",
    "name": "混合流水线",
    "summary": "实拍+生成混合，真人与动画结合。",
    "category": "混合类",
    "stages": [
      {
        "name": "立意",
        "detail": "确定混合方式"
      },
      {
        "name": "脚本",
        "detail": "脚本"
      },
      {
        "name": "分镜",
        "detail": "分镜"
      },
      {
        "name": "素材",
        "detail": "实拍+生成素材"
      },
      {
        "name": "剪辑",
        "detail": "剪辑"
      },
      {
        "name": "合成",
        "detail": "合成"
      },
      {
        "name": "发布",
        "detail": "发布"
      }
    ]
  },
  {
    "slug": "localization-dub",
    "name": "本地化配音流水线",
    "summary": "视频翻译配音，多语言本地化。",
    "category": "定制类",
    "stages": [
      {
        "name": "立意",
        "detail": "确定目标语言与风格"
      },
      {
        "name": "脚本",
        "detail": "翻译与本地化改写"
      },
      {
        "name": "分镜",
        "detail": "字幕与配音对应"
      },
      {
        "name": "素材",
        "detail": "配音音轨"
      },
      {
        "name": "剪辑",
        "detail": "对齐口型与字幕"
      },
      {
        "name": "合成",
        "detail": "合成"
      },
      {
        "name": "发布",
        "detail": "发布"
      }
    ]
  },
  {
    "slug": "podcast-repurpose",
    "name": "播客重制流水线",
    "summary": "把播客音频重制成视频，配画面字幕。",
    "category": "定制类",
    "stages": [
      {
        "name": "立意",
        "detail": "确定重制角度"
      },
      {
        "name": "脚本",
        "detail": "音频转文字+摘重点"
      },
      {
        "name": "分镜",
        "detail": "配画面"
      },
      {
        "name": "素材",
        "detail": "画面与字幕素材"
      },
      {
        "name": "剪辑",
        "detail": "对齐音频"
      },
      {
        "name": "合成",
        "detail": "合成"
      },
      {
        "name": "发布",
        "detail": "发布"
      }
    ]
  },
  {
    "slug": "screen-demo",
    "name": "屏幕演示流水线",
    "summary": "软件演示，录屏+合成终端动画。",
    "category": "录屏类",
    "stages": [
      {
        "name": "实拍录屏",
        "detail": "录真实操作"
      },
      {
        "name": "终端演示",
        "detail": "生成终端动画"
      },
      {
        "name": "立意",
        "detail": "确定演示重点"
      },
      {
        "name": "脚本",
        "detail": "解说词"
      },
      {
        "name": "分镜",
        "detail": "分镜"
      },
      {
        "name": "素材",
        "detail": "素材整理"
      },
      {
        "name": "剪辑",
        "detail": "剪辑"
      },
      {
        "name": "合成",
        "detail": "合成"
      },
      {
        "name": "发布",
        "detail": "发布"
      }
    ]
  },
  {
    "slug": "talking-head",
    "name": "口播流水线",
    "summary": "单人口播视频，真人/数字人+字幕。",
    "category": "口播类",
    "stages": [
      {
        "name": "立意",
        "detail": "确定主题"
      },
      {
        "name": "脚本",
        "detail": "口播稿"
      },
      {
        "name": "分镜",
        "detail": "景别与字幕"
      },
      {
        "name": "素材",
        "detail": "口播画面素材"
      },
      {
        "name": "剪辑",
        "detail": "剪辑"
      },
      {
        "name": "合成",
        "detail": "合成"
      },
      {
        "name": "发布",
        "detail": "发布"
      }
    ]
  }
];
