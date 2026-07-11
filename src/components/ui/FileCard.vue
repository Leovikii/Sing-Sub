<template>
  <div
    :class="[
      'card card-container glass p-5 md:p-6 cursor-pointer select-none relative group border border-transparent hover:border-brand-pink/30 transition-colors duration-300',
      menuOpen ? 'z-50' : 'z-10 hover:z-20'
    ]"
    @click="$emit('click')"
  >
    <!-- Background highlight on hover -->
    <div class="absolute inset-0 rounded-xl bg-brand-pink/[0.03] shadow-[inset_0_0_20px_rgba(245,150,170,0.05)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

    <div class="card-layout relative flex items-center justify-between h-full gap-4 md:gap-6">
      
      <!-- 左侧/上部容器：纯粹的信息展示区 -->
      <div class="card-info flex flex-col min-w-0 flex-1 space-y-2.5 md:space-y-3.5">
        <div class="flex items-center gap-2 min-w-0">
          <span class="card-title text-lg font-semibold text-text-primary truncate group-hover:text-brand-pink transition-colors">{{ title }}</span>
          <span class="text-text-muted font-mono text-sm select-none hidden sm:inline">.json</span>
        </div>

        <div class="flex items-center gap-2">
          <span v-if="note" class="text-text-muted text-[11px] md:text-xs truncate">{{ note }}</span>
          <span v-else class="text-[#48484a] text-[11px] md:text-xs italic">无备注</span>

          <template v-if="updatedAt">
            <span class="text-[#48484a] text-[11px] md:text-xs">·</span>
            <span class="text-text-muted text-[11px] md:text-xs whitespace-nowrap">{{ formatDynamicTime(updatedAt) }}</span>
          </template>
        </div>
      </div>

      <!-- 右侧/下部容器：纯粹的操作区 -->
      <div class="card-actions flex items-center gap-2 shrink-0">
        <slot name="actions"></slot>
        <ToolbarButton
          @click.stop="$emit('edit')"
          :icon="Pencil"
          label="编辑"
          size="card"
          mobileLabel
        />

        <!-- ⋯ Menu -->
        <PopoverMenu 
          v-model:isOpen="menuOpen"
          wrapperClass="relative flex shrink-0"
          contentClass="right-0 bottom-full md:bottom-auto md:top-full mb-2 md:mb-0 md:mt-2 min-w-[120px] w-max p-1.5 rounded-xl bg-bg-elevated/95 backdrop-blur-xl border border-white/10 shadow-lg origin-bottom-right md:origin-top-right flex flex-col gap-0.5"
        >
          <template #trigger="{ toggle, isOpen }">
            <ToolbarButton
              @click.stop="toggle"
              :icon="MoreHorizontal"
              label="更多操作"
              :active="isOpen"
              size="card"
              iconOnly
            />
          </template>

          <template #content="{ close }">
            <button
              v-for="(item, idx) in menuItems"
              :key="idx"
              @click="handleMenuAction(item.action); close()"
              :class="['w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer rounded-xl', item.danger ? 'text-danger hover:bg-danger/15' : 'text-text-primary hover:bg-white/10']"
            >
              <component :is="item.icon" :size="14" /> 
              <span class="whitespace-nowrap">{{ item.label }}</span>
            </button>
          </template>
        </PopoverMenu>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Pencil, MoreHorizontal } from 'lucide-vue-next';
import PopoverMenu from './PopoverMenu.vue';
import ToolbarButton from './ToolbarButton.vue';

interface MenuItem {
  label: string;
  action: string;
  icon: any;
  danger?: boolean;
}

const props = defineProps<{
  title: string;
  note?: string;
  updatedAt?: number;
  menuItems: MenuItem[];
}>();

const emit = defineEmits<{
  click: [];
  edit: [];
  action: [actionName: string];
}>();

const menuOpen = ref(false);

function handleMenuAction(action: string) {
  emit('action', action);
}

function formatDynamicTime(ts: number): string {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 7) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  if (days >= 1) return `${days}天前`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours >= 1) return `${hours}小时前`;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes >= 1) return `${minutes}分钟前`;
  return '刚才更新';
}
</script>

<style scoped>
.card-container {
  container-type: inline-size;
}

@container (max-width: 30rem) {
  :deep(.toolbar-button) {
    width: 2.25rem;
    padding-inline: 0;
  }

  :deep(.toolbar-button-label) {
    display: none;
  }

  :deep(.toolbar-button-tooltip) {
    display: block;
  }
}

@container (max-width: 22rem) {
  .card-layout {
    flex-direction: column;
    align-items: stretch;
  }

  .card-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
