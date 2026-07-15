<template>
  <article
    class="card-container group relative cursor-pointer select-none rounded-lg border border-border-base bg-bg-surface p-5 shadow-sm transition-[border-color,box-shadow] hover:border-primary-300 hover:shadow-md md:p-6"
    @click="$emit('click')"
  >
    <div class="card-layout flex h-full items-center justify-between gap-4 md:gap-6">
      <div class="min-w-0 flex-1 space-y-2">
        <div class="truncate text-base font-semibold text-text-primary transition-colors group-hover:text-primary-600">
          {{ title }}
        </div>
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <span class="min-w-0 truncate">{{ note || t('common.noNote') }}</span>
          <template v-if="updatedAt">
            <span aria-hidden="true">·</span>
            <time :datetime="new Date(updatedAt).toISOString()">{{ formatDynamicTime(updatedAt) }}</time>
          </template>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <slot name="actions" />
        <Button
          severity="secondary"
          text
          rounded
          :aria-label="t('common.edit')"
          v-tooltip.top="t('common.edit')"
          @click.stop="$emit('edit')"
        >
          <Pencil :size="18" aria-hidden="true" />
        </Button>
        <Button
          v-if="menuItems.length"
          severity="secondary"
          text
          rounded
          :aria-label="moreLabel"
          v-tooltip.top="moreLabel"
          @click.stop="toggleMenu"
        >
          <MoreHorizontal :size="18" aria-hidden="true" />
        </Button>
        <Menu ref="menu" :model="menuModel" popup @show="menuOpen = true" @hide="menuOpen = false">
          <template #item="{ item, props }">
            <a v-bind="props.action" class="flex items-center gap-2.5" :class="item.danger ? 'text-red-600' : ''">
              <component :is="item.iconComponent" :size="16" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </a>
          </template>
        </Menu>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import { MoreHorizontal, Pencil } from 'lucide-vue-next';

interface CardMenuItem {
  label: string;
  action: string;
  icon: Component;
  danger?: boolean;
}

const props = defineProps<{
  title: string;
  note?: string;
  updatedAt?: number;
  menuItems: CardMenuItem[];
}>();

const emit = defineEmits<{
  click: [];
  edit: [];
  action: [actionName: string];
}>();

const { t, locale } = useI18n();
const menu = ref<InstanceType<typeof Menu> | null>(null);
const menuOpen = ref(false);
const moreLabel = computed(() => t('common.moreActions'));
const menuModel = computed(() => props.menuItems.map(item => ({
  label: item.label,
  iconComponent: item.icon,
  danger: item.danger,
  command: () => emit('action', item.action),
})));

function toggleMenu(event: Event) {
  menu.value?.toggle(event);
}

function formatDynamicTime(timestamp: number): string {
  const formatter = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  const elapsedMinutes = Math.round((timestamp - Date.now()) / 60_000);
  if (Math.abs(elapsedMinutes) < 60) return formatter.format(elapsedMinutes, 'minute');
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (Math.abs(elapsedHours) < 24) return formatter.format(elapsedHours, 'hour');
  const elapsedDays = Math.round(elapsedHours / 24);
  if (Math.abs(elapsedDays) <= 7) return formatter.format(elapsedDays, 'day');
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}
</script>

<style scoped>
.card-container {
  container-type: inline-size;
}

@container (max-width: 18rem) {
  .card-layout {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
