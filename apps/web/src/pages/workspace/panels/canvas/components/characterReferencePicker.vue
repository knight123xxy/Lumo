<template>
  <section class="characterReferencePicker" :aria-label="translate('角色参考图')">
    <label :for="selectId">{{ translate('角色参考图') }}</label>
    <el-select :id="selectId" v-model="characterId" filterable :loading="loading" :disabled="disabled" :placeholder="translate('从角色库选择')">
      <el-option v-for="character in characters" :key="character.id" :label="character.name" :value="character.id" />
    </el-select>
    <el-button size="small" :disabled="disabled || !characterId" @click="select">{{ translate('引用参考图') }}</el-button>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onScopeDispose, ref, useId } from "vue";
import { ElButton, ElOption, ElSelect } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import http from "@/lib/http";

type Character = { id: string; name: string; image: string };
const { disabled } = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ select: [entry: { name: string; path: string; type: "file" }] }>();
const characters = ref<Character[]>([]);
const characterId = ref("");
const selectId = useId();
const loading = ref(true);
const error = ref("");
const lifetime = new AbortController();
onScopeDispose(() => lifetime.abort());
onMounted(async () => {
  try {
    const result = await http<{ characters: Character[] }>({ method: "GET", url: "/api/characters/list", signal: lifetime.signal });
    characters.value = result.characters;
  } catch (failure) {
    if (!lifetime.signal.aborted) error.value = failure instanceof Error ? failure.message : translate("读取角色失败");
  } finally {
    loading.value = false;
  }
});
function select() {
  const character = characters.value.find(item => item.id === characterId.value);
  const extension = character?.image.match(/\.[a-z0-9]+$/i)?.[0];
  if (character && extension) emit("select", { name: character.name + extension, path: character.image, type: "file" });
}
</script>

<style scoped lang="scss">
.characterReferencePicker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  .el-select { width: min(240px, 100%); }
  [role="alert"] { margin: 0; color: var(--el-color-danger); }
}
</style>
