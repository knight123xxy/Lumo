<template>
  <section v-show="visible" class="agent">
    <agentMenu
      :key="conversationKey"
      :name="name"
      :history="modeHistory"
      :sessionFile="sessionFile"
      :parentFile="selectedConversation?.parentFile"
      :subAgents="selectedConversation?.subAgents"
      :loading="loading || historyLoading"
      @open-sub-agent="selectConversation"
      @back="backToParent"
      @new-chat="newConversation"
      @history="loadHistory(!initialized)"
      @select="selectConversation"
      @rename="renameConversation"
      @remove="removeConversation"
      @command="emit('command', $event)"
      @close="visible = false">
      <template #actions><slot name="menuActions" /></template>
      <template #menuItems><slot name="menuItems" /></template>
    </agentMenu>
    <slot name="actions" />
    <conversation
      v-for="item in conversations"
      v-show="item.key === conversationKey"
      :key="item.key"
      :ref="instance => setConversationRef(item, instance)"
      :active="workspaceActive && visible && item.key === conversationKey"
      :initialSession="item.session"
      :conversationMode="item.mode"
      :initialModel="item.initialModel"
      :sessionFile="item.file"
      :disabled="loading || !initialized"
      :branchingId="branchingId"
      @session="setSessionFile(item, $event)"
      @branch="newConversation({ file: item.file, message: $event })"
      @event="receiveAgentEvent"
      @sent="updateConversationName(item, $event)" />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type ComponentPublicInstance } from "vue";
import axios from "axios";
import { translate } from "@lumo/i18n/vue";
import { ElMessage } from "element-plus";
import { useWorkspaceStore } from "@/stores/workspace";
import http from "@/lib/http";
import { stopAgent } from "@/lib/agentControl";
import type { AgentConversation, AgentHistory, AgentMessage } from "./types";
import type { AgentEvent, AgentSubAgent } from "@lumo/server/agent/types";
import agentMenu from "./menu.vue";
import conversation from "./conversation.vue";

const { mode, workspaceActive = true } = defineProps<{ mode?: "canvas" | "edit"; workspaceActive?: boolean }>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ command: [value: string] }>();
type OpenConversation = { mode?: "canvas" | "edit"; key: number; name: string; file?: string; parentFile?: string; runId?: string; retiredRunIds: Set<string>; subAgents: AgentSubAgent[]; session: AgentConversation | null; initialModel?: string };
// ACT: 同一项目的会话跨页面保留，切项目时停止旧项目的运行并清空会话。
const conversations = ref<OpenConversation[]>([]);
const conversationKey = ref(0);
const conversationByMode = new Map<"canvas" | "edit", number>();
const selectedConversation = computed(() => conversations.value.find(item => item.key === conversationKey.value));
watch(conversationKey, key => {
  const selectedMode = selectedConversation.value?.mode;
  if (selectedMode) conversationByMode.set(selectedMode, key);
}, { flush: "sync" });
// ACT: 新对话是现有自动命名逻辑使用的保留值；仅翻译显示，不改变存储或比较值。
const name = computed(() => {
  const value = selectedConversation.value?.name;
  return value && value !== "新对话" ? value : translate("新对话");
});
const sessionFile = computed(() => selectedConversation.value?.file);
const workspaceStore = useWorkspaceStore();
let projectDirectory = workspaceStore.project?.directory;
const history = ref<AgentHistory[]>([]);
const modeHistory = computed(() => history.value.filter(item => !mode || (item.mode ?? workspaceStore.project?.mode ?? "canvas") === mode));
watch([sessionFile, () => workspaceStore.project?.directory], ([file, directory]) => {
  workspaceStore.activeAgentSession = file && directory ? { directory, file } : null;
});
function notifyHistoryChange() {
  if (projectDirectory) workspaceStore.agentHistoryChange = { directory: projectDirectory };
}
const loading = ref(false);
const branchingId = ref<string>();
const historyLoading = ref(false);
const initialized = ref(false);
let requestId = 0;
let nextConversationKey = 0;
const conversationRefs = new Map<number, InstanceType<typeof conversation>>();
const pendingEvents = new Map<number, AgentEvent[]>();

function showConversation(session: AgentConversation | null, activate = true) {
  const existing = session && conversations.value.find(item => item.file === session.file);
  if (existing) {
    if (activate) conversationKey.value = existing.key;
    return existing;
  }
  const key = ++nextConversationKey;
  const item = { mode: session ? history.value.find(entry => entry.file === session.file)?.mode ?? mode : mode, key, name: session?.name || "新对话", file: session?.file, parentFile: session?.parentFile, runId: session?.runId, retiredRunIds: new Set<string>(), subAgents: session?.subAgents ?? [], session };
  conversations.value.push(item);
  if (activate) conversationKey.value = key;
  return conversations.value[conversations.value.length - 1]!;
}

function setConversationRef(item: OpenConversation, instance: Element | ComponentPublicInstance | null) {
  if (!instance) { conversationRefs.delete(item.key); return; }
  const view = instance as InstanceType<typeof conversation>;
  conversationRefs.set(item.key, view);
  for (const event of pendingEvents.get(item.key) ?? []) view.receiveEvent(event);
  pendingEvents.delete(item.key);
}

function deliverEvent(item: OpenConversation, event: AgentEvent) {
  const view = conversationRefs.get(item.key);
  if (view) view.receiveEvent(event);
  else {
    const events = pendingEvents.get(item.key) ?? [];
    events.push(event);
    pendingEvents.set(item.key, events);
  }
}

function receiveAgentEvent(event: AgentEvent) {
  if (event.type === "subAgent") {
    const child = conversations.value.find(item => item.file === event.agent.file);
    if (event.agent.runId && child?.retiredRunIds.has(event.agent.runId)) return;
    const currentRunId = child && (conversationRefs.get(child.key)?.getRunId() ?? child.runId);
    if (currentRunId && event.agent.runId && currentRunId !== event.agent.runId) return;
    const parent = conversations.value.find(item => item.file === event.agent.parentFile);
    if (!parent) return;
    const current = parent.subAgents.find(agent => agent.file === event.agent.file);
    if (current) Object.assign(current, event.agent);
    else parent.subAgents.push(event.agent);
    if (event.agent.status === "running" && !current && !child) {
      showConversation({ ...event.agent, parentFile: parent.file, messages: [], running: true }, false);
    }
    return;
  }
  if (event.type === "subAgentEvent") {
    const child = conversations.value.find(item => item.file === event.file);
    if (!child) {
      receiveAgentEvent(event.event);
      return;
    }
    const currentRunId = conversationRefs.get(child.key)?.getRunId();
    if (currentRunId) setConversationRun(child, currentRunId);
    if (child.retiredRunIds.has(event.runId)) return;
    if (event.event.type === "session") {
      if (event.event.file !== event.file || event.event.runId !== event.runId) return;
      setConversationRun(child, event.runId);
    } else if (child.runId && child.runId !== event.runId) return;
    if (event.event.type === "error") {
      const agent = conversations.value.find(item => item.file === child.parentFile)?.subAgents.find(agent => agent.file === event.file);
      if (agent?.status === "running") Object.assign(agent, { status: "cancelled", result: event.event.message });
    }
    if (event.event.type === "done" || event.event.type === "error") {
      child.retiredRunIds.add(event.runId);
      child.runId = undefined;
    }
    deliverEvent(child, event.event);
    return;
  }
  if (event.type === "report") {
    const parent = conversations.value.find(item => item.file === event.parentFile);
    if (parent) deliverEvent(parent, event);
  }
  if (event.type === "agentMessage") {
    const recipient = conversations.value.find(item => item.file === event.toFile);
    if (recipient) deliverEvent(recipient, event);
  }
}

function backToParent() {
  const file = selectedConversation.value?.parentFile;
  if (file) void selectConversation(file);
}

function updateConversationName(item: OpenConversation, prompt: string) {
  if (item.name !== "新对话") return;
  item.name = prompt.slice(0, 80);
  const entry = history.value.find(entry => entry.file === item.file);
  if (entry) entry.name = item.name;
}

function setSessionFile(item: OpenConversation, file: string) {
  item.file = file;
  const runId = conversationRefs.get(item.key)?.getRunId();
  if (runId) setConversationRun(item, runId);
  if (item.parentFile) return;
  if (!history.value.some(entry => entry.file === file)) {
    history.value.unshift({ file, name: item.name, modified: new Date().toISOString(), messageCount: 0, mode: item.mode });
    notifyHistoryChange();
  }
}

function setConversationRun(item: OpenConversation, runId: string) {
  // 已结束的 runId 保留到会话关闭，拒绝另一条转发流的迟到事件。
  if (item.retiredRunIds.has(runId)) return;
  if (item.runId && item.runId !== runId) item.retiredRunIds.add(item.runId);
  item.runId = runId;
}

async function newConversation(source?: { file?: string; message: AgentMessage }) {
  if (loading.value || historyLoading.value) return;
  const directory = workspaceStore.project?.directory;
  if (!directory) return ElMessage.warning("请先打开项目");
  if (source && (!source.file || !(source.message.entryId || source.message.replyTo))) return ElMessage.warning("消息尚未保存，请稍后创建分支");
  const initialModel = conversationRefs.get(conversationKey.value)?.getSelectedModel();
  const currentRequest = ++requestId;
  const errorMessage = source ? "创建对话分支失败" : "新建对话失败";
  branchingId.value = source?.message.id;
  loading.value = true;
  try {
    const { data } = await axios.post<{ code: number; data: AgentConversation; message?: string }>(source ? "/api/agent/branch" : "/api/agent/create", {
      directory,
      ...(source ? { sessionFile: source.file, ...(source.message.entryId ? { entryId: source.message.entryId } : { replyTo: source.message.replyTo }) } : { mode }),
    }, { headers: { "x-lumo-workspace": "1" } });
    if (data.code !== 200) throw new Error(data.message || errorMessage);
    if (currentRequest !== requestId) return;
    const session = data.data;
    history.value.unshift({ file: session.file, name: session.name, modified: new Date().toISOString(), messageCount: session.messages.length, mode });
    showConversation(session).initialModel = initialModel;
    notifyHistoryChange();
    initialized.value = true;
  } catch (error) {
    if (currentRequest === requestId) ElMessage.error(axios.isAxiosError(error)
      ? error.response?.data?.message || errorMessage
      : error instanceof Error ? error.message : errorMessage);
  } finally {
    if (currentRequest === requestId) {
      loading.value = false;
      branchingId.value = undefined;
    }
  }
}

async function readConversation(directory: string, file: string) {
  const { data } = await axios.get<{ code: number; data: AgentConversation; message?: string }>("/api/agent/get", {
    params: { directory, sessionFile: file }, headers: { "x-lumo-workspace": "1" },
  });
  if (data.code !== 200) throw new Error(data.message || "读取对话失败");
  return data.data;
}

function hasPendingSession(directory: string) {
  const pending = workspaceStore.pendingAgentSession;
  return pending?.directory === directory && pending.mode === mode;
}

async function loadHistory(openLatest = false) {
  const directory = workspaceStore.project?.directory;
  if (!directory || loading.value || historyLoading.value) return;
  const currentRequest = ++requestId;
  historyLoading.value = true;
  loading.value = openLatest;
  try {
    const { data } = await axios.get<{ code: number; data: AgentHistory[]; message?: string }>("/api/agent/list", {
      params: { directory }, headers: { "x-lumo-workspace": "1" },
    });
    if (data.code !== 200) throw new Error(data.message || "读取历史对话失败");
    if (currentRequest !== requestId) return;
    history.value = data.data;
    // 首条回复结束前会话可能尚未落盘，仍允许从历史菜单切回。
    for (const item of conversations.value) if (item.file) setSessionFile(item, item.file);
    if (openLatest) {
      if (hasPendingSession(directory)) return;
      const session = !workspaceStore.pendingAgentMessage && modeHistory.value[0] ? await readConversation(directory, modeHistory.value[0].file) : null;
      if (currentRequest !== requestId || hasPendingSession(directory)) return;
      showConversation(session);
      initialized.value = true;
    }
  } catch (error) {
    if (currentRequest === requestId) ElMessage.error(error instanceof Error ? error.message : "读取历史对话失败");
  } finally {
    if (currentRequest === requestId) {
      historyLoading.value = false;
      loading.value = false;
    }
  }
}

async function selectConversation(file: string) {
  const directory = workspaceStore.project?.directory;
  if (!directory || loading.value || historyLoading.value || file === sessionFile.value) return;
  const existing = conversations.value.find(item => item.file === file);
  if (existing) {
    conversationKey.value = existing.key;
    return;
  }
  const currentRequest = ++requestId;
  loading.value = true;
  try {
    const session = await readConversation(directory, file);
    if (currentRequest !== requestId) return;
    showConversation(session);
    initialized.value = true;
  } catch (error) {
    if (currentRequest === requestId) ElMessage.error(error instanceof Error ? error.message : "读取对话失败");
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}

async function renameConversation(file: string, value: string) {
  const directory = workspaceStore.project?.directory;
  const item = history.value.find(item => item.file === file);
  const nextName = value.trim();
  if (!directory || loading.value || historyLoading.value || (!item && file !== sessionFile.value)) return;
  if (!nextName || nextName.length > 80) return ElMessage.warning("请输入 1–80 个字符的对话名称");
  if (nextName === (file === sessionFile.value ? name.value : item?.name)) return;
  const currentRequest = ++requestId;
  loading.value = true;
  try {
    const { data } = await axios.patch<{ code: number; data: { name: string }; message?: string }>("/api/agent/rename", {
      directory, sessionFile: file, name: nextName,
    }, { headers: { "x-lumo-workspace": "1" } });
    if (data.code !== 200) throw new Error(data.message || "重命名对话失败");
    if (currentRequest !== requestId) return;
    if (item) item.name = data.data.name;
    const opened = conversations.value.find(item => item.file === file);
    if (opened) opened.name = data.data.name;
    notifyHistoryChange();
  } catch (error) {
    if (currentRequest === requestId) ElMessage.error(axios.isAxiosError(error)
      ? error.response?.data?.message || "重命名对话失败"
      : error instanceof Error ? error.message : "重命名对话失败");
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}

async function removeConversation(file: string) {
  const directory = workspaceStore.project?.directory;
  if (!directory || loading.value || historyLoading.value || history.value.length <= 1 || !history.value.some(item => item.file === file)) return;
  if (!/^[\w-]+\.jsonl$/.test(file)) return ElMessage.error("对话文件名无效");
  const currentRequest = ++requestId;
  loading.value = true;
  try {
    await http({ method: "DELETE", url: "/api/agent/remove", data: { directory, sessionFile: file } });
    if (currentRequest !== requestId) return;
    history.value = history.value.filter(item => item.file !== file);
    if (file === sessionFile.value) {
      showConversation(null);
      initialized.value = true;
    }
    conversations.value = conversations.value.filter(item => item.file !== file);
    notifyHistoryChange();
  } catch (error) {
    if (currentRequest === requestId) ElMessage.error(axios.isAxiosError(error)
      ? error.response?.data?.message || "移除历史对话失败"
      : error instanceof Error ? error.message : "移除历史对话失败");
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}

function stopProject(directory = projectDirectory) {
  if (!directory) return;
  const stops = [...conversationRefs.values()].map(view => view.beginProjectStop());
  void stopAgent(directory, stops.flatMap(stop => stop.runIds)).then(() => {
    for (const stop of stops) stop.finish(true);
  }).catch(error => {
    for (const stop of stops) stop.finish(false);
    ElMessage.error(error instanceof Error ? error.message : "停止生成失败，请重试");
  });
}

function pageHide() {
  stopProject();
}

watch(() => workspaceStore.project?.directory, directory => {
  if (projectDirectory && projectDirectory !== directory) stopProject(projectDirectory);
  projectDirectory = directory;
  requestId++;
  history.value = [];
  conversationByMode.clear();
  conversations.value = [];
  conversationRefs.clear();
  pendingEvents.clear();
  initialized.value = false;
  loading.value = false;
  branchingId.value = undefined;
  historyLoading.value = false;
  showConversation(null);
}, { immediate: true, flush: "sync" });
watch(() => mode, nextMode => {
  if (!nextMode || selectedConversation.value?.mode === nextMode) return;
  requestId++;
  loading.value = false;
  historyLoading.value = false;
  branchingId.value = undefined;
  const previousKey = conversationByMode.get(nextMode);
  const existing = conversations.value.find(item => item.key === previousKey);
  if (existing) conversationKey.value = existing.key;
  else showConversation(null);
  initialized.value = Boolean(existing);
});
watch([visible, () => workspaceActive, () => mode, () => workspaceStore.project?.directory], ([expanded, active, , directory]) => {
  // ACT: 等同一轮项目与目标会话都更新后再读历史，避免先打开另一条对话。
  if (expanded && active && directory && !initialized.value) void loadHistory(!hasPendingSession(directory));
}, { immediate: true, flush: "post" });
// 首页侧栏选中某条对话后，面板就绪时切到该会话一次。
watch([visible, () => workspaceActive, loading, historyLoading, () => workspaceStore.project?.directory, () => mode, () => workspaceStore.pendingAgentSession], ([expanded, active, busy, reading, directory, currentMode, pending]) => {
  if (!expanded || !active || busy || reading || !pending || pending.directory !== directory || pending.mode !== currentMode) return;
  workspaceStore.pendingAgentSession = null;
  void selectConversation(pending.file);
}, { flush: "post" });
// ACT: Agent 一启动就落盘会话，侧栏项目下立即出现该 Agent 的索引，关闭后可从侧栏重新打开。
// 每个项目与模式只尝试一次，创建失败不反复重试。
const autoIndexAttempted = ref("");
watch([visible, () => workspaceActive, initialized, loading, historyLoading, sessionFile, () => workspaceStore.project?.directory], ([expanded, active, ready, busy, reading, file, directory]) => {
  if (!expanded || !active || !ready || busy || reading || file || !directory) return;
  if (workspaceStore.pendingAgentMessage || workspaceStore.pendingAgentSession) return;
  const key = `${directory}|${mode}`;
  if (autoIndexAttempted.value === key) return;
  autoIndexAttempted.value = key;
  void newConversation();
}, { flush: "post" });

watch(() => workspaceStore.sidebarSessionChange, change => {
  if (!change || change.directory !== projectDirectory) return;
  const opened = conversations.value.find(item => item.file === change.file);
  const entry = history.value.find(item => item.file === change.file);
  if (change.removed) {
    if (sessionFile.value === change.file) showConversation(null);
    conversations.value = conversations.value.filter(item => item.file !== change.file);
    history.value = history.value.filter(item => item.file !== change.file);
  } else if (change.name) {
    if (opened) opened.name = change.name;
    if (entry) entry.name = change.name;
  }
});

const canFillPrompt = computed(() => initialized.value && !loading.value);
function appendPrompt(text: string) {
  return conversationRefs.get(conversationKey.value)?.appendPrompt(text);
}
defineExpose({ canFillPrompt, appendPrompt });

window.addEventListener("pagehide", pageHide);
onBeforeUnmount(() => {
  workspaceStore.activeAgentSession = null;
  requestId++;
  stopProject();
  window.removeEventListener("pagehide", pageHide);
});

</script>

<style scoped lang="scss">
.agent {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  padding-bottom: 8px;
  overflow: hidden;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
</style>
