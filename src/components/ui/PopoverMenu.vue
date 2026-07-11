<template>
  <div class="relative" ref="wrapperRef" :class="wrapperClass" @keydown.esc.stop="close">
    <!-- 触发器插槽 -->
    <slot name="trigger" :toggle="toggle" :isOpen="isOpenInternal"></slot>
    
    <!-- 弹出层插槽 -->
    <Transition name="menu">
      <div
        v-if="isOpenInternal"
        @click.stop
        :class="[
          'absolute z-[80] transform',
          contentClass
        ]"
      >
        <slot name="content" :close="close"></slot>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';

const props = defineProps<{
  isOpen?: boolean;
  wrapperClass?: string;
  contentClass?: string;
}>();

const emit = defineEmits<{
  (e: 'update:isOpen', value: boolean): void;
}>();

const isOpenInternal = ref(props.isOpen ?? false);
const wrapperRef = ref<HTMLElement | null>(null);

watch(() => props.isOpen, (newVal) => {
  if (newVal !== undefined && newVal !== isOpenInternal.value) {
    isOpenInternal.value = newVal;
  }
});

function toggle() {
  setOpen(!isOpenInternal.value);
}

function close() {
  if (isOpenInternal.value) {
    setOpen(false);
    nextTick(() => wrapperRef.value?.querySelector<HTMLElement>('button, [tabindex]')?.focus());
  }
}

function setOpen(val: boolean) {
  isOpenInternal.value = val;
  emit('update:isOpen', val);
}

function onClickOutside(e: MouseEvent) {
  if (isOpenInternal.value && wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
    close();
  }
}

// 使用捕获阶段 (capture: true) 拦截全局点击，确保完美互斥
onMounted(() => document.addEventListener('click', onClickOutside, { capture: true }));
onUnmounted(() => document.removeEventListener('click', onClickOutside, { capture: true }));

defineExpose({ close, toggle, isOpen: isOpenInternal });
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
