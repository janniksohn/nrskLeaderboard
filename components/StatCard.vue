<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  value: string | number;
  icon: string;
  iconColor: string;
}>();
</script>

<template>
  <UCard :ui="{ body: { base: 'w-full' } }">
    <div class="flex items-center justify-between" v-bind="$attrs">
      <div class="sticky left-4">
        <h3 class="text-lg font-semibold">{{ title }}</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ description }}</p>
      </div>
      <div class="flex items-center space-x-2">
        <UIcon :name="icon" v-bind:class="iconColor" aria-hidden="true" />
        <span class="text-lg font-semibold">{{ value }}</span>
      </div>
    </div>
  </UCard>
</template>
