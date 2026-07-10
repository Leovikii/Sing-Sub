<template>
  <input
    :type="type"
    :value="modelValue"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    :placeholder="placeholder"
    :name="name"
    :autocomplete="autocomplete"
    class="rounded-xl border border-border-base bg-bg-surface/80 text-text-primary placeholder-text-muted transition-all duration-200 outline-none py-3 px-4 w-full text-[14px] focus:border-brand-pink focus:ring-4 focus:ring-brand-pink/20"
  />
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  placeholder?: string;
  type?: string;
  name?: string;
  autocomplete?: string;
}>();

defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();
</script>
