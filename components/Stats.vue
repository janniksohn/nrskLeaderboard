<script setup lang="ts">
import type { FFAPlayer } from "~/types/player";

const props = withDefaults(
  defineProps<{
    open: boolean;
    player: FFAPlayer;
  }>(),
  {
    open: false,
  }
);

const emit = defineEmits(["update:open"]);

const open = ref(props.open);
watchEffect(() => {
  open.value = props.open;
});

// Watch for changes to the open ref and emit an event when it changes
watch(open, (newValue) => {
  emit("update:open", newValue);
});

function transformData(data: FFAPlayer["heroes"]) {
  return Object.keys(data).map((characterKey) => {
    return {
      label: characterKey.charAt(0).toUpperCase() + characterKey.slice(1),
      key: characterKey.toLowerCase(),
      content: data[characterKey],
    };
  });
}
</script>

<template>
  <div>
    <UModal v-model="open">
      <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">{{ player.name }}</h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="open = false" />
          </div>
        </template>

        <UTabs :items="transformData(player.heroes)">
          <template #item="{ item }">
            <pre>{{ item.content }}</pre>
          </template>
        </UTabs>
      </UCard>
    </UModal>
  </div>
</template>
