<template>
  <span
    class="inline-flex items-stretch rounded-full whitespace-nowrap overflow-hidden shadow-sm border"
    :class="colorInfo.border"
  >
    <span 
      class="px-1.5 py-0.5 flex items-center justify-center text-[10px] font-bold uppercase text-white"
      :class="colorInfo.bg"
    >
      {{ node.type }}
    </span>
    <span 
      class="px-2 py-0.5 flex items-center justify-center text-xs font-medium"
      :class="[colorInfo.bgLight, colorInfo.text]"
    >
      {{ node.tag }}
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  node: { type: string; tag: string; }
}>();

const colorInfo = computed(() => {
  const type = props.node.type?.toLowerCase() || '';
  if (type === 'vless' || type === 'vmess') return { bg: 'bg-emerald-500', bgLight: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' };
  if (type === 'trojan') return { bg: 'bg-blue-500', bgLight: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
  if (type === 'shadowsocks' || type === 'ss') return { bg: 'bg-amber-500', bgLight: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' };
  if (type === 'anytls') return { bg: 'bg-purple-500', bgLight: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' };
  if (type === 'hysteria' || type === 'hysteria2') return { bg: 'bg-orange-500', bgLight: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' };
  if (type === 'wireguard' || type === 'wg') return { bg: 'bg-red-500', bgLight: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' };
  return { bg: 'bg-[#38383a]', bgLight: 'bg-[#F596AA]/10', text: 'text-[#F596AA]', border: 'border-[#F596AA]/20' };
});
</script>
