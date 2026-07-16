<template>
  <RouterView />
  <Toast position="top-right" />
  <ConfirmDialog class="w-[min(92vw,28rem)]" />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import ConfirmDialog from 'primevue/confirmdialog';
import Toast from 'primevue/toast';
</script>
