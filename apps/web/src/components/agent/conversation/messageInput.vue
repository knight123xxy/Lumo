<template>
  <div class="messageInput" :class="{ draggingAttachments, voiceActive }" @dragenter.capture="dragEnterAttachments" @dragover.capture="dragOverAttachments" @dragleave.capture="dragLeaveAttachments" @drop.capture="dropAttachments">
    <div v-if="draggingAttachments" class="attachmentDropHint" role="status">
      <icon-paperclip :size="20" aria-hidden="true" />
      <span>松开添加附件</span>
      <small>图片、视频、文档或代码文件</small>
    </div>
    <div v-if="editingId" class="editingBanner"><span>编辑消息</span><el-button text size="small" :disabled="running || submitting || voiceActive" @click="cancelEdit">取消</el-button></div>
    <div
      class="senderResizeHandle"
      role="separator"
      aria-orientation="horizontal"
      aria-label="调整输入框高度"
      aria-valuemin="44"
      :aria-valuemax="senderMaxHeight"
      :aria-valuenow="senderHeight"
      tabindex="0"
      title="拖动调整输入框高度"
      @focus="senderHeight = sender?.chatElement.rollBox.clientHeight ?? 44"
      @pointerdown="startSenderResize"
      @pointermove="moveSenderResize"
      @pointerup="stopSenderResize"
      @pointercancel="stopSenderResize"
      @lostpointercapture="stopSenderResize"
      @keydown.up.prevent="setSenderHeight((sender?.chatElement.rollBox.clientHeight ?? 44) + 16)"
      @keydown.down.prevent="setSenderHeight((sender?.chatElement.rollBox.clientHeight ?? 44) - 16)" />
    <attachmentList v-if="draftAttachments.length" class="draftAttachments" :attachments="draftAttachments" :directory="directory" removable restorable :disabled="locked" @remove="draftAttachments.splice($event, 1)" @restore="restoreTextAttachment" />
    <div class="senderInput" @pointerdown.capture="armVoiceInput" @contextmenu="voiceActive && $event.preventDefault()" @dragstart="voiceActive && $event.preventDefault()">
      <div ref="senderElement" class="senderEditor" @keydown.capture="handleSenderKeydown"></div>
      <div v-if="voiceActive" class="voiceOverlay" role="status" aria-live="polite">
        <div class="voiceFeedback">
          <span class="voiceWave" aria-hidden="true"><span v-for="(level, index) in voiceBars" :key="index" :style="{ height: `${3 + level * 21}px` }" /></span>
          <span>{{ voiceState === 'starting' ? '正在启动语音识别…' : voiceState === 'listening' ? '开始说话，松开结束' : '正在识别…' }}</span>
        </div>
        <div v-if="voiceText" class="voiceTranscript">{{ voiceText }}</div>
      </div>
    </div>
    <teleport v-for="target in draftMentionTargets" :key="target.key" :to="target.element"><mentionThumbnail v-bind="mentionThumbnailProps(target.mention)" :directory="directory"><icon-photo :size="14" /></mentionThumbnail></teleport>
    <mentionContent ref="draftMentionPreview" :mentions="draftMentions" :directory="directory" removable @remove="removeDraftMention" />
    <div class="senderActions">
      <div class="addMenuWrap">
        <el-button text circle :disabled="locked || running" :aria-label="translate('添加内容')" :title="translate('添加内容')" :aria-expanded="plusOpen" aria-haspopup="menu" @mousedown.prevent @click="plusOpen = !plusOpen"><icon-plus :size="18" /></el-button>
        <div v-if="plusOpen" class="addMenu" role="menu" :aria-label="translate('添加内容')">
          <button class="addMenuItem" type="button" role="menuitem" @click="chooseAttachment">
            <icon-paperclip :size="16" aria-hidden="true" />
            <span>{{ translate('上传附件') }}</span>
            <em>{{ translate('图片、视频、文档') }}</em>
          </button>
          <button class="addMenuItem" type="button" role="menuitem" @mousedown.prevent @click="openResourceMenu('mention')">
            <icon-at :size="16" aria-hidden="true" />
            <span>{{ translate('引用素材或画布') }}</span>
            <em>@</em>
          </button>
          <button class="addMenuItem" type="button" role="menuitem" @mousedown.prevent @click="openResourceMenu('skill')">
            <icon-sparkles :size="16" aria-hidden="true" />
            <span>{{ translate('使用技能') }}</span>
            <em>/</em>
          </button>
          <template v-if="workflows?.length">
            <div class="addMenuDivider" role="separator" />
            <button v-for="workflow in workflows" :key="workflow.id" class="addMenuItem" type="button" role="menuitem" @mousedown.prevent @click="runWorkflow(workflow)">
              <icon-sparkles :size="16" aria-hidden="true" />
              <span>{{ translate(workflow.label) }}</span>
            </button>
          </template>
        </div>
      </div>
      <input ref="attachmentInput" type="file" :accept="attachmentAccept" multiple hidden :disabled="locked || running" @change="selectAttachments" />
      <mentionMenu ref="mentionMenuRef" :directory="directory" :active="active" :disabled="locked || running || !directory" :query="mentionQuery" :editor="senderElement" :currentCanvasId="createCanvasContext?.()?.id" @open="captureMentionPosition" @select="insertMentions" @dismiss="mentionQuery = undefined" />
      <skillMenu ref="skillMenuRef" :directory="directory" :active="active" :disabled="locked || running || !directory" :query="skillQuery" :editor="senderElement" @select="selectSkill" @dismiss="skillQuery = undefined" />
      <contextUsagePopover v-model:visible="contextMenuVisible" :usage="contextUsage" :stats="stats" :contextWindow="contextWindow" :disabled="voiceActive" />
      <el-button class="voiceButton" :class="{ voiceActive }" text circle :disabled="!voiceSupported || (!voiceActive && locked)" :aria-label="voiceButtonLabel" :aria-pressed="voiceActive" :title="voiceButtonLabel" @click="voiceActive ? cancelVoiceInput() : startVoiceInput()"><icon-microphone :size="18" /></el-button>
      <el-button v-if="running" class="stopButton" text circle :disabled="stopping" aria-label="停止生成" title="停止生成" @click="emit('stop')"><icon-player-stop-filled :size="14" /></el-button>
      <modelPopover v-model="selectedModel" v-model:reasoningEffort="reasoningEffort" :active="active" :showReasoning="false" :disabled="disabled || running || submitting || voiceActive" />
      <el-button class="sendButton" type="primary" circle :disabled="locked || (running && !!editingId)" :aria-label="sendLabel" :title="sendTitle" @click="submitDraft()"><icon-arrow-up :size="16" /></el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { locale, t, translate } from "@lumo/i18n/vue";
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { IconArrowUp, IconAt, IconMicrophone, IconPaperclip, IconPhoto, IconPlayerStopFilled, IconPlus, IconSparkles } from "@tabler/icons-vue";
import { ElMessage } from "element-plus";
import { getReadableFileMimeType, readableFileAccept } from "@lumo/server/documentFormats";
import type { AgentContext, AgentMention, AgentStats } from "@lumo/server/agent/types";
import type { CanvasContext } from "@lumo/tool-canvas/runtime";
import modelPopover from "@/components/modelPopover.vue";
import skillMenu from "../skillMenu.vue";
import mentionMenu from "../mentionMenu.vue";
import mentionContent from "../mentionContent.vue";
import mentionThumbnail from "../mentionThumbnail.vue";
import { mentionName, mentionParts, mentionThumbnailProps } from "../mentionText";
import attachmentList from "../attachmentList.vue";
import { createPastedTextFile, readTextAttachment } from "../textAttachments";
import type { AgentAttachment, AgentMessage } from "../types";
import contextUsagePopover from "./contextUsage.vue";
import useVoiceInput from "./useVoiceInput";
import xSender, { type AnyTagProps } from "x-sender";
import "x-sender/lib/XSender.css";

const props = defineProps<{ active: boolean; disabled: boolean; busy: boolean; remoteRunning: boolean; stopping: boolean; submitting: boolean; deletingId?: string; directory?: string; contextUsage?: AgentContext; stats?: AgentStats; contextWindow: number }>();
const emit = defineEmits<{ submit: [mode?: "steer" | "followUp"]; stop: [] }>();
const selectedModel = defineModel<string>("selectedModel", { required: true });
const reasoningEffort = defineModel<string>("reasoningEffort", { required: true });
const editingId = defineModel<string>("editingId");
const recording = defineModel<boolean>("voiceActive", { default: false });
const restoringAttachment = defineModel<boolean>("restoringAttachment", { default: false });
const createCanvasContext = inject<(() => CanvasContext | undefined) | undefined>("canvas", undefined);
const draftAttachments = ref<AgentAttachment[]>([]);
const attachmentInput = ref<HTMLInputElement>();
const draggingAttachments = ref(false);
let attachmentDragDepth = 0;
const attachmentAccept = `image/*,video/*,${readableFileAccept}`;
const draftMentions = ref<AgentMention[]>([]);
const draftMentionTargets = shallowRef<{ key: symbol; element: HTMLElement; mention: AgentMention }[]>([]);
const draftMentionPreview = ref<InstanceType<typeof mentionContent>>();
let editDraft: { model: AnyTagProps[][]; mentions: AgentMention[]; attachments: AgentAttachment[] } | undefined;
let sender: xSender | undefined;
const senderElement = ref<HTMLElement>();
const skillMenuRef = ref<InstanceType<typeof skillMenu>>();
const skillQuery = ref<string>();
const mentionMenuRef = ref<InstanceType<typeof mentionMenu>>();
const mentionQuery = ref<string>();
let mentionPosition: { node: ReturnType<xSender["getCurrentNode"]>; remove: number } | undefined;
let insertingMentions = false;
const senderHeight = ref(44);
const senderMaxHeight = ref(Math.max(44, window.innerHeight / 2));
let senderResize: { pointerId: number; y: number; height: number } | undefined;
const contextMenuVisible = ref(false);
const plusOpen = ref(false);
const workflows = inject<{ id: string; label: string; run: () => void }[] | undefined>("agentWorkflows", undefined);
function runWorkflow(workflow: { run: () => void }) {
  plusOpen.value = false;
  workflow.run();
}
const running = computed(() => props.busy || props.remoteRunning);
const locked = computed(() => props.disabled || props.submitting || props.stopping || props.deletingId !== undefined || restoringAttachment.value || voiceActive.value);
const sendLabel = computed(() => running.value ? "排队发送" : editingId.value ? "重发消息" : "发送消息");
const sendTitle = computed(() => running.value ? "排队发送，本轮完成后处理（Enter）；Ctrl/Cmd + Enter 引导当前任务" : `${sendLabel.value}（Enter）`);
const placeholder = computed(() => running.value ? translate("输入文字，Enter 排队，Ctrl/Cmd + Enter 引导…") : voiceSupported ? translate("随心输入，@ 引用素材，/ 使用技能…") : translate("随心输入，@ 引用素材，/ 使用技能…"));
const { voiceSupported, voiceState, voiceText, voiceActive, voiceButtonLabel, voiceLevel, armVoiceInput, startVoiceInput, clearVoicePress, cancelVoiceInput } = useVoiceInput({
  getSender: () => sender,
  active: () => props.active,
  disabled: () => props.disabled,
  locked: () => locked.value,
  onStart() {
    mentionQuery.value = undefined;
    skillQuery.value = undefined;
    contextMenuVisible.value = false;
  },
});
const voiceBars = computed(() => [0.35, 0.65, 0.85, 1, 0.85, 0.65, 0.35].map(weight => voiceLevel.value * weight));
watch(voiceActive, value => { recording.value = value; }, { flush: "sync" });
watch([locale, placeholder], () => {
  if (!sender) return;
  sender.updateConfig({ placeholder: placeholder.value });
  sender.chatElement.richText.setAttribute("aria-label", translate("消息"));
  for (const line of sender.chatEditor.NODES) for (const tag of line.children) {
    if (tag.type === "Mention") tag.$el.setAttribute("aria-label", t`预览 ${tag.name}`);
  }
});
watch([locked, () => props.active], ([locked, active]) => {
  if (!active || locked) {
    resetAttachmentDrag();
    plusOpen.value = false;
  }
  if (!active || locked) sender?.disable();
  else sender?.enable();
});
watch(() => props.active, active => {
  if (!active) {
    contextMenuVisible.value = false;
    plusOpen.value = false;
  }
}, { flush: "sync" });
watch(running, value => {
  if (!value) return;
  resetAttachmentDrag();
  mentionQuery.value = undefined;
  skillQuery.value = undefined;
  mentionPosition = undefined;
  plusOpen.value = false;
  mentionMenuRef.value?.closeMenu();
  skillMenuRef.value?.closeMenu();
});

function submitDraft(mode: "steer" | "followUp" = "followUp") {
  if (locked.value || !props.active || (running.value && editingId.value)) return;
  if (running.value && (draftAttachments.value.length || sender?.getTagData().mention.length)) {
    ElMessage.warning("生成期间仅支持发送文字，请先移除附件和提及；当前草稿已保留");
    return;
  }
  if (running.value) emit("submit", mode);
  else emit("submit");
}

function getDraftContent() {
  // XSender 的文本模型延后一帧更新；发送时读取 DOM，避免漏掉刚输入的字符。
  return sender?.getModel().map((line, lineIndex) => line.map((tag, tagIndex) => {
    if (tag.type === "Mention") return `{{mention:${tag.id}}}`;
    return sender?.chatEditor.NODES[lineIndex]?.children[tagIndex]?.$el.textContent ?? "";
  }).join("")).join("\n").replace(/[\ufeff\u200b]/g, "") ?? "";
}

function captureMentionPosition() {
  const node = sender?.getCurrentNode();
  mentionPosition = node?.instance?.$el.isConnected ? { node: { ...node }, remove: mentionQuery.value === undefined ? 0 : mentionQuery.value.length + 1 } : undefined;
  skillQuery.value = undefined;
}

function updateMentionQuery() {
  if (running.value || !sender || insertingMentions || sender.chatEditor.isComposition || !sender.chatElement.richText.contains(sender.getSelection().anchorNode)) return;
  const current = sender.getCurrentNode();
  const before = current?.instance?.type === "Write" ? current.instance.text.slice(0, current.offset) : "";
  mentionQuery.value = /(?:^|[^\w@])@([^\s@]*)$/.exec(before)?.[1];
  if (mentionQuery.value !== undefined) captureMentionPosition();
}

function handleSenderKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || sender?.chatEditor.isComposition) return;
  const id = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-agent-mention]")?.dataset.agentMention : undefined;
  if (id && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    draftMentionPreview.value?.preview(id);
    return;
  }
  if (mentionMenuRef.value?.handleKeydown(event)) return;
  skillMenuRef.value?.handleKeydown(event);
  if (event.defaultPrevented) return;
  if (running.value && event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    event.stopPropagation();
    submitDraft("steer");
  }
}

async function insertMentions(mentions: AgentMention[]) {
  const instance = sender;
  if (!instance || locked.value || running.value || !props.active) return;
  const currentIds = new Set(instance.getTagData().mention.map(item => item.id));
  if (currentIds.size + mentions.length > 20) return ElMessage.warning("每条消息最多提及 20 个输出或素材");
  insertingMentions = true;
  try {
    if (mentionPosition?.node.instance.$el.isConnected) mentionPosition.node.instance.focus(mentionPosition.node.offset);
    else instance.focus("last");
    if (mentionPosition?.remove) await instance.backspace(-mentionPosition.remove);
    for (const mention of mentions) {
      if (sender !== instance || locked.value || running.value || !props.active) break;
      draftMentions.value.push(mention);
      await instance.setMention({ id: mention.id, name: mentionName(mention) });
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "添加提及失败");
  } finally {
    mentionQuery.value = undefined;
    mentionPosition = undefined;
    insertingMentions = false;
  }
}

// 加号菜单：把「上传附件 / 引用素材或画布 / 使用技能」收进一个入口，并复用既有的 @ 与 / 解析。
function chooseAttachment() {
  plusOpen.value = false;
  if (locked.value || running.value) return;
  attachmentInput.value?.click();
}

function openResourceMenu(kind: "mention" | "skill") {
  plusOpen.value = false;
  if (!sender || locked.value || running.value || !props.active || !props.directory) return;
  if (kind === "mention") {
    skillMenuRef.value?.closeMenu();
    mentionMenuRef.value?.openMenu();
  } else {
    mentionMenuRef.value?.closeMenu();
    skillMenuRef.value?.openMenu();
  }
}

function closePlusMenu(event: PointerEvent) {
  if (!plusOpen.value) return;
  const target = event.target;
  if (target instanceof Element && target.closest(".addMenuWrap")) return;
  plusOpen.value = false;
}

onMounted(() => document.addEventListener("pointerdown", closePlusMenu, true));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closePlusMenu, true));

async function removeDraftMention(id: string) {
  if (!locked.value) await sender?.removeMention([id]);
}

async function selectSkill(name: string) {
  const instance = sender;
  if (!instance || locked.value || running.value) return;
  const model = instance.getModel();
  const first = model[0]?.[0];
  if (first?.type === "Write") first.text = `/skill:${name} ${first.text.replace(skillQuery.value !== undefined ? /^\/\S*/ : /^\s*\/skill:\S+(?:\s+|$)/, "")}`;
  if (!model.length) model.push([]);
  if (first?.type !== "Write") model[0]!.unshift({ type: "Write", text: `/skill:${name} ` });
  skillQuery.value = undefined;
  mentionMenuRef.value?.closeMenu();
  await instance.reset({ clearHistory: false, chatNode: model });
  if (sender === instance) instance.focus("last");
}

async function fillPrompt(prompt: string, attachments?: AgentAttachment[]) {
  const instance = sender;
  if (!instance || locked.value) return false;
  if (running.value && attachments?.length) {
    ElMessage.warning("生成期间仅支持发送文字，当前草稿已保留");
    return false;
  }
  draftMentions.value = [];
  if (attachments) draftAttachments.value = [...attachments];
  await instance.reset({ clearHistory: false, chatNode: [[{ type: "Write", text: prompt }]] });
  if (sender !== instance) return false;
  instance.focus("last");
  return true;
}

async function appendPrompt(prompt: string) {
  const instance = sender;
  if (!instance || locked.value || !props.active) return;
  const model = instance.getModel().map((line, lineIndex) => line.map((tag, tagIndex) => {
    if (tag.type !== "Write") return tag;
    const element = instance.chatEditor.NODES[lineIndex]?.children[tagIndex]?.$el;
    return { ...tag, text: (element?.textContent ?? tag.text).replace(/[\ufeff\u200b]/g, "") };
  }));
  const lines: AnyTagProps[][] = prompt.split("\n").map(text => [{ type: "Write", text }]);
  await instance.reset({ clearHistory: false, chatNode: getDraftContent().trim() ? [...model, ...lines] : lines });
  if (sender === instance) instance.focus("last");
}

async function fillQueuedMessage(prompt: string) {
  const instance = sender;
  if (!instance) return;
  draftMentions.value = [];
  draftAttachments.value = [];
  mentionQuery.value = undefined;
  skillQuery.value = undefined;
  mentionPosition = undefined;
  mentionMenuRef.value?.closeMenu();
  await instance.reset({ clearHistory: false, chatNode: [[{ type: "Write", text: prompt }]] });
  if (sender === instance) instance.focus("last");
}

async function editMessage(item: AgentMessage) {
  const instance = sender;
  if (!instance || locked.value || running.value || item.role !== "user") return;
  if (!editingId.value) editDraft = { model: instance.getModel(), mentions: [...draftMentions.value], attachments: [...draftAttachments.value] };
  editingId.value = item.id;
  draftMentions.value = [...item.mentions ?? []];
  draftAttachments.value = [...item.attachments ?? []];
  mentionMenuRef.value?.closeMenu();
  const model: AnyTagProps[][] = item.content.split("\n").map(line => mentionParts(line, item.mentions).map(part => part.mention
    ? { type: "Mention", id: part.mention.id, name: mentionName(part.mention) } : { type: "Write", text: part.text }));
  await instance.reset({ chatNode: model });
  if (sender === instance) instance.focus("last");
}

async function restoreEditingDraft() {
  const draft = editDraft;
  editDraft = undefined;
  editingId.value = undefined;
  draftMentions.value = draft?.mentions ?? [];
  draftAttachments.value = draft?.attachments ?? [];
  await sender?.reset({ chatNode: draft?.model });
}

async function cancelEdit() {
  if (running.value || props.submitting || props.deletingId !== undefined || voiceActive.value) return;
  clearVoicePress();
  await restoreEditingDraft();
}

function setSenderHeight(height: number) {
  if (!sender) return;
  senderMaxHeight.value = Math.max(44, window.innerHeight / 2);
  senderHeight.value = Math.max(44, Math.min(senderMaxHeight.value, Math.round(height)));
  sender.chatElement.rollBox.style.height = `${senderHeight.value}px`;
}

function startSenderResize(event: PointerEvent) {
  if (event.button !== 0 || senderResize || !sender || voiceActive.value) return;
  event.preventDefault();
  senderResize = { pointerId: event.pointerId, y: event.clientY, height: sender.chatElement.rollBox.getBoundingClientRect().height };
  senderHeight.value = senderResize.height;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function moveSenderResize(event: PointerEvent) {
  if (senderResize?.pointerId !== event.pointerId) return;
  setSenderHeight(senderResize.height + senderResize.y - event.clientY);
}

function stopSenderResize(event: PointerEvent) {
  if (senderResize?.pointerId === event.pointerId) senderResize = undefined;
}

async function restoreTextAttachment(index: number) {
  const instance = sender;
  const attachment = draftAttachments.value[index];
  if (!instance || locked.value || !props.active || attachment?.mimeType !== "text/plain") return;
  restoringAttachment.value = true;
  try {
    const text = await readTextAttachment(attachment, props.directory);
    if (sender !== instance || !props.active || props.disabled || !draftAttachments.value.includes(attachment)) return;
    instance.focus("last");
    await instance.setText(`${instance.isEmpty(false) ? "" : "\n"}${text}`);
    if (sender === instance) draftAttachments.value = draftAttachments.value.filter(item => item !== attachment);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "还原文本附件失败，请重试");
  } finally {
    restoringAttachment.value = false;
  }
}

function pasteAttachments(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (!files.length && !running.value) {
    try {
      const file = createPastedTextFile(event.clipboardData?.getData("text/plain") ?? "");
      if (file) files.push(file);
    } catch (error) {
      event.preventDefault();
      event.stopImmediatePropagation();
      ElMessage.warning(error instanceof Error ? error.message : "无法添加文本附件");
      return;
    }
  }
  if (!files.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  addAttachments(files);
}

function selectAttachments(event: Event) {
  const input = event.target as HTMLInputElement;
  addAttachments(Array.from(input.files ?? []));
  input.value = "";
}

function resetAttachmentDrag() {
  attachmentDragDepth = 0;
  draggingAttachments.value = false;
}

function dragEnterAttachments(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  attachmentDragDepth++;
  dragOverAttachments(event);
}

function dragOverAttachments(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.stopPropagation();
  draggingAttachments.value = !locked.value && !running.value && props.active;
  if (draggingAttachments.value) attachmentDragDepth = Math.max(1, attachmentDragDepth);
  event.dataTransfer.dropEffect = draggingAttachments.value ? "copy" : "none";
}

function dragLeaveAttachments(event: DragEvent) {
  if (!attachmentDragDepth) return;
  event.stopPropagation();
  if (--attachmentDragDepth === 0) resetAttachmentDrag();
}

function dropAttachments(event: DragEvent) {
  resetAttachmentDrag();
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (!files.length) return;
  event.preventDefault();
  event.stopPropagation();
  addAttachments(files);
}

function addAttachments(files: File[]) {
  if (locked.value) return;
  if (running.value) return ElMessage.warning("生成期间仅支持发送文字，请在本轮完成后添加附件");
  for (const file of files) {
    const readableMimeType = getReadableFileMimeType(file.name, file.type);
    const mimeType = readableMimeType ?? file.type.split(";")[0]!.trim().toLowerCase();
    if (!readableMimeType && !/^(image|video)\//.test(mimeType)) {
      ElMessage.warning("只支持图片、视频和受支持的文本或文档文件");
      continue;
    }
    if (!file.size || file.size > 100 * 1024 * 1024) {
      ElMessage.warning("附件不能为空且不能超过 100 MB");
      continue;
    }
    if (mimeType === "text/plain" && file.size > 400000) {
      ElMessage.warning("文本附件不能超过 400 KB（400000 字节），请缩减内容后重试。");
      continue;
    }
    if (draftAttachments.value.length >= 20) {
      ElMessage.warning("每条消息最多添加 20 个附件");
      break;
    }
    draftAttachments.value.push({ name: file.name, path: "", mimeType, file });
  }
}

watch(senderElement, (element, _previous, onCleanup) => {
  if (!element) return;
  const instance = new xSender(element, {
    autoFocus: props.active,
    placeholder: placeholder.value,
    chatStyle: { minHeight: "44px", maxHeight: "50vh", fontSize: "14px", lineHeight: "24px" },
    keyboardSendFun: event => event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !sender?.chatEditor.isComposition,
    keyboardWrapFun: event => event.key === "Enter" && event.shiftKey && !event.isComposing && event.keyCode !== 229 && !sender?.chatEditor.isComposition,
  });
  sender = instance;
  if (!props.active || locked.value) instance.disable();
  instance.bus.on("agentConversation", xSender.EventSet.EVENT_COMMON_SEND, () => submitDraft());
  instance.bus.on("agentConversation", xSender.EventSet.EVENT_COMMON_CHANGE, () => {
    skillQuery.value = /^\/([^\s/]*)$/.exec(instance.getText())?.[1];
    const targets: typeof draftMentionTargets.value = [];
    for (const line of instance.chatEditor.NODES) for (const tag of line.children) {
      if (tag.type !== "Mention") continue;
      tag.$el.dataset.agentMention = tag.id;
      tag.$el.setAttribute("role", "button");
      tag.$el.setAttribute("tabindex", "0");
      tag.$el.setAttribute("aria-label", t`预览 ${tag.name}`);
      const mention = draftMentions.value.find(item => item.id === tag.id);
      if (!mention || !mentionThumbnailProps(mention).thumbnail) continue;
      const content = tag.$el.querySelector<HTMLElement>(".chat-tag-mention");
      if (!content) continue;
      let element = content.querySelector<HTMLElement>(".agentMentionThumbnail");
      if (!element) {
        element = document.createElement("span");
        element.className = "agentMentionThumbnail";
        const label = document.createElement("span");
        label.className = "agentMentionLabel";
        label.textContent = content.textContent;
        content.replaceChildren(element, label);
      }
      targets.push({ key: draftMentionTargets.value.find(target => target.element === element)?.key ?? Symbol(), element, mention });
    }
    draftMentionTargets.value = targets;
    void instance.nextTick(() => { if (sender === instance) updateMentionQuery(); });
  });
  instance.bus.on("agentConversation", xSender.EventSet.EVENT_COMMON_TAG_CLICK, (tag: { type: string; id?: string }) => {
    if (tag.type === "Mention" && tag.id) draftMentionPreview.value?.preview(tag.id);
  });
  const editor = instance.chatElement.richText;
  const nextTick = instance.nextTick.bind(instance);
  instance.nextTick = callback => nextTick(() => { if (sender === instance && editor.isConnected) return typeof callback === "function" ? callback() : callback; });
  const chatEditor = instance.chatEditor as typeof instance.chatEditor & { insertNodes(nodes: AnyTagProps[][]): Promise<void> };
  const insertNodes = chatEditor.insertNodes.bind(chatEditor);
  chatEditor.insertNodes = async nodes => {
    // 异步粘贴和输入法回调在编辑器卸载后不再新建输入节点。
    if (sender === instance && editor.isConnected) await insertNodes(nodes);
  };
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-label", translate("消息"));
  editor.setAttribute("aria-multiline", "true");
  element.addEventListener("paste", pasteAttachments, true);
  window.addEventListener("dragend", resetAttachmentDrag, true);
  window.addEventListener("drop", resetAttachmentDrag, true);
  window.addEventListener("blur", resetAttachmentDrag);
  const updateCursor = (event: Event) => { if (!(event instanceof KeyboardEvent) || event.key !== "Escape") updateMentionQuery(); };
  editor.addEventListener("keyup", updateCursor);
  editor.addEventListener("compositionend", updateCursor);
  onCleanup(() => {
    cancelVoiceInput();
    draftMentionTargets.value = [];
    sender = undefined;
    senderResize = undefined;
    element.removeEventListener("paste", pasteAttachments, true);
    window.removeEventListener("dragend", resetAttachmentDrag, true);
    window.removeEventListener("drop", resetAttachmentDrag, true);
    window.removeEventListener("blur", resetAttachmentDrag);
    resetAttachmentDrag();
    editor.removeEventListener("keyup", updateCursor);
    editor.removeEventListener("compositionend", updateCursor);
    // ACT: XSender 1.4.6 的排队聚焦不会随 destroy 取消；保留回调所需字段，库修复后可恢复直接销毁。
    Object.assign(instance.chatEditor, { focusFirst: () => {}, focusLast: () => {}, focusMark: () => {}, cursorView: () => {} });
    for (const line of instance.chatEditor.NODES) for (const tag of line.children) {
      if (tag.type === "Write" || tag.type === "Input") tag.focus = () => {};
    }
    instance.bus.offKeyEvent("agentConversation");
    instance.bus.emit(xSender.EventSet.EVENT_COMMON_DESTROY);
  });
});


function getDraft() {
  return { prompt: getDraftContent(), attachments: draftAttachments.value, mentions: draftMentions.value, mentionedIds: sender?.getTagData().mention.map(mention => mention.id) ?? [] };
}

async function clearDraft() {
  draftAttachments.value = [];
  draftMentions.value = [];
  await sender?.reset();
}

defineExpose({ getDraft, clearDraft, fillPrompt, appendPrompt, fillQueuedMessage, editMessage, cancelEdit, restoreEditingDraft });
</script>

<style lang="scss">
.agentConversation {
  .messageInput {
    --chat-text: var(--el-text-color-primary);
    --chat-text-placeholder: var(--el-text-color-placeholder);
    --chat-rect-padding: 12px;
    --chat-mention-text: var(--el-color-primary);
    position: relative;
    flex-shrink: 0;
    margin: 0 12px 10px;
    border: 1px solid var(--el-border-color);
    border-radius: 18px;
    background: var(--el-bg-color);
    box-shadow: 0 2px 10px rgb(0 0 0 / 5%);

    &:focus-within {
      border-color: var(--el-color-primary-light-5);
    }

    &.draggingAttachments {
      border-color: var(--el-color-primary-light-5);
    }

    &.voiceActive {
      border-color: var(--el-color-primary);
      box-shadow: 0 0 0 2px var(--el-color-primary-light-9);

      .senderInput {
        min-height: 100px;
        touch-action: none;
        user-select: none;
      }
    }

    .senderInput {
      position: relative;

      .voiceOverlay {
        position: absolute;
        inset: 0;
        z-index: 12;
        overflow: auto;
        padding: 12px;
        border-radius: calc(var(--ui-radius) * 2.75);
        background: var(--el-bg-color);
        color: var(--el-text-color-placeholder);
        font-size: 14px;
        line-height: 24px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        pointer-events: none;

        .voiceFeedback {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 24px;
          color: var(--el-color-primary);

          .voiceWave {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 3px;
            height: 24px;
            flex-shrink: 0;

            > span {
              width: 3px;
              min-height: 3px;
              border-radius: 3px;
              background: currentColor;
              transition: height 60ms linear;
            }
          }
        }

        .voiceTranscript { color: var(--el-text-color-primary); }

        @media (prefers-reduced-motion: reduce) {
          .voiceFeedback .voiceWave > span { transition: none; }
        }
      }
    }

    .attachmentDropHint {
      position: absolute;
      inset: 0;
      z-index: 13;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      border-radius: inherit;
      background: var(--el-bg-color);
      color: var(--el-text-color-primary);
      font-size: 14px;
      font-weight: 500;
      pointer-events: none;

      > svg {
        color: var(--el-text-color-secondary);
      }

      small {
        color: var(--el-text-color-secondary);
        font-size: 12px;
        font-weight: 400;
      }
    }

    .senderResizeHandle {
      position: absolute;
      z-index: 12;
      top: -4px;
      right: 12px;
      left: 12px;
      height: 8px;
      border-radius: 4px;
      cursor: ns-resize;
      touch-action: none;
      user-select: none;

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
        outline-offset: 2px;
      }
    }

    .draftAttachments {
      padding: 12px 12px 0;
    }

    .senderEditor .chat-placeholder-wrap {
      font-size: 14px;
      font-style: normal;
      line-height: 24px;
    }

    .editingBanner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 3px 12px;
      border-bottom: 1px solid var(--el-border-color-lighter);
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }

    .senderEditor .chat-tag-mention {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
      vertical-align: middle;
      border-radius: var(--el-border-radius-small);
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      white-space: normal;
      overflow-wrap: anywhere;
      cursor: pointer;

      .agentMentionThumbnail {
        display: inline-flex;
        flex-shrink: 0;

        .mentionThumbnail { width: 24px; height: 24px; border-radius: 3px; }
      }
      .agentMentionLabel { min-width: 0; }
    }

    .senderActions {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 4px;
      padding: 2px 8px 6px;

      > .el-button {
        margin-left: 0;
      }

      .modelPopover {
        flex: 0 1 auto;
        min-width: 0;
        margin-inline-start: auto;

        .modelButton {
          height: auto;
          min-height: 28px;
          padding-block: 4px;

          .modelName {
            overflow: visible;
            text-align: end;
            font-size: 12px;

            .labelText {
              overflow: visible;
              overflow-wrap: anywhere;
              white-space: normal;
              line-height: 1.3;
            }
          }
        }
      }

      .contextButton {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        margin: 0;
        padding: 0;

        &.is-text {
          background-color: transparent;
        }
      }

      .voiceButton {
        width: 28px;
        height: 28px;
        flex-shrink: 0;
        padding: 0;
        color: var(--el-text-color-secondary);

        &.voiceActive {
          background-color: var(--el-color-primary);
          color: white;
          box-shadow: 0 0 0 4px var(--el-color-primary-light-8);
        }
      }

      .stopButton {
        width: 28px;
        height: 28px;
        flex-shrink: 0;
        padding: 0;
        color: var(--el-text-color-regular);
      }

      .sendButton {
        width: 34px;
        height: 34px;
        flex-shrink: 0;
        margin: 0;
        border: none;
      }
    }
  }
  .mentionMenu .mentionButton, .skillMenu .skillButton { display: none; }

  .addMenuWrap {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;

    .addMenu {
      position: absolute;
      inset-block-end: calc(100% + 8px);
      inset-inline-start: 0;
      z-index: 20;
      display: flex;
      flex-direction: column;
      min-width: 232px;
      padding: 6px;
      background: var(--el-bg-color-overlay);
      border: 1px solid var(--el-border-color-light);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgb(0 0 0 / 16%);

      .addMenuDivider { height: 1px; margin: 4px 6px; background: var(--el-border-color-lighter); }

      .addMenuItem {
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 9px 10px;
        color: var(--el-text-color-primary);
        font: inherit;
        font-size: 13px;
        text-align: start;
        background: transparent;
        border: 0;
        border-radius: 8px;
        cursor: pointer;

        &:hover, &:focus-visible { background: var(--el-fill-color-light); outline: none; }

        span { flex: 1; }

        em {
          color: var(--el-text-color-secondary);
          font-size: 11px;
          font-style: normal;
        }
      }
    }
  }

}
</style>
