<template>
  <div class="settings-list">
    <div class="settings-row items-start">
      <div>
        <div class="settings-label">{{ t('subscription.token') }}</div>
        <div class="settings-hint">{{ t('subscription.tokenHint') }}</div>
      </div>
      <div class="flex w-full max-w-xl gap-2 sm:w-auto">
        <InputText :model-value="token" readonly class="min-w-0 flex-1 font-mono text-sm sm:w-80" />
        <Button
          severity="secondary"
          outlined
          :aria-label="t('common.copy')"
          v-tooltip.top="t('common.copy')"
          @click="copyToken"
        >
          <Check v-if="copied" :size="18" aria-hidden="true" />
          <Copy v-else :size="18" aria-hidden="true" />
        </Button>
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-label">{{ t('subscription.rotate') }}</div>
        <div class="settings-hint">{{ t('subscription.tokenHint') }}</div>
      </div>
      <Button severity="danger" outlined :loading="loading" @click="confirmRotate">
        <RefreshCw :size="17" aria-hidden="true" />
        <span>{{ t('subscription.rotate') }}</span>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { Check, Copy, RefreshCw } from 'lucide-vue-next';

const props = defineProps<{
  token: string;
  loading: boolean;
}>();

const emit = defineEmits<{
  rotate: [];
}>();

const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const copied = ref(false);

async function copyToken() {
  await navigator.clipboard.writeText(props.token);
  copied.value = true;
  toast.add({ severity: 'success', summary: t('common.copied'), life: 2000 });
  window.setTimeout(() => { copied.value = false; }, 2000);
}

function confirmRotate() {
  confirm.require({
    header: t('subscription.rotate'),
    message: t('subscription.rotateConfirm'),
    rejectLabel: t('common.cancel'),
    acceptLabel: t('common.confirm'),
    acceptClass: 'p-button-danger',
    accept: () => emit('rotate'),
  });
}
</script>
