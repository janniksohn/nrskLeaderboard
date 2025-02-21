<script setup lang="ts">
const columns = [
  { key: "place", label: "#" },
  { key: "name", label: "Name", sortable: true },
  { key: "kills", label: "Kills", sortable: true },
  { key: "deaths", label: "Deaths", sortable: true },
  { key: "xp", label: "XP", sortable: true },
];

const sort = ref({
  column: "kills",
  direction: "desc",
});

const page = ref(1);
const pageCount = 10;

const players = ref([]);

const { data: rawData, status } = await useLazyAsyncData("players", () => $fetch("/dummy"));

watchEffect(async () => {
  if (rawData.value) {
    players.value = rawData.value.map((player, index) => ({
      place: index + 1,
      name: "Loading...",
      kills: player.kills,
      deaths: player.deaths,
      xp: player.xp,
      id: player.playerId,
    }));

    // Fetch names for all players
    await Promise.all(
      players.value.map(async (player) => {
        try {
          const response = await $fetch(`https://api.minetools.eu/uuid/${player.id}`);
          player.name = response.name;
        } catch (error) {
          console.error(`Error fetching name for player ${player.id}:`, error);
          player.name = "Error loading name";
        }
      })
    );
  }
});

// Computed property for paginated rows
const rows = computed(() => {
  if (!players.value) return [];
  const start = (page.value - 1) * pageCount;
  const end = start + pageCount;
  return players.value.slice(start, end);
});

const totalPlayers = computed(() => players.value?.length || 0);

const handleExpand = ({ openedRows, row }) => {
  console.log("opened Rows:", openedRows);
  console.log("Row Data:", row);
};

const expand = ref({
  openedRows: [],
  row: null,
});
</script>

<template>
  <div>
    <UTable
      @update:expand="handleExpand"
      v-model:expand="expand"
      :loading="status === 'pending'"
      :loading-state="{ icon: 'i-heroicons-arrow-path-20-solid', label: 'Loading...' }"
      :progress="{ color: 'primary', animation: 'carousel' }"
      :empty-state="{ icon: 'i-heroicons-circle-stack-20-solid', label: 'No data found' }"
      :sort="sort"
      :rows="rows"
      :columns="columns"
      class="rounded-md border border-gray-300 dark:border-gray-700"
      :ui="{ tr: { base: 'relative transition-colors has-[td]:cursor-pointer has-[td]:hover:bg-gray-100 has-[td]:dark:hover:bg-gray-800' } }"
    >
      <template #expand-action="{ toggle }">
        <div class="absolute inset-0 pointer-events-auto" @click="toggle" />
      </template>
    </UTable>

    <div class="flex justify-end px-3 py-3.5">
      <UPagination v-model="page" :page-count="pageCount" :total="totalPlayers" />
    </div>
  </div>
</template>

<style scoped>
:deep(table tbody tr td:first-child) {
  @apply absolute inset-0 p-0 m-0 border-none pointer-events-none;
}
</style>
