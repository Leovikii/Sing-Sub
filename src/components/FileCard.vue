<template>
  <div
    class="card glass p-5 cursor-pointer select-none space-y-2 relative overflow-hidden group border border-transparent hover:border-[#F596AA]/30 transition-all duration-300"
    @click="$emit('click')"
  >
    <!-- Background highlight on hover -->
    <div class="absolute inset-0 bg-gradient-to-br from-[#F596AA]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

    <div class="relative z-10 flex items-center gap-4">
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <span class="card-title text-lg font-semibold text-[#f5f5f7] truncate group-hover:text-[#F596AA] transition-colors">{{ title }}</span>
        <span class="text-[#86868b] font-mono text-sm select-none">.json</span>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          @click.stop="$emit('edit')"
          class="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#86868b] hover:text-[#f5f5f7] bg-[#2c2c2e] border border-[#38383a] hover:border-[#F596AA] transition-colors cursor-pointer"
        >
          <Pencil :size="14" />编辑
        </button>

        <!-- ⋯ Menu -->
        <div class="relative ml-1" ref="menuRef">
          <button
            @click.stop="menuOpen = !menuOpen"
            :class="['w-8 h-8 flex items-center justify-center rounded-full bg-[#2c2c2e] transition-colors cursor-pointer border border-[#38383a] shadow-sm hover:text-[#f5f5f7] focus:outline-none', menuOpen ? 'border-[#F596AA] text-[#F596AA] shadow-[#F596AA]/20' : 'text-[#86868b]']"
            title="更多操作"
          >
            <MoreHorizontal :size="16" />
          </button>
          <Transition name="menu">
            <div
              v-if="menuOpen"
              @click.stop
              class="absolute right-0 top-full mt-2 w-40 rounded-xl bg-[#1c1c1e] border border-[#38383a] shadow-2xl overflow-hidden z-[80] transform origin-top-right"
            >
              <button
                v-for="(item, idx) in menuItems"
                :key="idx"
                @click="handleMenuAction(item.action)"
                :class="['w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors cursor-pointer', item.danger ? 'text-[#ff6961] hover:bg-[#ff6961]/10' : 'text-[#f5f5f7] hover:bg-[#2c2c2e]']"
              >
                <component :is="item.icon" :size="14" /> {{ item.label }}
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <div class="relative z-10 flex items-center gap-2">
      <span v-if="note" class="text-[#86868b] text-xs truncate">{{ note }}</span>
      <span v-else class="text-[#48484a] text-xs italic">无备注</span>
      <div class="flex-1"></div>
      <span class="bg-[#2c2c2e] text-[#86868b] text-xs rounded-full px-2.5 py-1 flex items-center gap-1 border border-white/5"><ArrowDownToLine :size="12"/> {{ inboundCount }}</span>
      <span class="bg-[#2c2c2e] text-[#86868b] text-xs rounded-full px-2.5 py-1 flex items-center gap-1 border border-white/5"><ArrowUpFromLine :size="12"/> {{ outboundCount }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Pencil, MoreHorizontal, ArrowDownToLine, ArrowUpFromLine } from 'lucide-vue-next';

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
  menuItems: MenuItem[];
}>();

const emit = defineEmits<{
  click: [];
  edit: [];
  action: [actionName: string];
}>();

const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);

function handleMenuAction(action: string) {
  emit('action', action);
  menuOpen.value = false;
}

function onClickOutside(e: MouseEvent) {
  if (menuOpen.value && menuRef.value && !menuRef.value.contains(e.target as Node)) {
    menuOpen.value = false;
  }
}

onMounted(() => document.addEventListener('click', onClickOutside));
onUnmounted(() => document.removeEventListener('click', onClickOutside));
</script>

<style scoped>
.menu-enter-active,
.menu-leave-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-5px);
}
</style>
