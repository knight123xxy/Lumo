<template>
  <div class="characterLibrary" :aria-busy="loading">
    <div class="libraryToolbar">
      <el-input v-model="query" class="searchInput" :prefixIcon="IconSearch" :placeholder="translate('搜索角色')" :aria-label="translate('搜索角色')" clearable />
      <el-button type="primary" :icon="IconPlus" :disabled="loading" @click="openCreate">{{ translate('新建角色') }}</el-button>
    </div>

    <p v-if="errorText" class="libraryError" role="alert">{{ errorText }}</p>

    <el-scrollbar class="libraryScroll">
      <div v-if="visibleCharacters.length" class="characterGrid">
        <article v-for="character in visibleCharacters" :key="character.id" class="characterCard">
          <img class="characterImage" :src="assetUrl(character.image)" :alt="character.name" loading="lazy" />
          <div class="characterBody">
            <strong class="characterName" :title="character.name">{{ character.name }}</strong>
            <p v-if="character.description" class="characterDescription">{{ character.description }}</p>
            <div v-if="character.tags.length" class="characterTags">
              <span v-for="tag in character.tags" :key="tag" class="characterTag">{{ tag }}</span>
            </div>
          </div>
          <div class="characterActions">
            <el-button text size="small" @click="openEdit(character)">{{ translate('编辑') }}</el-button>
            <el-button text size="small" @click="copyReference(character)">{{ translate('复制引用') }}</el-button>
            <el-button text size="small" type="danger" @click="remove(character)">{{ translate('删除') }}</el-button>
          </div>
        </article>
      </div>
      <div v-else-if="!loading" class="characterEmpty">
        <p>{{ query ? translate('没有符合条件的角色') : translate('还没有角色，先保存一个参考形象') }}</p>
      </div>
      <p v-if="loading" class="libraryStatus" role="status">{{ translate('正在加载角色…') }}</p>
    </el-scrollbar>

    <el-dialog v-model="dialogVisible" :title="editing ? translate('编辑角色') : translate('新建角色')" width="min(520px, calc(100vw - 32px))" :closeOnClickModal="!saving" destroyOnClose>
      <div class="characterForm">
        <label class="formLabel" for="characterName">{{ translate('角色名称') }}</label>
        <el-input id="characterName" v-model="form.name" :maxlength="limits.name" :disabled="saving" />
        <label class="formLabel" for="characterDescription">{{ translate('外观与性格描述') }}</label>
        <el-input id="characterDescription" v-model="form.description" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" :maxlength="limits.description" :disabled="saving" :placeholder="translate('用于生成时保持一致的形象，例如发型、服装、气质')" />
        <label class="formLabel" for="characterTags">{{ translate('标签') }}</label>
        <el-input id="characterTags" v-model="form.tags" :disabled="saving" :placeholder="translate('用逗号分隔，例如 主角, 少年')" />
        <span class="formLabel">{{ translate('参考图') }}</span>
        <div class="imagePicker">
          <img v-if="form.image" class="imagePreview" :src="assetUrl(form.image)" :alt="translate('参考图预览')" />
          <div v-else class="imagePlaceholder">{{ translate('请选择参考图') }}</div>
          <div class="imageActions">
            <el-button size="small" :disabled="saving || uploading" @click="fileInput?.click()">{{ uploading ? translate('正在上传…') : translate('上传图片') }}</el-button>
            <el-button v-if="form.image && !uploading" size="small" text @click="form.image = ''">{{ translate('清除') }}</el-button>
          </div>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="uploadImage" />
        </div>
      </div>
      <template #footer>
        <el-button :disabled="saving" @click="dialogVisible = false">{{ translate('取消') }}</el-button>
        <el-button type="primary" :loading="saving" :disabled="!form.name.trim() || !form.image" @click="save">{{ translate('保存') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import { IconPlus, IconSearch } from "@tabler/icons-vue";
import http from "@/lib/http";

type Character = { id: string; name: string; description: string; image: string; tags: string[]; createdAt: number; updatedAt: number };
type Limits = { total: number; name: number; description: number; tags: number; tag: number };
type CharacterResponse = { characters: Character[]; limits: Limits };

const props = defineProps<{ active: boolean }>();
const characters = ref<Character[]>([]);
const limits = ref<Limits>({ total: 200, name: 40, description: 600, tags: 8, tag: 16 });
const query = ref("");
const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const errorText = ref("");
const dialogVisible = ref(false);
const editing = ref<Character | null>(null);
const fileInput = ref<HTMLInputElement>();
const form = ref({ name: "", description: "", tags: "", image: "" });

const visibleCharacters = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase();
  if (!keyword) return characters.value;
  return characters.value.filter(character => [character.name, character.description, ...character.tags]
    .some(value => value.toLocaleLowerCase().includes(keyword)));
});

function assetUrl(path: string) {
  return `/api/assets/read?path=${encodeURIComponent(path)}`;
}

function showError(error: unknown, fallback: string) {
  errorText.value = error instanceof Error && error.message ? error.message : fallback;
}

async function load() {
  loading.value = true;
  errorText.value = "";
  try {
    const result = await http<CharacterResponse>({ method: "GET", url: "/api/characters/list" });
    characters.value = result.characters;
    limits.value = result.limits;
  } catch (error) {
    showError(error, translate("读取角色失败"));
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.value = { name: "", description: "", tags: "", image: "" };
  dialogVisible.value = true;
}

function openEdit(character: Character) {
  editing.value = character;
  form.value = { name: character.name, description: character.description, tags: character.tags.join(", "), image: character.image };
  dialogVisible.value = true;
}

// ACT: 参考图存进全局素材的 characters 目录，角色记录只引用相对路径；同名用随机名避免覆盖其他角色图片。
async function uploadImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    errorText.value = translate("请选择图片文件");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    errorText.value = translate("参考图不能超过 20 MB");
    return;
  }
  uploading.value = true;
  errorText.value = "";
  try {
    await http({ method: "POST", url: "/api/assets/mkdir", data: { path: "characters" } }).catch(() => {});
    const suffix = file.name.split(".").at(-1)?.toLowerCase() || "png";
    const path = `characters/${crypto.randomUUID()}.${suffix}`;
    await http({ method: "PUT", url: "/api/assets/save", data: file, params: { path }, headers: { "Content-Type": "application/octet-stream" } });
    form.value.image = path;
  } catch (error) {
    showError(error, translate("上传参考图失败"));
  } finally {
    uploading.value = false;
  }
}

async function save() {
  if (saving.value || !form.value.name.trim() || !form.value.image) return;
  saving.value = true;
  errorText.value = "";
  try {
    const tags = form.value.tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
    await http<Character>({ method: "POST", url: "/api/characters/save", data: {
      ...(editing.value ? { id: editing.value.id } : {}),
      name: form.value.name.trim(),
      description: form.value.description.trim(),
      image: form.value.image,
      tags,
    } });
    dialogVisible.value = false;
    await load();
    ElMessage.success(translate("角色已保存"));
  } catch (error) {
    showError(error, translate("保存角色失败"));
  } finally {
    saving.value = false;
  }
}

async function remove(character: Character) {
  const confirmed = await ElMessageBox.confirm(
    `${translate("确定删除角色")}“${character.name}”？`,
    translate("删除角色"),
    { type: "warning", confirmButtonText: translate("删除"), cancelButtonText: translate("取消") },
  ).then(() => true, () => false);
  if (!confirmed) return;
  try {
    await http({ method: "POST", url: "/api/characters/remove", data: { id: character.id } });
    await load();
  } catch (error) {
    showError(error, translate("删除角色失败"));
  }
}

// ACT: 复用方式先给最小闭环——复制参考图引用，粘贴到画布节点或 Agent 对话里即可引用同一形象。
async function copyReference(character: Character) {
  const reference = `${character.name}（参考图 ${character.image}）`;
  try {
    await navigator.clipboard.writeText(reference);
    ElMessage.success(translate("引用已复制"));
  } catch {
    errorText.value = translate("复制失败，请手动记录参考图路径");
  }
}

watch(() => props.active, active => { if (active && !characters.value.length) void load(); }, { immediate: true });
</script>

<style lang="scss" scoped>
.characterLibrary {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  overflow: hidden;

  .libraryToolbar {
    display: flex;
    gap: 8px;
    align-items: center;

    .searchInput { max-width: 280px; }
  }

  .libraryError { margin: 0; color: var(--el-color-danger); font-size: 13px; }
  .libraryStatus { margin: 12px 0; color: var(--el-text-color-secondary); font-size: 13px; }

  .libraryScroll { min-height: 0; }

  .characterGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 14px;
    padding-bottom: 16px;
  }

  .characterCard {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color-light);
    border-radius: 12px;

    .characterImage {
      width: 100%;
      aspect-ratio: 3 / 4;
      object-fit: cover;
      background: var(--el-fill-color-light);
    }

    .characterBody {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px 6px;
    }

    .characterName { font-size: 14px; }
    .characterDescription {
      display: -webkit-box;
      margin: 0;
      overflow: hidden;
      color: var(--el-text-color-secondary);
      font-size: 12px;
      line-height: 1.6;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .characterTags { display: flex; flex-wrap: wrap; gap: 4px; }
    .characterTag {
      padding: 1px 7px;
      color: var(--el-text-color-regular);
      font-size: 11px;
      background: var(--el-fill-color-light);
      border-radius: 999px;
    }

    .characterActions {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      padding: 4px 8px 8px;
    }
  }

  .characterEmpty { padding: 48px 0; color: var(--el-text-color-secondary); text-align: center; }

  .characterForm {
    display: grid;
    gap: 8px;

    .formLabel { margin-top: 4px; color: var(--el-text-color-regular); font-size: 13px; }

    .imagePicker {
      display: flex;
      gap: 12px;
      align-items: center;

      .imagePreview,
      .imagePlaceholder {
        width: 96px;
        height: 128px;
        border-radius: 10px;
      }

      .imagePreview {
        object-fit: cover;
        border: 1px solid var(--el-border-color-light);
      }

      .imagePlaceholder {
        display: grid;
        place-items: center;
        color: var(--el-text-color-secondary);
        font-size: 12px;
        background: var(--el-fill-color-lighter);
        border: 1px dashed var(--el-border-color);
      }

      .imageActions { display: flex; flex-direction: column; gap: 6px; }
    }
  }
}
</style>
