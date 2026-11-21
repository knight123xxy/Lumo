// 预置的算力汇供应商脚本源码；启动时 seed 到本地 providers 目录。

export const ideamineProviderSource = `type MediaInput =
  | { type: "url"; url: string; mimeType?: string; name?: string }
  | { type: "base64"; data: string; mimeType: string; name?: string }
  | { type: "binary"; data: Uint8Array; mimeType: string; name?: string };

type MediaAsset = MediaInput & { mediaType: "image" | "video" | "audio" };

type VideoRequest = {
  model: string;
  prompt: string;
  images?: MediaInput[];
  firstFrame?: MediaInput;
  lastFrame?: MediaInput;
  duration?: number;
  ratio?: string;
  resolution?: string;
  other?: Record<string, unknown>;
};

type ImageRequest = {
  model: string;
  prompt: string;
  images?: MediaInput[];
  n?: number;
  ratio?: string;
  size?: string;
  other?: Record<string, unknown>;
};

type Context = {
  config: { apiKey?: string; apiUrl?: string };
  signal?: AbortSignal;
  saveTaskData?: (data: { [key: string]: unknown }) => Promise<void>;
  tool: { fetch: typeof fetch };
};

function baseUrl(config: { apiUrl?: string }): string {
  return (config.apiUrl || "https://api.ideamine.cn/v1").trim().replace(/\\/+$/, "");
}

function authHeaders(config: { apiKey?: string }): Record<string, string> {
  return { Authorization: "Bearer " + (config.apiKey || "").trim() };
}

const videoPrices: Record<string, { byResolution: Record<string, string>; unit: string; discount: string }> = {
  "seedance-2.0-second": { byResolution: { "480p": "¥0.20", "720p": "¥0.40", "1080p": "¥0.95" }, unit: "/秒", discount: "官方4.0折" },
  "seedance-2.5-second": { byResolution: { "480p": "¥0.35", "720p": "¥0.60", "1080p": "¥1.70" }, unit: "/秒", discount: "官方4.0折" },
  "MiniMax-H3-X3": { byResolution: { "480p": "¥0.60", "720p": "¥0.73", "1080p": "¥0.85" }, unit: "/秒", discount: "官方4.9折" },
  "seedance-2.0-call": { byResolution: { "720p": "¥1.50" }, unit: "/次", discount: "" },
  "seedance-2.5-call": { byResolution: { "720p": "¥2.50" }, unit: "/次", discount: "" },
};

const imagePrices: Record<string, { price: string; discount: string }> = {
  "gpt-image-2.5": { price: "¥0.019/张", discount: "官方0.7折" },
  "gpt-image-2.6": { price: "¥0.029/张", discount: "官方1.0折" },
  "qwen-image-plus": { price: "¥0.25/张", discount: "" },
};

export default {
  id: "ideamine",
  label: "默认模型服务",
  version: "1.1.0",
  readme: "算力汇（api.ideamine.cn）OpenAI 兼容服务：Seedance 视频、gpt-image 图片。参考图需使用可公开读取的 URL。 [去注册](https://api.ideamine.cn/register) · [去充值](https://api.ideamine.cn/topup)",
  rules: [
    { type: "input", field: "apiUrl", title: "服务地址", value: "https://api.ideamine.cn/v1", props: { placeholder: "https://api.ideamine.cn/v1" } },
    { type: "input", field: "apiKey", title: "API Key", value: "", props: { type: "password", showPassword: true, autocomplete: "off" } },
  ],
  models: [
    { id: "seedance-2.0-second", label: "Seedance 2.0（按秒）", type: "video", mode: ["text", "singleImage"], durationResolutionMap: [{ duration: [5, 10], resolution: ["480p", "720p", "1080p"] }] },
    { id: "seedance-2.5-second", label: "Seedance 2.5（按秒）", type: "video", mode: ["text", "singleImage"], durationResolutionMap: [{ duration: [5, 10], resolution: ["480p", "720p", "1080p"] }] },
    { id: "MiniMax-H3-X3", label: "MiniMax H3 X3", type: "video", mode: ["text", "singleImage"], durationResolutionMap: [{ duration: [5, 10], resolution: ["480p", "720p", "1080p"] }] },
    { id: "seedance-2.0-call", label: "Seedance 2.0（按次）", type: "video", mode: ["text", "singleImage"], durationResolutionMap: [{ duration: [5, 10], resolution: ["720p"] }] },
    { id: "seedance-2.5-call", label: "Seedance 2.5（按次）", type: "video", mode: ["text", "singleImage"], durationResolutionMap: [{ duration: [5, 10], resolution: ["720p"] }] },
    { id: "gpt-image-2.5", label: "GPT Image 2.5", type: "image", mode: ["text"], imageSizes: ["1024x1024"], imageRatios: ["1:1"] },
    { id: "gpt-image-2.6", label: "GPT Image 2.6", type: "image", mode: ["text"], imageSizes: ["1024x1024"], imageRatios: ["1:1"] },
    { id: "qwen-image-plus", label: "Qwen Image Plus", type: "image", mode: ["text"], imageSizes: ["1024x1024"], imageRatios: ["1:1"] },
  ],
  async getPrice(this: Context, request: { type: string; model: string; resolution?: string }): Promise<{ price: string; tips: string } | null> {
    if (request.type === "video") {
      const p = videoPrices[request.model];
      if (!p) return null;
      const unitPrice = p.byResolution[request.resolution || "720p"] || Object.values(p.byResolution)[0];
      return { price: unitPrice + p.unit, tips: p.discount || "按实际用量结算" };
    }
    if (request.type === "image") {
      const p = imagePrices[request.model];
      if (!p) return null;
      return { price: p.price, tips: p.discount || "按张计费" };
    }
    return null;
  },
  async getBalance(this: Context): Promise<{ balance: number; unit: string }> {
    const apiKey = this.config.apiKey?.trim();
    if (!apiKey) throw new Error("请填写 API Key");
    const response = await this.tool.fetch(baseUrl(this.config) + "/dashboard/billing/subscription", {
      headers: authHeaders(this.config),
      signal: this.signal,
    });
    if (!response.ok) throw new Error("余额查询失败，HTTP " + response.status);
    const result = (await response.json()) as { data?: { remaining_quota?: number; remain_quota?: number }; remaining_quota?: number; remain_quota?: number };
    const quota = result?.data?.remaining_quota ?? result?.data?.remain_quota ?? result?.remaining_quota ?? result?.remain_quota;
    if (typeof quota !== "number") throw new Error("余额接口未返回配额");
    return { balance: quota, unit: "quota" };
  },
  async generateImage(this: Context, request: ImageRequest): Promise<MediaAsset[]> {
    this.signal?.throwIfAborted();
    const apiKey = this.config.apiKey?.trim();
    if (!apiKey) throw new Error("请填写 API Key");
    const response = await this.tool.fetch(baseUrl(this.config) + "/images/generations", {
      method: "POST",
      headers: { ...authHeaders(this.config), "Content-Type": "application/json" },
      body: JSON.stringify({ model: request.model, prompt: request.prompt, n: request.n ?? 1, size: request.size ?? "1024x1024" }),
      signal: this.signal,
    });
    if (!response.ok) throw new Error("图片生成失败，HTTP " + response.status);
    const result = (await response.json()) as { data?: { url?: string; b64_json?: string }[] };
    const first = result.data?.[0];
    if (first?.url) return [{ mediaType: "image", type: "url", url: first.url }];
    if (first?.b64_json) return [{ mediaType: "image", type: "base64", data: first.b64_json, mimeType: "image/png" }];
    throw new Error("接口未返回图片结果");
  },
  async generateVideo(this: Context, request: VideoRequest): Promise<MediaAsset[]> {
    this.signal?.throwIfAborted();
    const apiKey = this.config.apiKey?.trim();
    if (!apiKey) throw new Error("请填写 API Key");
    const body: Record<string, unknown> = {
      model: request.model,
      prompt: request.prompt,
      seconds: String(request.duration ?? 5),
      aspect_ratio: request.ratio ?? "16:9",
      resolution: request.resolution ?? "720p",
    };
    const referenceImages = request.images?.filter((item) => item.type === "url") ?? [];
    if (referenceImages.length) body.reference_images = referenceImages.map((item) => (item as { url: string }).url);
    const create = await this.tool.fetch(baseUrl(this.config) + "/videos", {
      method: "POST",
      headers: { ...authHeaders(this.config), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: this.signal,
    });
    if (!create.ok) throw new Error("视频任务提交失败，HTTP " + create.status);
    const created = (await create.json()) as { id?: string; task_id?: string };
    const taskId = created.id ?? created.task_id;
    if (!taskId) throw new Error("接口未返回任务 ID");
    await this.saveTaskData?.({ taskId });
    const deadline = Date.now() + 30 * 60 * 1000;
    while (true) {
      this.signal?.throwIfAborted();
      if (Date.now() > deadline) throw new Error("视频生成超时");
      const poll = await this.tool.fetch(baseUrl(this.config) + "/videos/" + taskId, { headers: authHeaders(this.config), signal: this.signal });
      if (!poll.ok) throw new Error("查询视频任务失败，HTTP " + poll.status);
      const state = (await poll.json()) as { status?: string; error?: { message?: string } };
      if (state.status === "completed" || state.status === "success") break;
      if (state.status === "failed") throw new Error(state.error?.message || "视频生成失败");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    const content = await this.tool.fetch(baseUrl(this.config) + "/videos/" + taskId + "/content", { headers: authHeaders(this.config), signal: this.signal });
    if (!content.ok) throw new Error("下载视频失败，HTTP " + content.status);
    const bytes = new Uint8Array(await content.arrayBuffer());
    const base64 = Buffer.from(bytes).toString("base64");
    return [{ mediaType: "video", type: "base64", data: base64, mimeType: "video/mp4" }];
  },
};
`;

export const ideamineTextProviderSource = `export default {
  id: "ideamineText",
  label: "默认模型服务（文本）",
  version: "1.0.0",
  readme: "算力汇（api.ideamine.cn）OpenAI 兼容文本模型。 [去注册](https://api.ideamine.cn/register) · [去充值](https://api.ideamine.cn/topup)",
  apiUrl: "https://api.ideamine.cn/v1",
  protocol: "openai-completions",
  rules: [
    { type: "input", field: "apiKey", title: "API Key", value: "", props: { type: "password", showPassword: true, autocomplete: "off" } },
  ],
  models: [
    { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", type: "text" },
    { id: "deepseek-v4.1-flash-1017", label: "DeepSeek V4.1 Flash 1017", type: "text" },
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", type: "text" },
    { id: "glm-5.3", label: "GLM 5.3", type: "text" },
    { id: "glm-5.3-flash", label: "GLM 5.3 Flash", type: "text" },
    { id: "kimi-k3", label: "Kimi K3", type: "text" },
    { id: "kimi-k3.1-pro", label: "Kimi K3.1 Pro", type: "text" },
    { id: "qwen3.8-flash", label: "Qwen 3.8 Flash", type: "text" },
    { id: "qwen3.8-max", label: "Qwen 3.8 Max", type: "text" },
    { id: "qwen4-max", label: "Qwen 4 Max", type: "text" },
    { id: "mimo-v2.6-flash", label: "MiMo V2.6 Flash", type: "text" },
    { id: "mimo-v2.6-pro", label: "MiMo V2.6 Pro", type: "text" },
    { id: "MiniMax-M3", label: "MiniMax M3", type: "text" },
    { id: "MiniMax-M3.1-Flash", label: "MiniMax M3.1 Flash", type: "text" },
  ],
};
`;

export const siliconflowAudioProviderSource = `type MediaAsset = { mediaType: "audio"; type: "base64"; data: string; mimeType: string };

type AudioRequest = {
  model: string;
  text?: string;
  voice?: string;
  speed?: number;
  other?: Record<string, unknown>;
};

type Context = {
  config: { apiKey?: string };
  signal?: AbortSignal;
  tool: { fetch: typeof fetch };
};

export default {
  id: "siliconflowAudio",
  label: "硅基流动语音",
  version: "1.0.0",
  readme: "硅基流动（api.siliconflow.cn）语音合成：CosyVoice2 中文、MOSS TTSD。",
  rules: [
    { type: "input", field: "apiKey", title: "API Key", value: "", props: { type: "password", showPassword: true, autocomplete: "off" } },
  ],
  models: [
    {
      id: "FunAudioLLM/CosyVoice2-0.5B",
      label: "CosyVoice2（中文）",
      type: "audio",
      voices: [
        { title: "anna", voice: "FunAudioLLM/CosyVoice2-0.5B:anna" },
        { title: "bella", voice: "FunAudioLLM/CosyVoice2-0.5B:bella" },
        { title: "alex", voice: "FunAudioLLM/CosyVoice2-0.5B:alex" },
      ],
    },
    { id: "fnlp/MOSS-TTSD-v0.5", label: "MOSS TTSD", type: "audio" },
  ],
  async generateAudio(this: Context, request: AudioRequest): Promise<MediaAsset[]> {
    this.signal?.throwIfAborted();
    const apiKey = this.config.apiKey?.trim();
    if (!apiKey) throw new Error("请填写 API Key");
    const text = request.text?.trim();
    if (!text) throw new Error("请输入要合成的文本");
    const response = await this.tool.fetch("https://api.siliconflow.cn/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        input: text,
        voice: request.voice || "FunAudioLLM/CosyVoice2-0.5B:anna",
        ...(request.speed ? { speed: request.speed } : {}),
      }),
      signal: this.signal,
    });
    if (!response.ok) throw new Error("语音合成失败，HTTP " + response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const base64 = Buffer.from(bytes).toString("base64");
    return [{ mediaType: "audio", type: "base64", data: base64, mimeType: "audio/mpeg" }];
  },
};
`;

// 算力汇文本供应商的 AI 文本系统定义。AI 文本（对话/Agent）读 settings.customProviders，不读 media providers 目录，故单独预置。
export const ideamineTextModels = [
  { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
  { id: "deepseek-v4.1-flash-1017", label: "DeepSeek V4.1 Flash 1017" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "glm-5.3", label: "GLM 5.3" },
  { id: "glm-5.3-flash", label: "GLM 5.3 Flash" },
  { id: "kimi-k3", label: "Kimi K3" },
  { id: "kimi-k3.1-pro", label: "Kimi K3.1 Pro" },
  { id: "qwen3.8-flash", label: "Qwen 3.8 Flash" },
  { id: "qwen3.8-max", label: "Qwen 3.8 Max" },
  { id: "qwen4-max", label: "Qwen 4 Max" },
  { id: "mimo-v2.6-flash", label: "MiMo V2.6 Flash" },
  { id: "mimo-v2.6-pro", label: "MiMo V2.6 Pro" },
  { id: "MiniMax-M3", label: "MiniMax M3" },
  { id: "MiniMax-M3.1-Flash", label: "MiniMax M3.1 Flash" },
];

export const ideamineTextAiProvider = {
  id: "ideamineText",
  label: "算力汇",
  apiUrl: "https://api.ideamine.cn/v1",
  apiKey: "",
  protocol: "openai-completions" as const,
  models: ideamineTextModels,
};
