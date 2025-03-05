<script setup lang="ts">
import type { MinecraftProfileResponse } from "~/types/minecraftApi";
import type { FFAPlayer } from "~/types/player";
import { useIntersectionObserver } from "@vueuse/core";

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
const pageSize = 25;
const bufferSize = 15;

const players = ref<FFAPlayer[]>([]);
const visiblePlayerMap = ref<Map<string, boolean>>(new Map());
const loadingNames = ref(new Set<string>());
const intersectionTargets = ref<{ [key: string]: HTMLElement | null }>({});

// Add a global player profile cache
const playerProfileCache = ref<Map<string, { name: string; head: string | null }>>(new Map());

// Store original player ranks (based on kills desc)
const originalPlayerRanks = ref<Map<string, number>>(new Map());
const isFirstLoad = ref(true);

// Search functionality implementation
const search = ref("");
const isSearching = ref(false);
const searchDebounceTimeout = ref<NodeJS.Timeout | null>(null);

// Debounced search implementation
const debouncedSearch = ref(search.value);
const updateDebouncedSearch = () => {
  if (searchDebounceTimeout.value) {
    clearTimeout(searchDebounceTimeout.value);
  }

  searchDebounceTimeout.value = setTimeout(() => {
    debouncedSearch.value = search.value;
    searchDebounceTimeout.value = null;
  }, 300);
};

// Fetch a specific page of players with sorting and searching
const fetchPlayerPage = async (pageNum: number, searchTerm: string = "") => {
  try {
    const sortColumn = sort.value.column;
    const direction = sort.value.direction;
    isSearching.value = searchTerm.length > 0;

    const response = await $fetch<(Omit<FFAPlayer, "id"> & { playerId: string })[]>(
      `/api/players?page=${pageNum}&sort=${sortColumn}&direction=${direction}&limit=${pageSize}&fullSort=true${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ""}`,
      { headers: { accept: "*/*" } }
    );

    isSearching.value = false;
    return response;
  } catch (error) {
    console.error(`Failed to fetch player page ${pageNum}:`, error);
    isSearching.value = false;
    throw error;
  }
};

// Pagination Count for API page determination
const { totalPages, totalFilteredCount, isLoading: countingPages, countTotalPages } = usePaginationCount((page, search) => fetchPlayerPage(page, search));

// Reset and refresh data when sort changes but maintain the cache
watch(
  sort,
  async () => {
    page.value = 1;
    totalPages.value = null;
    totalFilteredCount.value = null;
    visiblePlayerMap.value.clear();

    // Ensure original ranks are loaded before refreshing with new sort
    if (isFirstLoad.value) {
      await fetchOriginalRanks();
    }

    await refresh();
    await countTotalPages(debouncedSearch.value);
  },
  { deep: true }
);

// Watch for debounced search changes and refresh data
watch(debouncedSearch, async (newSearch, oldSearch) => {
  if (newSearch.trim() !== oldSearch.trim()) {
    page.value = 1;
    totalPages.value = null;
    totalFilteredCount.value = null;
    visiblePlayerMap.value.clear();
    await refresh();
    await countTotalPages(newSearch);
  }
});

// Watch für den Such-Input und triggere den Debounce
watch(search, updateDebouncedSearch);

// Initial data fetch for first page
const {
  data: rawData,
  status,
  refresh,
} = await useLazyAsyncData<(Omit<FFAPlayer, "id"> & { playerId: string })[]>(() => fetchPlayerPage(page.value, debouncedSearch.value), {
  watch: [page, debouncedSearch],
});

// Fetch original ranks (only once) - always using kills/desc regardless of current sort
const fetchOriginalRanks = async () => {
  if (!isFirstLoad.value) {
    return;
  }

  try {
    // Fetch all pages to build complete ranking
    const allPlayers: (Omit<FFAPlayer, "id"> & { playerId: string })[] = [];
    let currentPage = 1;

    while (currentPage <= (totalPages.value || 1)) {
      const pageData = await $fetch<(Omit<FFAPlayer, "id"> & { playerId: string })[]>(`/api/players?page=${currentPage}&sort=kills&direction=desc&limit=${pageSize}&fullSort=true`);
      allPlayers.push(...pageData);
      currentPage++;
    }

    isFirstLoad.value = false;
  } catch (error) {
    console.error("Failed to fetch original ranks:", error);
  }
};

// Count total pages on first load and fetch original ranks
onMounted(async () => {
  await countTotalPages();
  await fetchOriginalRanks();
});

// Process raw data into player rows with cache integration
watchEffect(() => {
  if (rawData.value) {
    visiblePlayerMap.value.clear();

    players.value = rawData.value.map((player) => {
      const playerId = player.playerId;
      const cachedProfile = playerProfileCache.value.get(playerId);

      return {
        ...player,
        head: cachedProfile ? cachedProfile.head : null,
        name: cachedProfile ? cachedProfile.name : "Loading...",
        id: playerId,
      };
    });

    // Force load only uncached players immediately
    nextTick(() => {
      const initialPlayers = players.value.slice(0, Math.min(10, players.value.length)).filter((player) => player.name === "Loading...");

      initialPlayers.forEach((player) => {
        visiblePlayerMap.value.set(player.id, true);
        loadPlayerProfile(player.id);
      });
    });
  }
});

// Handle table sort update
const onUpdateSort = (newSort: { column: string; direction: "desc" | "asc" }) => {
  sort.value = newSort;
};

// Setup intersection observer for player rows
const setupIntersectionObserver = (playerId: string, element: HTMLElement | null) => {
  if (!element || !playerId) return;
  if (playerProfileCache.value.has(playerId)) return;

  intersectionTargets.value[playerId] = element;

  const { stop } = useIntersectionObserver(
    element,
    async ([{ isIntersecting }]) => {
      if (isIntersecting && !visiblePlayerMap.value.has(playerId)) {
        visiblePlayerMap.value.set(playerId, true);
        await loadPlayerProfile(playerId);
      }
    },
    { threshold: 0.1 }
  );

  // Immediately load if this is one of the first visible players and not cached
  if (Object.keys(visiblePlayerMap.value).length < pageSize / 2 && !playerProfileCache.value.has(playerId)) {
    visiblePlayerMap.value.set(playerId, true);
    loadPlayerProfile(playerId);
  }
};

// Load player profile data when in viewport
const loadPlayerProfile = async (playerId: string) => {
  // Check cache first
  if (playerProfileCache.value.has(playerId)) {
    const cachedData = playerProfileCache.value.get(playerId)!;
    updatePlayerInTable(playerId, cachedData.name, cachedData.head);
    return;
  }

  // Skip if already loading
  if (loadingNames.value.has(playerId)) return;

  const playerIndex = players.value.findIndex((p) => p.id === playerId);
  if (playerIndex === -1 || players.value[playerIndex].name !== "Loading...") return;

  loadingNames.value.add(playerId);

  try {
    const response = await $fetch<MinecraftProfileResponse>(`https://api.minetools.eu/profile/${playerId}`);

    const playerName = response.decoded.profileName;
    const playerHead = `https://crafatar.com/avatars/${playerId}?size=32&overlay`;

    // Update cache
    playerProfileCache.value.set(playerId, {
      name: playerName,
      head: playerHead,
    });

    // Update player in table
    updatePlayerInTable(playerId, playerName, playerHead);

    // Spielername im Backend-Cache speichern für die Suche
    try {
      await $fetch("/api/players/names", {
        method: "POST",
        body: {
          playerId: playerId,
          name: playerName,
        },
      });
    } catch (error) {
      console.error("Fehler beim Speichern des Namens im Backend:", error);
    }
  } catch (error) {
    console.error(`Error fetching name for player ${playerId}:`, error);

    // Cache error state too
    playerProfileCache.value.set(playerId, {
      name: "Error loading name",
      head: null,
    });

    updatePlayerInTable(playerId, "Error loading name", null);
  } finally {
    loadingNames.value.delete(playerId);
  }
};

// Helper function to update player data in the table
const updatePlayerInTable = (playerId: string, name: string, head: string | null) => {
  const updatedPlayerIndex = players.value.findIndex((p) => p.id === playerId);
  if (updatedPlayerIndex !== -1) {
    players.value[updatedPlayerIndex].name = name;
    players.value[updatedPlayerIndex].head = head;
  }
};

// Load buffer of players around visible ones
const loadBuffer = async () => {
  const visibleIndices = Array.from(visiblePlayerMap.value.keys())
    .map((id) => players.value.findIndex((p) => p.id === id))
    .filter((idx) => idx !== -1);

  if (visibleIndices.length === 0) return;

  const minIndex = Math.max(0, Math.min(...visibleIndices) - bufferSize);
  const maxIndex = Math.min(players.value.length - 1, Math.max(...visibleIndices) + bufferSize);

  const playersToLoad = players.value
    .slice(minIndex, maxIndex + 1)
    .filter((p) => p.name === "Loading..." && !loadingNames.value.has(p.id) && !playerProfileCache.value.has(p.id))
    .map((p) => p.id);

  for (const id of playersToLoad) {
    visiblePlayerMap.value.set(id, true);
    await loadPlayerProfile(id);
  }
};

// Initial load of visible players when the component is mounted
onMounted(() => {
  nextTick(() => {
    const initialPlayers = players.value.slice(0, Math.min(10, players.value.length)).filter((player) => !playerProfileCache.value.has(player.id));

    initialPlayers.forEach((player) => {
      visiblePlayerMap.value.set(player.id, true);
      loadPlayerProfile(player.id);
    });
  });
});

// Watch visible players and load buffer
watch(
  visiblePlayerMap,
  async () => {
    await loadBuffer();
  },
  { deep: true }
);

// Total player count calculation based on search state
const totalPlayerCount = computed(() => {
  if (debouncedSearch.value.trim() && totalFilteredCount.value !== null) {
    return totalFilteredCount.value;
  }
  return totalPages.value ? totalPages.value * pageSize : 0;
});

// Handle clear search
const clearSearch = () => {
  search.value = "";
  // Debounce-Timeout clearen und sofort aktualisieren
  if (searchDebounceTimeout.value) {
    clearTimeout(searchDebounceTimeout.value);
    searchDebounceTimeout.value = null;
  }
  debouncedSearch.value = "";
};

// Rows direkt aus players übernehmen
const rows = computed(() => players.value);

const expand = ref<{ row: FFAPlayer | null; openedRows: any[] }>({
  openedRows: [],
  row: null,
});

const statsOpen = ref(false);
</script>

<template>
  <div class="border border-gray-300 dark:border-gray-700 rounded-lg">
    <div class="flex px-3 py-3.5 border-b border-gray-200 dark:border-gray-700">
      <UInput v-model="search" placeholder="Search..." class="flex-1" />
      <UButton v-if="search.trim()" @click="clearSearch" icon="i-heroicons-x-mark" color="gray" variant="ghost" class="ml-2" />
      <span v-if="search.trim()" class="ml-3 self-center text-sm text-gray-500 dark:text-gray-400"> {{ totalPlayerCount }} results </span>
    </div>

    <UTable
      @update:sort="onUpdateSort"
      v-model:expand="expand"
      v-model:sort="sort"
      :loading="status === 'pending' || countingPages || isSearching"
      :loading-state="{ icon: 'i-heroicons-arrow-path-20-solid', label: 'Loading...' }"
      :progress="{ color: 'primary', animation: 'carousel' }"
      :empty-state="{ icon: 'i-heroicons-circle-stack-20-solid', label: 'No data found' }"
      :rows="rows"
      :columns="columns"
      :ui="{
        tr: { base: 'relative transition-colors has-[td]:cursor-pointer has-[td]:hover:bg-gray-100 has-[td]:dark:hover:bg-gray-800' },
      }"
    >
      <template #originalRank-data="{ row }">
        <span
          :class="{
            'text-yellow-500': row.originalRank === 1,
            'text-gray-400 dark:text-gray-100': row.originalRank === 2,
            'text-orange-500': row.originalRank === 3,
          }"
        >
          {{ row.originalRank }}</span
        >
      </template>

      <template #head-data="{ row }">
        <NuxtImg v-if="row.head" :src="row.head" class="size-8 min-w-8 rounded-sm" loading="lazy" />
        <USkeleton v-else class="size-8 rounded-sm" />
      </template>

      <template #expand-action="{ toggle }">
        <div class="absolute inset-0 pointer-events-auto" @click="toggle" />
      </template>

      <template #cell-name="{ row }">
        <div :ref="el => setupIntersectionObserver(row.id, el as HTMLElement)">
          {{ row.name }}
        </div>
      </template>

      <template #expand="{ row }">
        <div class="flex gap-4 p-4">
          <NuxtImg :src="`https://crafatar.com/renders/body/${row.id}?size=128&overlay`" class="rounded-lg ml-4 hidden md:block min-w-[120px] h-full" loading="lazy" />
          <div class="flex-1">
            <div class="flex ml-4 md:ml-0 items-center">
              <h2 class="text-lg font-semibold">{{ row?.name || "Loading..." }}</h2>
              <NuxtImg :src="`https://crafatar.com/renders/head/${row.id}?size=128&overlay`" class="rounded-lg block md:hidden" loading="lazy" />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-6 p-4">
              <StatCard v-if="row?.kills !== undefined" title="Kills" :value="row.kills" description="Total kills" icon="i-lucide-sword" iconColor="text-primary" />
              <StatCard v-if="row?.deaths !== undefined" title="Deaths" :value="row.deaths" description="Total deaths" icon="i-lucide-skull" iconColor="text-red-500" />
              <StatCard
                v-if="row?.kills !== undefined && row?.deaths !== undefined"
                title="K/D Ratio"
                :value="(row.deaths > 0 ? (row.kills / row.deaths).toFixed(2) : row.kills).toString()"
                description="Kill-death ratio"
                icon="i-lucide-activity"
                iconColor="text-green-500"
              />
              <StatCard v-if="row?.xp !== undefined" title="XP" :value="row.xp" description="Total XP" icon="i-lucide-star" iconColor="text-yellow-500" />
              <StatCard v-if="row?.bounty !== undefined" title="Bounty" :value="row.bounty" description="Total bounty" icon="i-lucide-bitcoin" iconColor="text-blue-500" />
              <StatCard
                v-if="row?.currentKillStreak !== undefined"
                title="Current Streak"
                :value="row.currentKillStreak"
                description="Current kill streak"
                icon="i-lucide-flame"
                iconColor="text-orange-500"
              />
              <StatCard
                v-if="row?.highestKillStreak !== undefined"
                title="Highest Streak"
                :value="row.highestKillStreak"
                description="Highest kill streak"
                icon="i-lucide-flame-kindling"
                iconColor="text-purple-500"
              />

              <UButton variant="outline" class="justify-center rounded-md" @click="statsOpen = true">Full Stats</UButton>
            </div>
          </div>
        </div>

        <Stats v-model:open="statsOpen" :player="row" />
      </template>
    </UTable>
  </div>

  <div class="flex justify-end px-3 py-3.5">
    <UPagination v-model="page" :page-count="pageSize" :total="totalPlayerCount" />
  </div>
</template>

<style scoped>
:deep(table tbody) {
  tr:has(td[colspan]) {
    @apply border-none;
  }

  tr td:nth-child(2) {
    @apply w-[1ch];
  }
}
</style>
