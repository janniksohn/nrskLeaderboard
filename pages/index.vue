<script setup lang="ts">
import { useActivePlayerStore } from "~/store/activePlayer";
import type { MinecraftProfileResponse } from "~/types/minecraftApi";
import type { FFAPlayer, PlayerInfo } from "~/types/player";

const columns = [
  { key: "index", label: "#" },
  { key: "head", label: "" },
  { key: "name", label: "Name", sortable: true },
  { key: "kills", label: "Kills", sortable: true },
  { key: "deaths", label: "Deaths", sortable: true },
  { key: "xp", label: "XP", sortable: true },
];

const sort = ref<{ column: string; direction: "desc" | "asc" }>({
  column: "kills",
  direction: "desc",
});

const page = ref(1);
const pageCount = 10;

const players = ref<FFAPlayer[]>([]);
const loadingNames = ref(new Set<string>());

const { data: rawData, status } = await useLazyAsyncData<(Omit<FFAPlayer, "id"> & { playerId: string })[]>("players", () => $fetch("/dummy"));

watchEffect(() => {
  if (rawData.value) {
    players.value = rawData.value.map((player, index) => ({
      index: index + 1,
      head: null,
      name: "Loading...",
      kills: player.kills,
      deaths: player.deaths,
      xp: player.xp,
      id: player.playerId,
    }));
  }
});

const currentPagePlayers = computed(() => {
  if (!players.value) return [];
  const start = (page.value - 1) * pageCount;
  const end = start + pageCount;
  return players.value.slice(start, end);
});

watch(
  [currentPagePlayers, page],
  async () => {
    const visiblePlayers = currentPagePlayers.value;

    await Promise.all(
      visiblePlayers.map(async (player) => {
        if (loadingNames.value.has(player.id) || player.name !== "Loading...") {
          return;
        }

        loadingNames.value.add(player.id);

        try {
          const response = await $fetch<MinecraftProfileResponse>(`https://api.minetools.eu/profile/${player.id}`);

          const playerIndex = players.value.findIndex((p) => p.id === player.id);
          if (playerIndex !== -1) {
            players.value[playerIndex].name = response.decoded.profileName;
            players.value[playerIndex].head = "/texture/" + new URL(response.decoded.textures.SKIN.url).pathname.split("/").pop();
          }
        } catch (error) {
          console.error(`Error fetching name for player ${player.id}:`, error);

          const playerIndex = players.value.findIndex((p) => p.id === player.id);
          if (playerIndex !== -1) {
            players.value[playerIndex].name = "Error loading name";
          }
        } finally {
          loadingNames.value.delete(player.id);
        }
      })
    );
  },
  { immediate: true }
);

const rows = computed(() => currentPagePlayers.value);

const totalPlayers = computed(() => players.value?.length || 0);

const handleExpand = async ({ row }: { row: FFAPlayer }) => {
  useActivePlayerStore().setActivePlayer(row);
  await navigateTo(`/player/${row.id}`);
};

const expand = ref<{ row: FFAPlayer | null; openedRows: any[] }>({
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
      :sort
      :rows
      :columns
      class="rounded-md border border-gray-300 dark:border-gray-700"
      :ui="{ tr: { base: 'relative transition-colors has-[td]:cursor-pointer has-[td]:hover:bg-gray-100 has-[td]:dark:hover:bg-gray-800' } }"
    >
      <template #index-data="{ row }">
        <span class="font-mono">{{ row.index }}</span>
      </template>

      <template #head-data="{ row }">
        <NuxtImg v-if="row.head" :src="row.head" :modifiers="{ extract: '8_8_8_8', s: '32,kernel_nearest' }" class="size-8 rounded-sm" />
        <USkeleton v-else class="size-8 rounded-sm" />
      </template>

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
:deep(table tbody) {
  tr:has(td[colspan]) {
    @apply border-none;
  }

  tr td:first-child {
    @apply absolute inset-0 p-0 m-0 border-none pointer-events-none;
  }

  tr td:nth-child(2) {
    @apply w-[1ch];
  }
}
</style>
