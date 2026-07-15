<template>
  <span
    class="inline-flex h-7 items-stretch overflow-hidden whitespace-nowrap rounded-md border bg-white/[0.025] shadow-sm"
    :class="tierInfo.border"
    :title="`${node.type.toUpperCase()} · ${tierInfo.label}`"
    :aria-label="`${node.type}，${tierInfo.label}，${node.tag}`"
  >
    <span
      class="flex h-full items-center justify-center border-r border-white/10 px-2 text-[10px] font-semibold uppercase"
      :class="[tierInfo.bg, tierInfo.text]"
    >
      {{ node.type }}
    </span>
    <span class="flex h-full items-center justify-center px-2 font-mono text-xs text-text-primary">
      {{ node.tag }}
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  node: { type: string; tag: string; }
}>();

type ProtocolTier = 'preferred' | 'recommended' | 'acceptable' | 'standard' | 'discouraged' | 'structural' | 'unknown';

const protocolTiers: Record<string, ProtocolTier> = {
  vless: 'preferred',
  anytls: 'recommended',
  naive: 'recommended',
  naiveproxy: 'recommended',
  hysteria: 'acceptable',
  hysteria2: 'acceptable',
  tuic: 'acceptable',
  wireguard: 'acceptable',
  wg: 'acceptable',
  http: 'standard',
  socks: 'standard',
  socks5: 'standard',
  mixed: 'standard',
  trojan: 'discouraged',
  shadowsocks: 'discouraged',
  ss: 'discouraged',
  vmess: 'discouraged',
  direct: 'structural',
  block: 'structural',
  dns: 'structural',
  selector: 'structural',
  urltest: 'structural',
};

const tierStyles: Record<ProtocolTier, { labelKey: string; bg: string; text: string; border: string }> = {
  preferred: {
    labelKey: 'profiles.tierPreferred',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  recommended: {
    labelKey: 'profiles.tierRecommended',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/20',
  },
  acceptable: {
    labelKey: 'profiles.tierAcceptable',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
  },
  standard: {
    labelKey: 'profiles.tierStandard',
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-300',
    border: 'border-zinc-500/20',
  },
  discouraged: {
    labelKey: 'profiles.tierDiscouraged',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  structural: {
    labelKey: 'profiles.tierStructural',
    bg: 'bg-violet-500/10',
    text: 'text-violet-300',
    border: 'border-violet-500/20',
  },
  unknown: {
    labelKey: 'profiles.tierUnknown',
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    border: 'border-zinc-500/20',
  },
};

const tierInfo = computed(() => {
  const type = props.node.type?.toLowerCase() || '';
  const style = tierStyles[protocolTiers[type] || 'unknown'];
  return { ...style, label: t(style.labelKey) };
});
</script>
