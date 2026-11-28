export type SubtitleSegment = { start: number; end: number; text: string };

const maxChars = 24;
const sentenceBreak = /([。！？!?；;…\n]+)/;

/**
 * 把整段转写切成独立起止时间的字幕条。
 * ACT: 浏览器语音识别不返回词语时间戳，按字符数比例分配片段区间是当前可验证的近似；
 * 接入带时间戳的转写后应改为使用真实边界，并保留本函数的断句规则。
 */
export function splitSubtitleText(text: string, duration: number, start = 0): SubtitleSegment[] {
  const phrases = splitPhrases(text.replace(/\s+/g, " ").trim());
  if (!phrases.length || !(duration > 0)) return [];
  const total = phrases.reduce((sum, phrase) => sum + phrase.length, 0);
  const segments: SubtitleSegment[] = [];
  let cursor = start;
  for (const [index, phrase] of phrases.entries()) {
    const span = index === phrases.length - 1 ? start + duration - cursor : duration * phrase.length / total;
    const end = cursor + span;
    segments.push({ start: Math.round(cursor * 1000) / 1000, end: Math.round(end * 1000) / 1000, text: phrase });
    cursor = end;
  }
  return segments;
}

function splitPhrases(text: string) {
  const pieces: string[] = [];
  for (const part of text.split(sentenceBreak)) {
    const value = part.trim();
    if (!value) continue;
    // 断句符保留在前一条末尾，避免导出的字幕丢标点。
    if (sentenceBreak.test(value)) {
      const previous = pieces.pop();
      if (previous) pieces.push(previous + value.replace(/\s*\n\s*/g, " "));
      continue;
    }
    pieces.push(...wrapPhrase(value));
  }
  return pieces;
}

function wrapPhrase(phrase: string) {
  if (phrase.length <= maxChars) return [phrase];
  const result: string[] = [];
  let rest = phrase;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const cut = Math.max(window.lastIndexOf("，"), window.lastIndexOf(","), window.lastIndexOf("、"), window.lastIndexOf("："), window.lastIndexOf(":"));
    const at = cut > 0 ? cut + 1 : maxChars;
    result.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) result.push(rest);
  return result;
}
