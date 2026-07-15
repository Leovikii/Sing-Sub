<template>
  <RouterView />
  <Toast position="top-right" />
  <ConfirmDialog />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import ConfirmDialog from 'primevue/confirmdialog';
import Toast from 'primevue/toast';
</script>
