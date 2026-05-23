<template>
  <FileCard
    :title="profile.name || 'untitled'"
    :note="profile.note"
    :inboundCount="inboundCount"
    :outboundCount="outboundCount"
    :menuItems="cardMenuItems"
    @click="handleCardClick"
    @edit="openModal"
    @action="handleCardAction"
  />

  <!-- Edit Modal -->
  <EditorModal
    :isOpen="isOpen"
    @update:isOpen="isOpen = $event"
    :title="profile.name"
    @update:title="profile.name = $event"
    :editableTitle="true"
    extension=".json"
    :isDirty="isLocalDirty"
    :isSaving="false"
    :showSave="!isCodeMode && isLocalDirty"
    saveText="保存局部"
    @save="handleSave"
    @close="closeModal"
  >
    <template #header-actions>
      <button
        @click="toggleCodeMode"
        :class="['flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer', isCodeMode ? 'bg-[#F596AA]/20 text-[#F596AA] border border-[#F596AA]/40' : 'text-[#86868b] hover:text-[#f5f5f7] bg-[#2c2c2e] border border-[#38383a] hover:border-[#86868b]']"
        title="实时预览"
      >
        <Code :size="14" /> {{ isCodeMode ? '退出预览' : '实时预览' }}
      </button>
      <button
        @click="handleDuplicate"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#86868b] hover:text-[#F596AA] bg-[#2c2c2e] border border-[#38383a] hover:border-[#F596AA]/40 transition-colors cursor-pointer"
        title="复制此配置"
      >
        <Copy :size="14" />复制此配置
      </button>
    </template>

    <template #default>
      <!-- Visual Editor -->
      <div v-show="!isCodeMode" class="flex-1 overflow-auto">
            <div class="p-5 sm:p-6 space-y-6">
              <!-- Profile name -->
              <div class="border-b border-[#38383a] pb-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div class="space-y-2">
                    <label class="text-sm font-medium text-[#86868b] block">生成产物文件名 (Profile Name)</label>
                    <div class="flex items-center bg-[#1c1c1e]/80 border border-[#38383a] rounded-xl px-4 py-2 w-full focus-within:border-[#F596AA] focus-within:ring-4 focus-within:ring-[#F596AA]/20 transition-all duration-200">
                      <input v-model="profile.name" class="bg-transparent text-[#f5f5f7] outline-none text-xl font-bold w-full" placeholder="例如: la" />
                      <span class="text-[#86868b] font-mono text-lg ml-2 select-none">.json</span>
                    </div>
                  </div>
                  <div class="space-y-2">
                    <label class="text-sm font-medium text-[#86868b] block">备注</label>
                    <AppleInput :modelValue="profile.note ?? ''" @update:modelValue="profile.note = $event" placeholder="例如: 洛杉矶节点" />
                  </div>
                </div>
              </div>

              <!-- Template URL and file paths -->
              <div class="space-y-6">
                <div class="space-y-2">
                  <label class="text-sm font-medium text-[#86868b]">配置模板</label>
                  <AppleSelect
                    v-if="!isCustomTemplate"
                    :modelValue="profile.templateUrl"
                    @update:modelValue="onTemplateSelect"
                    :options="templateOptions"
                    placeholder="选择一个模板..."
                  />
                  <div v-else class="flex gap-2 items-center">
                    <AppleInput v-model="profile.templateUrl" placeholder="https://..." class="flex-1" />
                    <button @click="cancelCustomTemplate" title="删除自定义模板并返回选择" class="w-10 h-10 flex items-center justify-center rounded-xl bg-[#ff6961]/10 text-[#ff6961] hover:bg-[#ff6961]/20 transition shrink-0 cursor-pointer">
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div class="grid grid-cols-1 gap-6">
                  <div class="space-y-2">
                    <label class="text-sm font-medium text-[#86868b]">节点配置</label>
                    <AppleSelect
                      v-model="profile.nodesPath"
                      :options="nodeOptions"
                      placeholder="选择一个节点文件..."
                    />
                  </div>
                </div>
              </div>

        <!-- Inbound Rules -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium text-[#f5f5f7] flex items-center gap-2"><ArrowDownToLine :size="18" class="text-[#F596AA]" /> 入站节点插入 (Inbounds)</h3>
            <button @click="addInboundRule" class="flex items-center gap-1 text-sm text-[#F596AA] hover:text-[#f5f5f7] transition-colors">
              <Plus :size="14" /> 插入入站
            </button>
          </div>
          
          <div v-if="!profile.inboundRules || profile.inboundRules.length === 0" class="text-sm text-[#86868b] italic py-4 text-center border border-dashed border-[#38383a] rounded-xl bg-[#2c2c2e]/30">
            无需插入额外入站节点。
          </div>

          <div v-else class="space-y-4">
            <div v-for="(rule, iIndex) in profile.inboundRules" :key="'in_'+iIndex" class="bg-[#2c2c2e]/40 border border-[#38383a] rounded-xl p-4 space-y-4">
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3 flex-1">
                  <span class="text-sm font-medium text-[#f5f5f7] shrink-0">插入到模板位置:</span>
                  <AppleSelect
                    v-model="rule.tag"
                    :options="templateInboundOptions"
                    placeholder="选择模板中的 Inbound Tag..."
                    class="flex-1"
                  />
                </div>
                <button @click="removeInboundRule(iIndex)" class="p-2 text-[#86868b] hover:text-[#ff6961] hover:bg-[#ff6961]/10 rounded-full transition-colors">
                  <Trash2 :size="16" />
                </button>
              </div>
              
              <div class="space-y-2 pl-4 border-l-2 border-[#38383a]">
                <div v-for="(filter, fIndex) in rule.filters" :key="'f_'+fIndex" class="flex items-center gap-2">
                  <AppleSelect
                    v-model="filter.action"
                    :options="[{label:'包含', value:'include'}, {label:'排除', value:'exclude'}]"
                    class="w-24 shrink-0"
                  />
                  <AppleInput v-model="filter.keyword" placeholder="关键词，多个用逗号隔开" class="flex-1" />
                  <button @click="removeInboundFilter(iIndex, fIndex)" class="p-1.5 text-[#86868b] hover:text-[#ff6961] transition-colors rounded-full">
                    <X :size="14" />
                  </button>
                </div>
                <button @click="addInboundFilter(iIndex)" class="text-xs font-medium text-[#F596AA] hover:text-[#f5f5f7] flex items-center gap-1 mt-2">
                  <Plus :size="12" /> 添加过滤条件
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Outbound Rules -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium text-[#f5f5f7] flex items-center gap-2"><ArrowUpFromLine :size="18" class="text-[#F596AA]" /> 出站节点插入 (Outbounds)</h3>
            <button @click="addRule" class="flex items-center gap-1 text-sm text-[#F596AA] hover:text-[#f5f5f7] transition-colors">
              <Plus :size="14" /> 插入出站
            </button>
          </div>

          <div v-if="!profile.rules || profile.rules.length === 0" class="text-sm text-[#86868b] italic py-4 text-center border border-dashed border-[#38383a] rounded-xl bg-[#2c2c2e]/30">
            无需插入额外出站节点。
          </div>

          <div v-else class="space-y-4">
            <div v-for="(rule, rIndex) in profile.rules" :key="rIndex" class="bg-[#2c2c2e]/40 border border-[#38383a] rounded-xl p-4 space-y-4">
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3 flex-1">
                  <span class="text-sm font-medium text-[#f5f5f7] shrink-0">插入到模板位置:</span>
                  <AppleSelect
                    v-model="rule.group"
                    :options="templateOutboundOptions"
                    placeholder="选择模板中的 Outbound Tag..."
                    class="flex-1"
                  />
                </div>
                <button @click="removeRule(rIndex)" class="p-2 text-[#86868b] hover:text-[#ff6961] hover:bg-[#ff6961]/10 rounded-full transition-colors">
                  <Trash2 :size="16" />
                </button>
              </div>
              
              <div class="space-y-2 pl-4 border-l-2 border-[#38383a]">
                <div v-for="(filter, fIndex) in rule.filters" :key="fIndex" class="flex items-center gap-2">
                  <AppleSelect
                    v-model="filter.action"
                    :options="[{label:'包含', value:'include'}, {label:'排除', value:'exclude'}]"
                    class="w-24 shrink-0"
                  />
                  <AppleInput v-model="filter.keyword" placeholder="关键词，多个用逗号隔开" class="flex-1" />
                  <button @click="removeFilter(rIndex, fIndex)" class="p-1.5 text-[#86868b] hover:text-[#ff6961] transition-colors rounded-full">
                    <X :size="14" />
                  </button>
                </div>
                <button @click="addFilter(rIndex)" class="text-xs font-medium text-[#F596AA] hover:text-[#f5f5f7] flex items-center gap-1 mt-2">
                  <Plus :size="12" /> 添加过滤条件
                </button>
              </div>
            </div>
          </div>
        </div>
            </div>
          </div>
      <!-- Code Preview -->
      <div v-show="isCodeMode" class="flex-1 overflow-auto flex flex-col bg-[#121212]">
        <div v-if="previewLoading" class="flex-1 flex flex-col items-center justify-center">
          <Loader2 class="w-8 h-8 text-[#F596AA] animate-spin mb-4" />
          <span class="text-[#86868b]">构建配置中...</span>
        </div>
        <div v-else-if="previewError" class="flex-1 p-6 text-[#ff6961]">
          <h3 class="font-bold mb-2">构建失败:</h3>
          <pre class="text-sm whitespace-pre-wrap">{{ previewError }}</pre>
        </div>
        <pre v-else class="flex-1 p-6 text-[#a1a1aa] font-mono text-sm leading-relaxed overflow-auto selection:bg-[#F596AA]/30 selection:text-[#f5f5f7]">{{ previewContent }}</pre>
      </div>
    </template>
  </EditorModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { Trash2, Copy, X, Loader2, Code, Plus, ArrowDownToLine, ArrowUpFromLine } from 'lucide-vue-next';
import AppleInput from './AppleInput.vue';
import AppleSelect from './AppleSelect.vue';
import FileCard from './FileCard.vue';
import EditorModal from './EditorModal.vue';
import type { Profile } from '../types';

const props = defineProps<{
  profile: Profile;
  index: number;
  availableNodes?: string[];
  availableTemplates?: string[];
  copyStatus: boolean;
  expanded?: boolean;
}>();

const emit = defineEmits<{
  preview: [name: string];
  copyLink: [name: string, index: number];
  remove: [index: number];
  duplicate: [profile: Profile];
  save: [name: string];
  'update:expanded': [value: boolean];
}>();

const isOpen = computed({
  get: () => props.expanded ?? false,
  set: (v) => emit('update:expanded', v),
});


const inboundCount = computed(() => props.profile.inboundRules?.length || 0);
const outboundCount = computed(() => props.profile.rules?.length || 0);

const cardMenuItems = [
  { label: '复制配置', action: 'duplicate', icon: Copy },
  { label: '删除配置', action: 'remove', icon: Trash2, danger: true },
];

const originalProfileStr = ref(JSON.stringify(props.profile));
const isLocalDirty = computed(() => JSON.stringify(props.profile) !== originalProfileStr.value);

function handleCardAction(action: string) {
  if (action === 'duplicate') emit('duplicate', props.profile);
  if (action === 'remove') emit('remove', props.index);
}

const isCodeMode = ref(false);
const previewContent = ref('');
const previewLoading = ref(false);
const previewError = ref('');

async function toggleCodeMode() {
  isCodeMode.value = !isCodeMode.value;
  if (isCodeMode.value) {
    previewLoading.value = true;
    previewError.value = '';
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent('sing-sub/profiles/' + props.profile.name + '.json')}`);
      if (!res.ok) throw new Error('Preview not found');
      const data = await res.json();
      previewContent.value = data.content;
    } catch (e: any) {
      previewError.value = 'Failed to load preview: ' + e.message;
    } finally {
      previewLoading.value = false;
    }
  }
}

const templateInboundOptions = ref<{label: string, value: string}[]>([]);
const templateOutboundOptions = ref<{label: string, value: string}[]>([]);

watch(() => props.profile.templateUrl, async (url) => {
  if (url) {
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        const content = JSON.parse(data.content);
        if (content.inbounds) {
          templateInboundOptions.value = content.inbounds
            .filter((i: any) => i.tag)
            .map((i: any) => ({ label: i.tag, value: i.tag }));
        }
        if (content.outbounds) {
          templateOutboundOptions.value = content.outbounds
            .filter((o: any) => o.tag)
            .map((o: any) => ({ label: o.tag, value: o.tag }));
        }
      }
    } catch (e) {
      console.warn('Failed to fetch template tags', e);
    }
  }
}, { immediate: true });

function addInboundRule() {
  if (!props.profile.inboundRules) props.profile.inboundRules = [];
  props.profile.inboundRules.push({ tag: '', filters: [{ action: 'include', keyword: '' }] });
}

function removeInboundRule(index: number) {
  props.profile.inboundRules.splice(index, 1);
}

function addInboundFilter(ruleIndex: number) {
  props.profile.inboundRules[ruleIndex].filters.push({ action: 'include', keyword: '' });
}

function removeInboundFilter(ruleIndex: number, filterIndex: number) {
  props.profile.inboundRules[ruleIndex].filters.splice(filterIndex, 1);
}

function addRule() {
  if (!props.profile.rules) props.profile.rules = [];
  props.profile.rules.push({ group: '', filters: [{ action: 'include', keyword: '' }] });
}

function removeRule(index: number) {
  props.profile.rules.splice(index, 1);
}

function addFilter(ruleIndex: number) {
  props.profile.rules[ruleIndex].filters.push({ action: 'include', keyword: '' });
}

function removeFilter(ruleIndex: number, filterIndex: number) {
  props.profile.rules[ruleIndex].filters.splice(filterIndex, 1);
}

function extractFilename(path: string) {
  return path.split('/').pop() || path;
}

const nodeOptions = computed(() => {
  return (props.availableNodes || []).map(p => ({ label: extractFilename(p), value: p }));
});

const isCustomTemplate = ref(false);

watch(() => props.profile.templateUrl, (newVal) => {
  if (newVal && props.availableTemplates && !props.availableTemplates.includes(newVal)) {
    isCustomTemplate.value = true;
  }
}, { immediate: true });

const templateOptions = computed(() => {
  const opts = (props.availableTemplates || []).map(p => ({ label: extractFilename(p), value: p }));
  opts.push({ label: '自定义 URL...', value: '__custom__' });
  return opts;
});

function onTemplateSelect(val: string) {
  if (val === '__custom__') {
    isCustomTemplate.value = true;
    props.profile.templateUrl = '';
  } else {
    isCustomTemplate.value = false;
    props.profile.templateUrl = val;
  }
}

function cancelCustomTemplate() {
  isCustomTemplate.value = false;
  props.profile.templateUrl = (props.availableTemplates && props.availableTemplates.length > 0) ? props.availableTemplates[0] : '';
}

const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);

function openModal() {
  if (menuOpen.value) return;
  isOpen.value = true;
}

function handleCardClick() {
  if (menuOpen.value) return;
  emit('preview', props.profile.name);
}

function closeModal() {
  if (isLocalDirty.value) {
    if (!confirm('有未保存的更改，确定关闭吗？')) return;
  }
  isOpen.value = false;
}

function handleDuplicate() {
  isOpen.value = false;
  emit('duplicate', props.profile);
}

function handleSave() {
  emit('save', props.profile.name);
  originalProfileStr.value = JSON.stringify(props.profile);
}

function onDocumentClick(e: MouseEvent) {
  if (!menuRef.value) return;
  if (!menuRef.value.contains(e.target as Node)) menuOpen.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (menuOpen.value) menuOpen.value = false;
    else if (isOpen.value) closeModal();
  }
}

watch(menuOpen, (open) => {
  if (open) document.addEventListener('click', onDocumentClick);
  else document.removeEventListener('click', onDocumentClick);
});

watch(isOpen, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);
  } else {
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
  }
}, { immediate: true });

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});
</script>

<style scoped>
.card {
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1),
              border-color 200ms ease,
              box-shadow 200ms ease;
  will-change: transform;
  -webkit-tap-highlight-color: transparent;
}

@media (hover: hover) {
  .card:hover {
    transform: translateY(-2px);
    border-color: rgba(245, 150, 170, 0.3);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(245, 150, 170, 0.08);
  }

  .card:hover .card-title {
    color: #F596AA;
  }
}

.card:active {
  transform: scale(0.99);
  transition-duration: 80ms;
}

.card-title {
  transition: color 200ms ease;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 220ms ease;
}
.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease;
  will-change: transform, opacity;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  transform: scale(0.7);
  opacity: 0;
}

@media (max-width: 767px) {
  .modal-enter-active .modal-panel,
  .modal-leave-active .modal-panel {
    transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease;
  }
  .modal-enter-from .modal-panel,
  .modal-leave-to .modal-panel {
    transform: translateY(100%);
    opacity: 1;
  }
  .modal-panel {
    transform-origin: 50% 50% !important;
  }
}

.menu-enter-active,
.menu-leave-active {
  transition: opacity 150ms ease, transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .card:hover,
  .card:active {
    transform: none !important;
  }
  .modal-enter-from .modal-panel,
  .modal-leave-to .modal-panel {
    transform: none !important;
  }
}

.modal-save-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 500;
  color: #86868b;
  background: rgba(44, 44, 46, 0.6);
  border: 1px solid rgba(56, 56, 58, 0.8);
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, transform 0.15s ease;
}

.modal-save-btn:hover:not(:disabled) {
  color: #f5f5f7;
  border-color: #86868b;
}

.modal-save-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.modal-save-btn:disabled {
  cursor: default;
  opacity: 0.7;
}

.modal-save-btn.modal-save-dirty {
  background: #F596AA;
  border-color: #F596AA;
  color: #1a1a1c;
  box-shadow: 0 0 0 0 rgba(245, 150, 170, 0.45);
  animation: modal-save-pulse 2.2s ease-in-out infinite;
}

.modal-save-btn.modal-save-dirty:hover {
  background: #f7a8ba;
  border-color: #f7a8ba;
  color: #1a1a1c;
}

@keyframes modal-save-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 150, 170, 0.45); }
  50% { box-shadow: 0 0 0 6px rgba(245, 150, 170, 0); }
}

.modal-save-btn.modal-save-success {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
  color: #34d399;
}

.modal-save-btn.modal-save-error {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.modal-save-spin {
  animation: modal-save-spin-anim 1s linear infinite;
}

@keyframes modal-save-spin-anim {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
