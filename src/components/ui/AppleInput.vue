<template>
  <input
    :type="type"
    :value="modelValue"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    :placeholder="placeholder"
    :name="name"
    :autocomplete="autocomplete"
    class="rounded-xl border border-[#38383a] bg-[#1c1c1e]/80 text-[#f5f5f7] placeholder-[#86868b] transition-all duration-200 outline-none py-3 px-4 w-full text-[14px] focus:border-[#F596AA] focus:ring-4 focus:ring-[#F596AA]/20"
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