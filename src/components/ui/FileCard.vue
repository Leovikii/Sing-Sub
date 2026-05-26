<template>
  <div
    :class="[
      'card glass p-4 md:p-5 cursor-pointer select-none relative group border border-transparent hover:border-[#F596AA]/30 transition-all duration-300',
      menuOpen ? 'z-50' : 'z-10 hover:z-20'
    ]"
    @click="$emit('click')"
  >
    <!-- Background highlight on hover -->
    <div class="absolute inset-0 rounded-[20px] bg-[#F596AA]/[0.03] shadow-[inset_0_0_20px_rgba(245,150,170,0.05)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

    <div class="relative flex flex-col md:flex-row md:items-center justify-between h-full gap-3 md:gap-4">
      
      <!-- 左侧/上部容器：纯粹的信息展示区 -->
      <div class="flex flex-col min-w-0 flex-1 space-y-1.5 md:space-y-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="card-title text-lg font-semibold text-[#f5f5f7] truncate group-hover:text-[#F596AA] transition-colors">{{ title }}</span>
          <span class="text-[#86868b] font-mono text-sm select-none hidden sm:inline">.json</span>
          
          <div class="flex items-center gap-1.5 md:gap-2 ml-auto md:ml-2 shrink-0">
            <span class="bg-[#2c2c2e] text-[#86868b] text-[11px] md:text-xs rounded-full px-2 py-0.5 md:px-2.5 md:py-1 flex items-center gap-1 border border-white/5"><ArrowDown :size="12"/> {{ inboundCount }}</span>
            <span class="bg-[#2c2c2e] text-[#86868b] text-[11px] md:text-xs rounded-full px-2 py-0.5 md:px-2.5 md:py-1 flex items-center gap-1 border border-white/5"><ArrowUp :size="12"/> {{ outboundCount }}</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span v-if="note" class="text-[#86868b] text-[11px] md:text-xs truncate">{{ note }}</span>
          <span v-else class="text-[#48484a] text-[11px] md:text-xs italic">无备注</span>
          
          <template v-if="updatedAt">
            <span class="text-[#48484a] text-[11px] md:text-xs">·</span>
            <span class="text-[#86868b] text-[11px] md:text-xs whitespace-nowrap">{{ formatDynamicTime(updatedAt) }}</span>
          </template>
        </div>
      </div>

      <!-- 分割线 (仅移动端显示) -->
      <div class="w-full h-px bg-white/5 md:hidden mt-1 mb-1"></div>

      <!-- 右侧/下部容器：纯粹的操作区 -->
      <div class="flex items-center gap-2 shrink-0 w-full md:w-auto">
        <slot name="actions"></slot>
        <button
          @click.stop="$emit('edit')"
          class="flex-1 md:flex-none flex items-center justify-center gap-1.5 h-10 md:w-auto md:h-auto md:px-3 md:py-2 rounded-xl md:rounded-full text-[13px] md:text-xs font-medium text-[#86868b] hover:text-[#f5f5f7] bg-[#2c2c2e] border border-[#38383a] hover:border-[#F596AA] transition-colors cursor-pointer"
          title="编辑"
        >
          <Pencil :size="16" /><span class="ml-1">编辑</span>
        </button>

        <!-- ⋯ Menu -->
        <PopoverMenu 
          v-model:isOpen="menuOpen"
          wrapperClass="flex-1 md:flex-none md:ml-1" 
          contentClass="right-0 bottom-full md:bottom-auto md:top-full mb-2 md:mb-0 md:mt-2 min-w-[120px] w-max p-1.5 rounded-2xl bg-[#2c2c2e]/90 backdrop-blur-xl border border-white/5 shadow-2xl origin-bottom-right md:origin-top-right flex flex-col gap-0.5"
        >
          <template #trigger="{ toggle, isOpen }">
            <button
              @click.stop="toggle"
              :class="['w-full h-10 md:w-auto md:h-auto md:px-3 md:py-2 flex items-center justify-center gap-1.5 rounded-xl md:rounded-full bg-[#2c2c2e] transition-colors cursor-pointer border border-[#38383a] shadow-sm hover:text-[#f5f5f7] focus:outline-none', isOpen ? 'border-[#F596AA] text-[#F596AA] shadow-[#F596AA]/20' : 'text-[#86868b]']"
              title="更多操作"
            >
              <MoreHorizontal :size="18" />
              <span class="ml-1 text-[13px] font-medium">更多</span>
            </button>
          </template>

          <template #content="{ close }">
            <button
              v-for="(item, idx) in menuItems"
              :key="idx"
              @click="handleMenuAction(item.action); close()"
              :class="['w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-all cursor-pointer rounded-xl', item.danger ? 'text-[#ff6961] hover:bg-[#ff6961]/15' : 'text-[#f5f5f7] hover:bg-white/10']"
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
import { Pencil, MoreHorizontal, ArrowDown, ArrowUp } from 'lucide-vue-next';
import PopoverMenu from './PopoverMenu.vue';

interface MenuItem {
  label: string;
  action: string;
  icon: any;
  danger?: boolean;
}

const props = defineProps<{
  title: string;
  note?: string;
  inboundCount: number;
  outboundCount: number;
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
