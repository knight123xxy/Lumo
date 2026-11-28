import type { AssistantMessage, AssistantMessageEvent, Context } from "@earendil-works/pi-ai";
import { raceWithAbortSignal } from "@earendil-works/pi-ai/utils/abort";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentTextTransport } from "@/agent/runtime/types";

const toolNamePattern = /^[a-z][a-zA-Z0-9]{0,63}$/;
const tokenCount = z.number().nonnegative();
const assistantMessageSchema = z.looseObject({
  role: z.literal("assistant"),
  api: z.string().min(1), provider: z.string().min(1), model: z.string().min(1), timestamp: tokenCount,
  stopReason: z.enum(["stop", "length", "toolUse"]),
  content: z.array(z.discriminatedUnion("type", [
    z.looseObject({ type: z.literal("text"), text: z.string(), textSignature: z.string().optional() }),
    z.looseObject({ type: z.literal("thinking"), thinking: z.string(), thinkingSignature: z.string().optional(), redacted: z.boolean().optional() }),
    z.looseObject({ type: z.literal("toolCall"), id: z.string().min(1), name: z.string().min(1), arguments: z.record(z.string(), z.json()),
      thoughtSignature: z.string().optional(), namespace: z.string().optional() }),
  ])),
  usage: z.looseObject({
    input: tokenCount, output: tokenCount, cacheRead: tokenCount, cacheWrite: tokenCount, totalTokens: tokenCount,
    cost: z.object({ input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number(), total: z.number() }),
  }),
});
const streamEventSchema = z.object({ type: z.string(), delta: z.unknown().optional(), message: z.unknown().optional() });

async function* readEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let data: string[] = [];
  try {
    for (;;) {
      const { value, done } = await raceWithAbortSignal(reader.read(), signal);
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        else if (!line && data.length) {
          const event = data.join("\n");
          data = [];
          yield streamEventSchema.parse(JSON.parse(event));
        }
      }
      if (done) return;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function generateAgentText(
  transport: AgentTextTransport, providerId: string, modelId: string, context: Context, signal: AbortSignal,
  partial: AssistantMessage, emit: (event: AssistantMessageEvent) => void,
): Promise<Extract<AssistantMessageEvent, { type: "done" }>> {
  if ((context.tools?.length ?? 0) > 128) throw new Error("云端文本模型单次最多接收 128 个工具，请减少启用的工具后重试");
  const originals = new Set(context.tools?.map(tool => tool.name));
  const names = new Map<string, string>();
  const aliases = new Map<string, string>();
  function encode(name: string) {
    if (toolNamePattern.test(name)) return name;
    const existing = aliases.get(name);
    if (existing) return existing;
    // ACT: 云端工具名使用小驼峰，节点和 MCP 工具的本地名称包含分隔符。
    const base = `tool${createHash("sha256").update(name).digest("hex").slice(0, 52)}`;
    let alias = base;
    for (let index = 1; originals.has(alias) || names.has(alias); index++) alias = `${base}${index}`;
    aliases.set(name, alias);
    names.set(alias, name);
    return alias;
  }
  const request: Context = {
    ...context,
    tools: context.tools?.map(tool => ({ ...tool, name: encode(tool.name), description: tool.description || tool.name })),
    messages: context.messages.map(message => {
      if (message.role === "toolResult") {
        const { role, toolName, toolCallId, content, isError, timestamp, addedToolNames } = message;
        return { role, toolName: encode(toolName), toolCallId, content, isError, timestamp, addedToolNames: addedToolNames?.map(encode) };
      }
      if (message.role !== "assistant") return message;
      return { ...message, content: message.content.map(part => part.type === "toolCall" ? { ...part, name: encode(part.name) } : part) };
    }),
  };
  if (Buffer.byteLength(JSON.stringify(request), "utf8") > 8_000_000) {
    throw new Error("云端文本模型的上下文不能超过 8 MB，请压缩对话或减少附件后重试");
  }
  signal.throwIfAborted();
  const response = await raceWithAbortSignal(transport.generate({ providerId, modelId, requestId: randomUUID(), context: request }, signal), signal);
  if (!response.ok) {
    const body = await raceWithAbortSignal(response.json(), signal).catch(() => undefined) as { message?: unknown } | undefined;
    signal.throwIfAborted();
    throw new Error(typeof body?.message === "string" ? body.message : `模型请求失败（HTTP ${response.status}）`);
  }
  if (!response.body || !/^text\/event-stream(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("模型响应不是 SSE 流");
  }
  let started = false;
  function start() {
    if (started) return;
    started = true;
    emit({ type: "start", partial });
  }
  for await (const event of readEvents(response.body, signal)) {
    signal.throwIfAborted();
    if (event.type === "error") throw new Error(typeof event.message === "string" ? event.message : "模型请求失败");
    if ((event.type === "text" || event.type === "reasoning") && typeof event.delta === "string" && event.delta) {
      start();
      const type = event.type === "text" ? "text" : "thinking";
      let index = partial.content.length - 1;
      let part = partial.content[index];
      if (part?.type !== type) {
        index++;
        part = type === "text" ? { type, text: "" } : { type, thinking: "" };
        partial.content.push(part);
        emit({ type: `${type}_start`, contentIndex: index, partial });
      }
      if (part.type === "text") part.text += event.delta;
      if (part.type === "thinking") part.thinking += event.delta;
      emit({ type: `${type}_delta`, contentIndex: index, delta: event.delta, partial });
    }
    if (event.type !== "done") continue;
    const parsed = assistantMessageSchema.safeParse(event.message);
    if (!parsed.success) throw new Error("模型返回了无效的最终消息");
    const message = parsed.data;
    start();
    const streamed = partial.content.length;
    const finalMessage = { ...message, provider: providerId, model: modelId, content: message.content.map(part =>
      part.type === "toolCall" ? { ...part, name: names.get(part.name) ?? part.name } : part) };
    // ACT: SSE 增量没有 block ID；正文分块、签名、工具参数和用量以最终消息为准。
    for (const [index, part] of finalMessage.content.entries()) {
      if (part.type === "toolCall") {
        emit({ type: "toolcall_start", contentIndex: index, partial: finalMessage });
        emit({ type: "toolcall_end", contentIndex: index, toolCall: part, partial: finalMessage });
      } else {
        if (index >= streamed) emit({ type: `${part.type}_start`, contentIndex: index, partial: finalMessage });
        emit({ type: `${part.type}_end`, contentIndex: index, content: part.type === "text" ? part.text : part.thinking, partial: finalMessage });
      }
    }
    // 用已校验的终态收尾，SDK 执行工具时采用完整参数和原始工具名。
    return { type: "done", reason: message.stopReason as "stop" | "length" | "toolUse", message: finalMessage };
  }
  throw new Error("模型响应在收到最终消息前断开");
}
