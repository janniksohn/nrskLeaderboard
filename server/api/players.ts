import { H3Event } from "h3";

// Constants for configuration
const STATS_CACHE_TTL = 20 * 60 * 1000; // 20 minutes
const PLAYER_NAMES_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day
const MAX_PAGES = 20;
const BATCH_SIZE = 10;

// Type definitions
interface QueryParams {
  page?: string;
  limit?: string;
  sort?: string;
  direction?: string;
  fullSort?: string;
  search?: string;
}

export interface PlayerData {
  [key: string]: any;
  playerId: string;
}

export interface PlayerNameCacheEntry {
  name: string;
  timestamp: number;
}

// API interaction functions
async function fetchPlayerData(sort: string, page: number): Promise<PlayerData[]> {
  const url = new URL("https://api.hglabor.de/stats/FFA/top");
  url.searchParams.append("sort", sort);
  url.searchParams.append("page", page.toString());

  try {
    const response = await fetch(url, {
      headers: { accept: "*/*" },
    });

    if (response.status === 404) return []; // End of pages reached

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        message: `API Error: ${await response.text()}`,
      });
    }

    const data: PlayerData[] = await response.json();

    if (!Array.isArray(data)) {
      throw createError({
        statusCode: 500,
        message: "Invalid data format received from API",
      });
    }

    // Add index to each player
    return data.map((player, i) => {
      player.index = (page - 1) * 100 + i + 1;
      return player;
    });
  } catch (error: any) {
    console.error(`Error fetching player data (page ${page}):`, error);
    throw error;
  }
}

async function fetchAllPlayerData(sort: string): Promise<PlayerData[]> {
  let allData: PlayerData[] = [];
  let currentPage = 1;

  while (currentPage <= MAX_PAGES) {
    console.log(`Fetching page ${currentPage} of max ${MAX_PAGES}`);

    const pageData = await fetchPlayerData(sort, currentPage);

    if (pageData.length === 0) {
      break; // No more pages
    }

    allData = [...allData, ...pageData];
    currentPage++;
  }

  return allData;
}

async function fetchPlayerName(playerId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.minetools.eu/profile/${playerId}`);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data?.decoded?.profileName) {
      return data.decoded.profileName;
    }
    return null;
  } catch (error) {
    console.error(`Error loading name for ${playerId}:`, error);
    return null;
  }
}

// Database functions
async function initializeDatabase(db: any) {
  try {
    // Create stats cache table
    await db.sql`
      CREATE TABLE IF NOT EXISTS stats_cache (
        sort_key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `;

    // Create player names cache table
    await db.sql`
      CREATE TABLE IF NOT EXISTS player_names (
        player_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `;

    console.log("Database tables initialized successfully");
  } catch (error) {
    console.error("Error initializing database tables:", error);
    throw error;
  }
}

async function getStatsFromCache(db: any, sortKey: string): Promise<{ data: PlayerData[]; timestamp: number } | null> {
  try {
    const result = await db.sql`
      SELECT data, timestamp FROM stats_cache
      WHERE sort_key = ${sortKey}
    `;

    if (!result || !result.rows || result.rows.length === 0) {
      return null;
    }

    // Access the row data safely using rows property
    const row = result.rows[0];
    if (!row || !row.data) {
      return null;
    }

    return {
      data: JSON.parse(row.data) as PlayerData[],
      timestamp: Number(row.timestamp),
    };
  } catch (error) {
    console.error(`Error retrieving stats cache for ${sortKey}:`, error);
    return null;
  }
}

async function saveStatsToCache(db: any, sortKey: string, data: PlayerData[]): Promise<void> {
  try {
    const timestamp = Date.now();
    const jsonData = JSON.stringify(data);

    // First check if the key exists
    const existingResult = await db.sql`
      SELECT 1 FROM stats_cache WHERE sort_key = ${sortKey}
    `;

    const exists = existingResult && existingResult.rows && existingResult.rows.length > 0;

    if (exists) {
      // Update existing record
      await db.sql`
        UPDATE stats_cache
        SET data = ${jsonData}, timestamp = ${timestamp}
        WHERE sort_key = ${sortKey}
      `;
    } else {
      // Insert new record
      await db.sql`
        INSERT INTO stats_cache (sort_key, data, timestamp)
        VALUES (${sortKey}, ${jsonData}, ${timestamp})
      `;
    }
  } catch (error) {
    console.error(`Error saving stats cache for ${sortKey}:`, error);
  }
}

async function getPlayerNamesFromCache(db: any): Promise<Record<string, PlayerNameCacheEntry>> {
  try {
    const result = await db.sql`
      SELECT player_id, name, timestamp FROM player_names
    `;

    const playerNames: Record<string, PlayerNameCacheEntry> = {};

    if (!result || !result.rows) {
      return playerNames;
    }

    for (const row of result.rows) {
      playerNames[row.player_id] = {
        name: row.name,
        timestamp: Number(row.timestamp),
      };
    }

    return playerNames;
  } catch (error) {
    console.error("Error retrieving player names from cache:", error);
    return {};
  }
}

async function savePlayerNameToCache(db: any, playerId: string, name: string): Promise<void> {
  try {
    const timestamp = Date.now();

    await db.sql`
      INSERT INTO player_names (player_id, name, timestamp)
      VALUES (${playerId}, ${name}, ${timestamp})
      ON CONFLICT (player_id) 
      DO UPDATE SET name = ${name}, timestamp = ${timestamp}
    `;
  } catch (error) {
    console.error(`Error saving player name for ${playerId}:`, error);
  }
}

async function preloadPlayerNames(db: any, forceRefresh = false): Promise<void> {
  console.log("Starting preload of player names...");

  try {
    // Get current cache state
    const playerNameCache = await getPlayerNamesFromCache(db);
    const now = Date.now();

    // Load a sample of players to get their IDs
    const sampleData = await fetchPlayerData("kills", 1);
    const playerIds = sampleData.map((player) => player.playerId);

    // Filter IDs that need refreshing
    const idsToFetch = playerIds.filter((id) => {
      const cachedEntry = playerNameCache[id];
      return forceRefresh || !cachedEntry || now - cachedEntry.timestamp > PLAYER_NAMES_CACHE_TTL;
    });

    if (idsToFetch.length === 0) {
      console.log("No player names need updating");
      return;
    }

    console.log(`Fetching names for ${idsToFetch.length} players...`);
    let newNamesCount = 0;

    // Process in batches
    for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
      const batch = idsToFetch.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (playerId) => {
        const name = await fetchPlayerName(playerId);
        if (name) {
          await savePlayerNameToCache(db, playerId, name);
          newNamesCount++;
          return { id: playerId, name };
        }
        return null;
      });

      const results = await Promise.all(promises);
      const validResults = results.filter(Boolean);

      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(idsToFetch.length / BATCH_SIZE)} completed: ${validResults.length} names`);
    }

    console.log(`Player name preload complete: ${newNamesCount} new names loaded`);
  } catch (error) {
    console.error("Error in player name preload:", error);
  }
}

// Data manipulation functions
function sortData(data: PlayerData[], sortKey: string, direction: "asc" | "desc"): PlayerData[] {
  if (!Array.isArray(data)) return data;

  return [...data].sort((a: PlayerData, b: PlayerData): number => {
    // Ensure values are comparable
    const valueA = a[sortKey] !== undefined ? a[sortKey] : 0;
    const valueB = b[sortKey] !== undefined ? b[sortKey] : 0;

    let comparison = 0;
    if (typeof valueA === "number" && typeof valueB === "number") {
      comparison = valueA - valueB;
    } else {
      comparison = String(valueA).localeCompare(String(valueB));
    }

    // Reverse for descending sort
    return direction === "asc" ? comparison : -comparison;
  });
}

function filterData(data: PlayerData[], search: string, playerNameCache: Record<string, PlayerNameCacheEntry>): PlayerData[] {
  if (!Array.isArray(data) || !search.trim()) return data;

  const searchTerm = search.toLowerCase().trim();
  const isNumeric = !isNaN(Number(searchTerm));
  const searchNumber = isNumeric ? Number(searchTerm) : null;

  // Find players with matching names
  const matchingPlayerIds = Object.entries(playerNameCache)
    .filter(([_, data]) => data.name.toLowerCase().includes(searchTerm))
    .map(([id]) => id);

  return data.filter((player) => {
    // Search by player ID
    if (player.playerId && player.playerId.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // Search by player name
    if (matchingPlayerIds.includes(player.playerId)) {
      return true;
    }

    // Search by numeric stats
    if (isNumeric && searchNumber !== null) {
      return (
        player.kills === searchNumber ||
        player.deaths === searchNumber ||
        player.xp === searchNumber ||
        player.bounty === searchNumber ||
        player.currentKillStreak === searchNumber ||
        player.highestKillStreak === searchNumber
      );
    }

    return false;
  });
}

// Main handler
export default defineEventHandler(async (event: H3Event) => {
  // Get database connection
  const db = useDatabase();

  // Initialize database tables if they don't exist
  await initializeDatabase(db);

  // Parse query parameters
  const query = getQuery(event) as QueryParams;
  const page = query.page ? Number(query.page) : 1;
  const limit = query.limit ? Number(query.limit) : 100;
  const fullSort = query.fullSort === "true";
  const search = query.search ? decodeURIComponent(query.search) : "";
  const sort = query.sort || "kills";
  const direction = query.direction || "desc";

  // Get player names cache (for search functionality)
  const playerNameCache = await getPlayerNamesFromCache(db);

  // Preload player names in the background (production only)
  setTimeout(() => preloadPlayerNames(db), 1000);

  try {
    if (fullSort) {
      // Create cache key from parameters
      const cacheKey = `${sort}`;
      const now = Date.now();

      // Check for valid cache
      const cachedStats = await getStatsFromCache(db, cacheKey);
      if (cachedStats && cachedStats.data.length > 0 && now - cachedStats.timestamp < STATS_CACHE_TTL) {
        console.log(`Using cached data for sort: ${cacheKey} (age: ${Math.round((now - cachedStats.timestamp) / 1000)}s)`);

        // Apply direction sorting
        const sortedData = direction === "asc" ? sortData([...cachedStats.data], sort, "asc") : sortData([...cachedStats.data], sort, "desc");

        // Apply search filter if needed
        const filteredData = search ? filterData(sortedData, search, playerNameCache) : sortedData;

        // Set count header
        event.node.res.setHeader("X-Total-Count", filteredData.length.toString());

        // Apply pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        if (startIndex >= filteredData.length) {
          return []; // Page out of range
        }

        return filteredData.slice(startIndex, endIndex);
      }

      // No valid cache, fetch all data
      console.log(`Fetching all data for sort: ${sort}`);

      const allData = await fetchAllPlayerData(sort);

      // Update cache
      await saveStatsToCache(db, cacheKey, allData);

      // Apply direction sorting
      const sortedData = direction === "asc" ? sortData(allData, sort, "asc") : sortData(allData, sort, "desc");

      // Apply search filter if needed
      const filteredData = search ? filterData(sortedData, search, playerNameCache) : sortedData;

      // Set count header
      event.node.res.setHeader("X-Total-Count", filteredData.length.toString());

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;

      if (startIndex >= filteredData.length) {
        return []; // Page out of range
      }

      return filteredData.slice(startIndex, endIndex);
    } else {
      // Regular mode - single page fetch
      const data = await fetchPlayerData(sort, page);

      // Apply direction sorting if ascending
      return direction === "asc" ? sortData(data, sort, "asc") : data;
    }
  } catch (error: any) {
    // Handle specific error cases
    if (error.statusCode === 404) {
      throw createError({
        statusCode: 404,
        message: `Page ${page} not found`,
      });
    }

    console.error("Error processing player data:", error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Error fetching player data",
    });
  }
});
