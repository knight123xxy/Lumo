<template>
  <nodeSkeleton v-bind="nodeProps" v-model:bottomVisible="node.selected" :topVisible="node.selected" topWidth="max-content" :bottomWidth="520">
    <div v-loading="rendering" class="motionContent" :aria-busy="rendering">
      <el-input v-model="data.pkgPath" placeholder=".motion 模板包路径" aria-label=".motion 模板包路径" :disabled="rendering" clearable />
      <el-input v-model="paramsText" type="textarea" :rows="6" placeholder="参数 JSON（scenes / content / media 等）" aria-label="参数 JSON" :disabled="rendering" />
      <el-button type="primary" :icon="IconMovie" :loading="rendering" :disabled="!data.pkgPath.trim()" @click="render">渲染成片</el-button>
    </div>
    <template #bottom>
      <el-card shadow="never">
        <p v-if="outputFile" class="resultPath">{{ outputFile.url }}</p>
        <p v-else class="resultEmpty">尚无成片</p>
      </el-card>
    </template>
  </nodeSkeleton>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElCard, ElInput, ElLoading } from "element-plus";
import { IconMovie } from "@tabler/icons-vue";
import { nodeSkeleton, useNode, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import { showNodeError } from "@toonflow/node-shared/showNodeError";

defineOptions({
  inheritAttrs: false,
  icon: IconMovie,
  handles: [
    { id: "video", type: "source", dataType: "VIDEO", label: "视频输出" },
  ] satisfies NodeHandle[],
});

const vLoading = ElLoading.directive;
const { node, nodeProps, outputs } = useNode({ label: "动效模板" });
const data = computed(() => node.data as { pkgPath: string });
data.value.pkgPath ??= "";

const paramsText = ref("");
const rendering = ref(false);
const outputFile = computed(() => (outputs.value.video?.dataType === "VIDEO" ? outputs.value.video.value : undefined));

async function render() {
  if (!data.value.pkgPath.trim() || rendering.value) return;
  rendering.value = true;
  try {
    let params: unknown = {};
    if (paramsText.value.trim()) {
      params = JSON.parse(paramsText.value);
      if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error("参数必须是 JSON 对象");
    }
    const response = await fetch("/api/motion/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pkgPath: data.value.pkgPath, params }),
    });
    const body = (await response.json()) as { code: number; data?: { finalVideo?: string }; message?: string };
    if (body.code !== 200 || !body.data?.finalVideo) throw new Error(body.message || "渲染失败");
    outputs.value.video = { dataType: "VIDEO", value: { url: body.data.finalVideo, mimeType: "video/mp4" } };
  } catch (error) {
    showNodeError(error, "动效模板渲染失败");
  } finally {
    rendering.value = false;
  }
}
</script>

<style scoped>
.motionContent {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}
.resultPath {
  margin: 0;
  word-break: break-all;
  font-size: 12px;
  opacity: 0.72;
}
.resultEmpty {
  margin: 0;
  font-size: 12px;
  opacity: 0.45;
}
</style>
