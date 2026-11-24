// 动效目录：一条统一管线（HTML → 透明 VP9 WebM），新增效果只需注册一个定义。
// 参数契约统一为 { kicker, name }：kicker 是小号标签，name 是主文案。
import { lowerThirdHtml, lowerThirdEffectIds, type LowerThirdEffectId } from "./lowerThird";

export type EffectParams = { kicker: string; name: string };
export type EffectDefinition = {
  id: string;
  name: string;
  category: "标题条" | "引述" | "数据" | "字幕";
  summary: string;
  seconds: number;
  width: number;
  height: number;
  html: (params: EffectParams) => string;
};

const W = 1920;
const H = 1080;
const FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';

// 调用方文案只作为 textContent 写入；转义 '<' 同时保护内联脚本边界。
const textPair = (params: EffectParams) => JSON.stringify([params.kicker, params.name]).replace(/</g, "\\u003c");

const shell = (style: string, body: string, script: string, width = W, height = H) => `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
*{box-sizing:border-box}html,body{margin:0;background:transparent;overflow:hidden}
#stage{position:relative;width:${width}px;height:${height}px;font-family:${FONT}}
${style}
</style></head><body>${body}<script>${script}</script></body></html>`;

function quoteCard({ kicker, name }: EffectParams) {
  const style = `
#quote{position:absolute;left:150px;top:50%;transform:translateY(-50%);max-width:calc(100% - 300px);display:flex;gap:34px;align-items:flex-start}
#bar{width:8px;align-self:stretch;background:#d97757;transform-origin:top;border-radius:4px}
#text{color:#fff;font-size:52px;line-height:1.4;font-weight:600;letter-spacing:-.01em;text-shadow:0 4px 26px rgba(0,0,0,.55)}
#from{margin-top:22px;color:#d9d3c8;font-size:26px;letter-spacing:.16em;text-transform:uppercase}`;
  const body = `<div id="stage"><div id="quote"><div id="bar"></div><div><div id="text" dir="auto"></div><div id="from" dir="auto"></div></div></div></div>`;
  const script = `
const bar=document.getElementById('bar'),text=document.getElementById('text'),from=document.getElementById('from');
[from.textContent,text.textContent]=${textPair({ kicker, name })};
const clamp=(v)=>Math.max(0,Math.min(1,v));
const ease=(p)=>1-Math.pow(1-p,3);
window.renderFrame=t=>{
  const grow=ease(clamp(t/0.5));
  bar.style.transform='scaleY('+grow+')';
  const enter=ease(clamp((t-0.18)/0.62));
  text.style.opacity=String(enter); text.style.transform='translateY('+((1-enter)*26).toFixed(1)+'px)';
  from.style.opacity=String(ease(clamp((t-0.5)/0.6)));
  const out=clamp((t-4.6)/0.6);
  document.getElementById('stage').style.opacity=String(1-out);
};`;
  return shell(style, body, script);
}

function statPop({ kicker, name }: EffectParams) {
  const style = `
#wrap{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center}
#label{color:#c9c3b8;font-size:30px;letter-spacing:.28em;text-transform:uppercase}
#value{margin-top:14px;color:#fff;font-size:230px;line-height:1;font-weight:900;letter-spacing:-.03em;font-variant-numeric:tabular-nums;text-shadow:0 10px 50px rgba(0,0,0,.6)}
#rule{width:0;height:6px;margin:26px auto 0;background:#d97757;border-radius:4px}`;
  const body = `<div id="stage"><div id="wrap"><div id="label" dir="auto"></div><div id="value" dir="auto"></div><div id="rule"></div></div></div>`;
  const script = `
const label=document.getElementById('label'),value=document.getElementById('value'),rule=document.getElementById('rule');
[label.textContent,value.textContent]=${textPair({ kicker, name })};
const clamp=(v)=>Math.max(0,Math.min(1,v));
const backOut=(p,o)=>1+(o+1)*Math.pow(p-1,3)+o*Math.pow(p-1,2);
window.renderFrame=t=>{
  const pop=backOut(clamp(t/0.55),1.6);
  value.style.transform='scale('+pop.toFixed(3)+')';
  value.style.opacity=String(clamp(t/0.28));
  label.style.opacity=String(clamp((t-0.2)/0.4));
  rule.style.width=(clamp((t-0.5)/0.5)*320).toFixed(1)+'px';
  const out=clamp((t-3.9)/0.5);
  document.getElementById('stage').style.opacity=String(1-out);
};`;
  return shell(style, body, script);
}

function captionBand({ kicker, name }: EffectParams) {
  const style = `
#band{position:absolute;left:0;right:0;bottom:96px;display:flex;justify-content:center}
#inner{max-width:calc(100% - 240px);padding:20px 40px;background:rgba(12,12,12,.82);border-left:8px solid #46e5b7;border-radius:6px}
#kicker{color:#46e5b7;font-size:24px;letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px}
#name{color:#fff;font-size:44px;font-weight:700;line-height:1.3}`;
  const body = `<div id="stage"><div id="band"><div id="inner"><div id="kicker" dir="auto"></div><div id="name" dir="auto"></div></div></div></div>`;
  const script = `
const inner=document.getElementById('inner'),kicker=document.getElementById('kicker'),name=document.getElementById('name');
[kicker.textContent,name.textContent]=${textPair({ kicker, name })};
const clamp=(v)=>Math.max(0,Math.min(1,v));
const ease=(p)=>1-Math.pow(1-p,3);
window.renderFrame=t=>{
  const enter=ease(clamp(t/0.32));
  inner.style.opacity=String(enter);
  inner.style.transform='translateY('+((1-enter)*34).toFixed(1)+'px)';
  const out=clamp((t-3.55)/0.45);
  document.getElementById('stage').style.opacity=String(1-out);
};`;
  return shell(style, body, script);
}

export const effects: EffectDefinition[] = [
  {
    id: "lt-kicker-name", name: "线条标题条", category: "标题条",
    summary: "左侧栏目 + 大标题 + 伸展底线，4.8 秒。",
    seconds: 4.8, width: W, height: H,
    html: params => lowerThirdHtml(params, "lt-kicker-name"),
  },
  {
    id: "lt-bold-block", name: "色块标题条", category: "标题条",
    summary: "深色色块反白标题，栏目换黄色，4.8 秒。",
    seconds: 4.8, width: W, height: H,
    html: params => lowerThirdHtml(params, "lt-bold-block"),
  },
  {
    id: "quote-card", name: "引述卡", category: "引述",
    summary: "左侧竖线 + 引文 + 出处，适合观点与访谈摘录，5.2 秒。",
    seconds: 5.2, width: W, height: H, html: quoteCard,
  },
  {
    id: "stat-pop", name: "数字卡", category: "数据",
    summary: "大数字弹出 + 指标名 + 展开横线，适合关键数据，4.4 秒。",
    seconds: 4.4, width: W, height: H, html: statPop,
  },
  {
    id: "caption-band", name: "字幕带", category: "字幕",
    summary: "底部半透明字幕带，带栏目小标，4.0 秒。",
    seconds: 4.0, width: W, height: H, html: captionBand,
  },
];

export const effectIds = effects.map(effect => effect.id) as [string, ...string[]];
export function findEffect(id: string) {
  return effects.find(effect => effect.id === id);
}
// 兼容旧调用：lowerThird 的 id 仍然指向同一套实现。
export const legacyLowerThirdIds = lowerThirdEffectIds satisfies readonly LowerThirdEffectId[];
