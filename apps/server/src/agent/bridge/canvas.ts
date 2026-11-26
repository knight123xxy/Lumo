import { z } from "zod";
import { canvasOperations } from "@lumo/tool-canvas/runtime";
import { pluginDevelopmentSchema } from "@/lib/pluginDevelopment";
import type { CanvasInfo, CanvasContext } from "@lumo/tools-scaffold/runtime";
import { asrRequestSchema } from "@lumo/tools-scaffold/runtime";
import type { AgentEvent } from "@/agent/runtime/types";

export const studioVolumeSchema = z.strictObject({ projectId: z.string().min(1).max(128), clipId: z.string().min(1).max(128), volume: z.number().min(0).max(2) });

export const studioSpeedSchema = studioVolumeSchema.omit({ volume: true }).extend({ speed: z.number().min(0.1).max(16) });

export const studioTrimSchema = studioVolumeSchema.omit({ volume: true }).extend({ start: z.number().min(0), end: z.number().positive() })
  .refine(({ start, end }) => end > start, "出点必须晚于入点");

export const studioDisabledSchema = studioVolumeSchema.omit({ volume: true }).extend({ disabled: z.boolean() });

type CanvasResult = { result?: unknown; error?: string; cancelled?: boolean; unavailable?: boolean };
type PendingCall = { cwd: string; finish(response: CanvasResult): void };

// ACT: 回传仅在当前 Server 进程存活期间有效；多进程部署需共享请求通道。
const pendingCalls = new Map<string, PendingCall>();

export function createCanvasContext(cwd: string, canvas: CanvasInfo, send: (event: Extract<AgentEvent, { type: "canvasCall" }>) => void, onCancel: (reason: Error) => void) {
  const activeCalls = new Set<string>();
  let queue = Promise.resolve();
  let disposed = false;
  const context: CanvasContext = {
    ...canvas,
    async call(request, signal) {
      // 前端顺序执行画布变更；轮到当前调用再发送和计时，避免排队消耗执行超时。
      const pending = queue.then(() => {
        if (disposed) throw new Error("画布调用所属对话已结束");
        signal?.throwIfAborted();
        const schema = request.name === "developPlugin" ? pluginDevelopmentSchema
          : request.name === "setStudioClipVolume" && canvas.studioSelection ? studioVolumeSchema
          : request.name === "setStudioClipSpeed" && canvas.studioSelection ? studioSpeedSchema
          : request.name === "trimStudioClip" && canvas.studioSelection ? studioTrimSchema
          : request.name === "setStudioClipDisabled" && canvas.studioSelection ? studioDisabledSchema
          : request.name === "transcribeAudio" ? asrRequestSchema : canvasOperations.find(item => item.name === request.name)?.parameters;
        if (!schema) throw new Error("画布操作不存在");
        const args = schema.parse(request.args);
        const callId = crypto.randomUUID();
        return new Promise((resolve, reject) => {
          const finish = ({ result, error, cancelled, unavailable }: CanvasResult) => {
            if (!pendingCalls.delete(callId)) return;
            activeCalls.delete(callId);
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            if (error === undefined && !cancelled && !unavailable) { resolve(result); return; }
            const reason = new Error(error || (cancelled ? "画布调用已取消" : unavailable ? "画布不可用" : "画布调用失败"));
            reject(reason);
            if (cancelled || unavailable) {
              disposed = true;
              onCancel(reason);
            }
          };
          const abort = () => finish({ error: signal?.reason instanceof Error ? signal.reason.message : "画布调用已取消" });
          // ACT: 音频按实际时长播放，转写由浏览器检测停滞与收尾超时，仍接受本轮取消。
          const timer = request.name === "transcribeAudio" ? undefined : setTimeout(() => finish({ error: "画布调用超时，请确认画布仍然打开", unavailable: true }), request.name === "developPlugin" ? 360000 : 120000);
          pendingCalls.set(callId, { cwd, finish });
          activeCalls.add(callId);
          signal?.addEventListener("abort", abort, { once: true });
          try { send({ type: "canvasCall", callId, name: request.name, args }); }
          catch (error) { finish({ error: (error instanceof Error ? error.message : "") || "发送画布调用失败", unavailable: true }); }
        });
      });
      queue = pending.then(() => {}, () => {});
      return pending;
    },
  };
  return {
    context,
    dispose() {
      disposed = true;
      for (const callId of activeCalls) pendingCalls.get(callId)?.finish({ error: "画布调用所属对话已结束" });
    },
  };
}

export function finishCanvasCall(cwd: string, callId: string, response: CanvasResult) {
  const pending = pendingCalls.get(callId);
  // 超时、取消或完成后仍可能收到回传，幂等忽略，避免中断整轮对话。
  if (!pending) return;
  if (pending.cwd !== cwd) throw Object.assign(new Error("画布调用不存在或已结束"), { status: 404 });
  pending.finish(response);
}
