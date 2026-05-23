<template>
  <!-- Compact Card -->
  <div
    ref="cardRef"
    class="card glass p-5 cursor-pointer select-none space-y-2"
    @click="handleCardClick"
  >
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <span class="card-title text-lg font-semibold text-[#f5f5f7] truncate">{{ profile.name || 'untitled' }}</span>
        <span class="text-[#86868b] font-mono text-sm select-none">.json</span>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          @click.stop="openModal"
          class="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#86868b] hover:text-[#f5f5f7] bg-[#2c2c2e] border border-[#38383a] hover:border-[#86868b] transition-colors cursor-pointer"
        >
          <Pencil :size="14" />编辑
        </button>
        <button
          @click.stop="$emit('copyLink', profile.name, index)"
          class="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#86868b] hover:text-[#f5f5f7] bg-[#2c2c2e] border border-[#38383a] hover:border-[#86868b] transition-colors cursor-pointer"
        >
          <component :is="copyStatus ? Check : Link" :size="14" />{{ copyStatus ? '已复制' : '复制链接' }}
        </button>

        <!-- ⋯ Menu -->
        <div class="relative ml-1" ref="menuRef">
          <button
            @click.stop="menuOpen = !menuOpen"
            :class="['w-8 h-8 flex items-center justify-center rounded-full bg-[#2c2c2e] border transition-colors cursor-pointer', menuOpen ? 'border-[#F596AA] text-[#F596AA]' : 'border-[#38383a] text-[#86868b] hover:text-[#f5f5f7]']"
            title="更多操作"
          >
            <MoreHorizontal :size="16" />
          </button>
          <Transition name="menu">
            <div
              v-if="menuOpen"
              @click.stop
              class="absolute right-0 top-full mt-2 w-40 rounded-xl bg-[#1c1c1e] border border-[#38383a] shadow-2xl overflow-hidden z-30"
            >
              <button
                @click="handleDuplicate"
                class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#f5f5f7] hover:bg-[#2c2c2e] transition-colors cursor-pointer"
              >
                <Copy :size="14" class="text-[#86868b]" />复制配置
              </button>
              <div class="h-px bg-[#38383a]"></div>
              <button
                @click="handleRemove"
                class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#ff6961] hover:bg-[#ff6961]/10 transition-colors cursor-pointer"
              >
                <Trash2 :size="14" />移除
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <span v-if="profile.note" class="text-[#86868b] text-xs truncate">{{ profile.note }}</span>
      <span v-else class="text-[#48484a] text-xs italic">无备注</span>
      <div class="flex-1"></div>
      <span class="bg-[#2c2c2e] text-[#86868b] text-xs rounded-full px-2.5 py-1">入站 {{ inboundCount }}</span>
      <span class="bg-[#2c2c2e] text-[#86868b] text-xs rounded-full px-2.5 py-1">出站 {{ outboundCount }}</span>
    </div>

    <div class="flex md:hidden items-center gap-2 pt-1">
      <button
        @click.stop="openModal"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#86868b] hover:text-[#f5f5f7] bg-[#2c2c2e] border border-[#38383a] hover:border-[#86868b] transition-colors cursor-pointer"
      >
        <Pencil :size="14" />编辑
      </button>
      <button
        @click.stop="$emit('copyLink', profile.name, index)"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#86868b] hover:text-[#f5f5f7] bg-[#2c2c2e] border border-[#38383a] hover:border-[#86868b] transition-colors cursor-pointer"
      >
        <component :is="copyStatus ? Check : Link" :size="14" />{{ copyStatus ? '已复制' : '复制链接' }}
      </button>
    </div>
  </div>

  <!-- Edit Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-6 bg-[#121212]/90 backdrop-blur-lg"
        @click.self="closeModal"
      >
        <div
          ref="panelRef"
          class="modal-panel w-full md:max-w-3xl md:max-h-[88vh] max-h-[92vh] bg-[#1c1c1e] border border-[#38383a] md:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          <!-- Header -->
          <div class="flex items-center justify-between gap-3 p-4 border-b border-[#38383a] bg-[#0a0a0a]/40 shrink-0">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <span class="text-[#f5f5f7] font-semibold truncate">{{ profile.name || 'untitled' }}</span>
              <span class="text-[#86868b] font-mono text-sm select-none">.json</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button
                @click="handleDuplicate"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#86868b] hover:text-[#F596AA] bg-[#2c2c2e] border border-[#38383a] hover:border-[#F596AA]/40 transition-colors cursor-pointer"
                title="复制此配置"
              >
                <Copy :size="14" />复制此配置
              </button>
              <button
                @click="closeModal"
                class="w-8 h-8 flex items-center justify-center rounded-full text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#2c2c2e] transition-colors cursor-pointer"
                title="关闭"
              >
                <X :size="16" />
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-auto">
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

              <!-- Rules tabs -->
              <div class="border border-[#38383a] rounded-2xl overflow-hidden bg-[#1c1c1e]/50">
                <div class="flex border-b border-[#38383a] bg-[#121212]/50">
                  <button
                    @click="activeTab = 'inbound'"
                    :class="['flex-1 py-3 text-sm font-medium transition-colors outline-none cursor-pointer', activeTab === 'inbound' ? 'text-[#F596AA] bg-[#2c2c2e] border-b-2 border-[#F596AA]' : 'text-[#86868b] hover:text-[#f5f5f7] border-b-2 border-transparent']"
                  >入站节点规则筛选</button>
                  <button
                    @click="activeTab = 'outbound'"
                    :class="['flex-1 py-3 text-sm font-medium transition-colors outline-none cursor-pointer', activeTab === 'outbound' ? 'text-[#F596AA] bg-[#2c2c2e] border-b-2 border-[#F596AA]' : 'text-[#86868b] hover:text-[#f5f5f7] border-b-2 border-transparent']"
                  >出站节点分组映射</button>
                </div>

                <div class="p-4 sm:p-5">
                  <!-- Inbound rules -->
                  <div v-show="activeTab === 'inbound'" class="space-y-4">
                    <div v-for="(irule, irIndex) in profile.inboundRules" :key="irIndex" class="flex flex-col sm:flex-row gap-3 bg-[#2c2c2e] p-3 rounded-xl border border-[#38383a] shadow-sm">
                      <div class="flex flex-col sm:flex-row gap-3 flex-1">
                        <AppleInput v-model="irule.include" placeholder="包含关键字" class="flex-1" />
                        <AppleInput v-model="irule.exclude" placeholder="排除关键字" class="flex-1" />
                      </div>
                      <button @click="profile.inboundRules.splice(irIndex, 1)" class="w-10 h-10 flex items-center justify-center rounded-xl bg-[#ff6961]/10 text-[#ff6961] hover:bg-[#ff6961]/20 transition shrink-0 self-end sm:self-center cursor-pointer">
                        <Trash2 class="w-4 h-4" />
                      </button>
                    </div>
                    <AppleButton @click="profile.inboundRules.push({ include: '', exclude: '' })" variant="secondary" class="w-full !py-2 text-sm border border-dashed border-[#38383a] bg-transparent text-[#86868b] hover:text-[#f5f5f7] hover:border-[#86868b]">
                      + 添加入站筛选规则
                    </AppleButton>
                  </div>

                  <!-- Outbound rules -->
                  <div v-show="activeTab === 'outbound'" class="space-y-4">
                    <div v-for="(rule, rIndex) in profile.rules" :key="rIndex" class="flex flex-col sm:flex-row gap-3 bg-[#2c2c2e] p-3 rounded-xl border border-[#38383a] shadow-sm">
                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                        <AppleInput v-model="rule.group" placeholder="分组 Tag" />
                        <AppleInput v-model="rule.include" placeholder="包含关键字" />
                        <AppleInput v-model="rule.exclude" placeholder="排除关键字" />
                      </div>
                      <button @click="profile.rules.splice(rIndex, 1)" class="w-10 h-10 flex items-center justify-center rounded-xl bg-[#ff6961]/10 text-[#ff6961] hover:bg-[#ff6961]/20 transition shrink-0 self-end sm:self-center cursor-pointer">
                        <Trash2 class="w-4 h-4" />
                      </button>
                    </div>
                    <AppleButton @click="profile.rules.push({ group: '', include: '', exclude: '' })" variant="secondary" class="w-full !py-2 text-sm border border-dashed border-[#38383a] bg-transparent text-[#86868b] hover:text-[#f5f5f7] hover:border-[#86868b]">
                      + 添加出站分组规则
                    </AppleButton>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer (sticky save) -->
          <div class="flex items-center justify-end gap-3 p-4 border-t border-[#38383a] bg-[#0a0a0a]/40 shrink-0">
            <span v-if="isDirty && saveState === 'idle'" class="text-xs text-[#F596AA] mr-auto flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-[#F596AA] animate-pulse"></span>
              有未保存更改
            </span>
            <button
              @click="handleSave"
              :disabled="saveState !== 'idle'"
              :class="[
                'modal-save-btn',
                {
                  'modal-save-dirty': isDirty && saveState === 'idle',
                  'modal-save-success': saveState === 'success',
                  'modal-save-error': saveState === 'error',
                },
              ]"
            >
              <Loader2 v-if="saveState === 'saving'" :size="14" class="modal-save-spin" />
              <Check v-else-if="saveState === 'success'" :size="14" />
              <X v-else-if="saveState === 'error'" :size="14" />
              <Save v-else :size="14" />
              <span>{{ saveLabel }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { Pencil, Link, Check, Trash2, Copy, X, Save, Loader2 } from 'lucide-vue-next';
import AppleInput from './AppleInput.vue';
import AppleButton from './AppleButton.vue';
import AppleSelect from './AppleSelect.vue';
import type { Profile } from '../types';

const props = defineProps<{
  profile: Profile;
  index: number;
  availableNodes?: string[];
  availableTemplates?: string[];
  copyStatus: boolean;
  expanded?: boolean;
  saveState: 'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error';
  isDirty: boolean;
}>();

const emit = defineEmits<{
  preview: [name: string];
  copyLink: [name: string, index: number];
  remove: [index: number];
  duplicate: [index: number];
  save: [];
  'update:expanded': [value: boolean];
}>();

const isOpen = computed({
  get: () => props.expanded ?? false,
  set: (v) => emit('update:expanded', v),
});

const activeTab = ref<'inbound' | 'outbound'>('inbound');
const inboundCount = computed(() => props.profile.inboundRules.length);
const outboundCount = computed(() => props.profile.rules.length);

function extractFilename(path: string) {
  return path.split('/').pop() || path;
}

const nodeOptions = computed(() => {
  const opts = (props.availableNodes || []).map(p => ({ label: extractFilename(p), value: p }));
  if (props.profile.nodesPath && !opts.find(o => o.value === props.profile.nodesPath)) {
    opts.unshift({ label: extractFilename(props.profile.nodesPath), value: props.profile.nodesPath });
  }
  return opts;
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
const cardRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);

const saveLabel = computed(() => {
  switch (props.saveState) {
    case 'saving': return '保存中…';
    case 'success': return '已保存';
    case 'error': return '失败';
    default: return props.isDirty ? '保存全部' : '保存';
  }
});

function applyOrigin() {
  if (!cardRef.value || !panelRef.value) return;
  const cr = cardRef.value.getBoundingClientRect();
  const pr = panelRef.value.getBoundingClientRect();
  const ox = cr.left + cr.width / 2 - pr.left;
  const oy = cr.top + cr.height / 2 - pr.top;
  panelRef.value.style.transformOrigin = `${ox}px ${oy}px`;
}

function openModal() {
  if (menuOpen.value) return;
  isOpen.value = true;
}

function handleCardClick() {
  if (menuOpen.value) return;
  emit('preview', props.profile.name);
}

function closeModal() {
  applyOrigin();
  isOpen.value = false;
}

function handleDuplicate() {
  menuOpen.value = false;
  applyOrigin();
  isOpen.value = false;
  emit('duplicate', props.index);
}

function handleRemove() {
  menuOpen.value = false;
  emit('remove', props.index);
}

function handleSave() {
  if (props.saveState !== 'idle') return;
  emit('save');
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
    requestAnimationFrame(applyOrigin);
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
