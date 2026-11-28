import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@/lib/modelReasoning";
import { getConfiguredModel } from "@/utils/ai";
import { currentIdentity } from "@/utils/multiTenant/context";
import { t } from "@/lib/i18n";
import type { AgentTextTransport } from "@/agent/runtime/types";

export async function getAgentModelConfiguration(providerId: string, modelId: string, thinkingLevel?: ThinkingLevel) {
  const configured = await getConfiguredModel(providerId, modelId);
  const actor = currentIdentity();
  if (configured.execution && !actor) throw Object.assign(new Error("请先登录 算力汇"), { status: 401 });
  // ACT: 旧版用 off 保存默认档位；模型未声明关闭能力时按默认处理，显式支持 off 的模型仍可关闭。
  if (thinkingLevel === "off" && !configured.model.reasoningLevels.includes("off")) thinkingLevel = undefined;
  if (thinkingLevel !== undefined && !configured.model.reasoningLevels.includes(thinkingLevel)) {
    throw Object.assign(new Error(t`模型 ${configured.model.label} 不支持推理等级 ${thinkingLevel}`), { status: 400, code: "UNSUPPORTED_REASONING_EFFORT" });
  }
  return { ...configured, actor, thinkingLevel, effectiveThinkingLevel: thinkingLevel ?? "off" };
}

const runtimeConfigurations = new WeakMap<ModelRuntime, Awaited<ReturnType<typeof getAgentModelConfiguration>>>();

export function getRuntimeModelConfiguration(runtime: ModelRuntime) {
  return runtimeConfigurations.get(runtime);
}

const textTransports = new WeakMap<ModelRuntime, AgentTextTransport>();

export function getRuntimeTextTransport(runtime: ModelRuntime) {
  return textTransports.get(runtime);
}

export function getAgentTextModel(transport: AgentTextTransport, providerId: string, modelId: string, thinkingLevel?: ThinkingLevel) {
  const model = transport.models.find(item => item.providerId === providerId && item.modelId === modelId)
    ?? transport.models.find(item => item.providerId === providerId && item.routeId === modelId);
  if (!model) throw Object.assign(new Error("所选模型不存在，请重新选择"), { status: 400 });
  if (thinkingLevel && thinkingLevel !== "off" && !model.reasoningLevels.includes(thinkingLevel)) {
    throw Object.assign(new Error(t`模型 ${model.label} 不支持推理等级 ${thinkingLevel}`), { status: 400, code: "UNSUPPORTED_REASONING_EFFORT" });
  }
  return model;
}

export async function createTransportAgentModel(transport: AgentTextTransport, providerId: string, modelId: string, thinkingLevel?: ThinkingLevel) {
  const model = getAgentTextModel(transport, providerId, modelId, thinkingLevel);
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false });
  for (const id of new Set(transport.models.map(item => item.providerId))) {
    runtime.registerProvider(id, {
      api: "openai-completions", baseUrl: "https://agent-text.invalid",
      models: transport.models.filter(item => item.providerId === id).map(item => ({
        id: item.modelId, name: item.label, reasoning: false, input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: item.contextWindow, maxTokens: item.maxOutputTokens,
      })),
    });
    // SDK 在调用自定义流前仍检查认证；真实云会话只由请求级 transport 持有。
    await runtime.setRuntimeApiKey(id, "agent-text-transport");
  }
  const runtimeModel = runtime.getModel(providerId, model.modelId);
  if (!runtimeModel) throw Object.assign(new Error("模型运行时初始化失败"), { status: 503 });
  textTransports.set(runtime, transport);
  return { runtime, runtimeModel, effectiveThinkingLevel: "off" as const };
}

export async function createAgentModel(providerId: string, modelId: string, thinkingLevel?: ThinkingLevel) {
  const configured = await getAgentModelConfiguration(providerId, modelId, thinkingLevel);
  const { provider, model, baseUrl } = configured;
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false });
  runtime.registerProvider(providerId, {
    api: provider.protocol,
    baseUrl,
    // SDK 将配置头解析为命令或环境变量；转义后仅按用户填写的字面值发送。
    headers: provider.headers && Object.fromEntries(Object.entries(provider.headers).map(([name, value]) => [
      name, value.replace(/\$/g, () => "$$").replace(/^!/, "$!"),
    ])),
    models: [{
      // ACT: 默认不传推理参数，避免 SDK 把内部 off 升到模型支持的首档。
      id: model.id, name: model.label, reasoning: configured.thinkingLevel === undefined ? false : model.reasoning, thinkingLevelMap: model.thinkingLevelMap,
      compat: configured.thinkingLevel === undefined ? { ...model.compat, supportsMidConvoEffort: false } : model.compat,
      // ACT: 保留图片输入，由实际供应方判断该模型是否支持。
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.contextWindow, maxTokens: model.maxOutputTokens,
    }],
  });
  if (!provider.apiKey && Object.keys(provider.headers ?? {}).length) {
    // ACT: SDK 配置接口不解析无密钥的附加头鉴权；复用模型定义，仅提供本次配置的原始请求头。
    const registered = runtime.getProvider(providerId)!;
    runtime.registerNativeProvider({
      ...registered,
      auth: { apiKey: { name: "API key", resolve: async ({ signal }) => {
        signal.throwIfAborted();
        return { auth: { headers: provider.headers }, source: "configured provider" };
      } } },
    });
  } else await runtime.setRuntimeApiKey(providerId, provider.apiKey);
  const runtimeModel = runtime.getModel(providerId, model.id);
  if (!runtimeModel) throw Object.assign(new Error("模型运行时初始化失败"), { status: 503 });
  // ACT: 只关联本次运行的凭据快照；持久配置与版本仍由 SQL 管理，子 Agent 共用 runtime 时沿用同一快照。
  runtimeConfigurations.set(runtime, configured);
  return { ...configured, runtime, runtimeModel };
}
