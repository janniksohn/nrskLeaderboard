import { H3Event } from "h3";

// Updated interface to match our improved cache structure
export interface PlayerNameCacheEntry {
  name: string;
  timestamp: number;
}

// Constants
const PLAYER_NAMES_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day
const MAX_RESULTS_PER_PAGE = 100;

// Database functions
async function initializeDatabase(db: any) {
  try {
    // Create player names table if it doesn't exist - using SQLite/LibSQL syntax
    await db.sql`
      CREATE TABLE IF NOT EXISTS player_names (
        player_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `;

    // Create an index for name searches (SQLite specific)
    await db.sql`
      CREATE INDEX IF NOT EXISTS idx_player_names_name 
      ON player_names(name)
    `;

    console.log("Player names table initialized successfully");
  } catch (error) {
    console.error("Error initializing player names table:", error);
    throw error;
  }
}

async function getPlayerById(db: any, playerId: string): Promise<PlayerNameCacheEntry | null> {
  try {
    const result = await db.sql`
      SELECT name, timestamp FROM player_names
      WHERE player_id = ${playerId}
    `;

    if (!result || !result.rows || result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row || row.name === undefined) {
      return null;
    }

    return {
      name: row.name,
      timestamp: Number(row.timestamp),
    };
  } catch (error) {
    console.error(`Error retrieving player with ID ${playerId}:`, error);
    return null;
  }
}

async function getPlayersByIds(db: any, playerIds: string[]): Promise<Record<string, string>> {
  try {
    if (playerIds.length === 0) {
      return {};
    }

    // SQLite doesn't support array parameters in IN clauses directly
    // Create a parameterized query with individual placeholders
    const placeholders = playerIds.map(() => "?").join(",");

    const result = await db.execute(`SELECT player_id, name FROM player_names WHERE player_id IN (${placeholders})`, playerIds);

    const playerMap: Record<string, string> = {};
    if (!result || !result.rows) {
      return playerMap;
    }

    for (const row of result.rows) {
      playerMap[row.player_id] = row.name;
    }

    return playerMap;
  } catch (error) {
    console.error(`Error retrieving players by IDs:`, error);
    return {};
  }
}

async function searchPlayersByName(
  db: any,
  search: string,
  page: number
): Promise<{
  players: Array<{ id: string; name: string }>;
  totalCount: number;
}> {
  try {
    const searchPattern = `%${search}%`;

    // Get total count first - SQLite uses LIKE with UPPER/LOWER for case insensitivity
    const countResult = await db.sql`
      SELECT COUNT(*) as total FROM player_names
      WHERE name LIKE ${searchPattern} COLLATE NOCASE
    `;

    const totalCount = Number(countResult[0].total);

    // Get paginated results
    const offset = (page - 1) * MAX_RESULTS_PER_PAGE;

    const result = await db.sql`
      SELECT player_id, name FROM player_names
      WHERE name LIKE ${searchPattern} COLLATE NOCASE
      ORDER BY name
      LIMIT ${MAX_RESULTS_PER_PAGE} OFFSET ${offset}
    `;

    const players = result.map((row: any) => ({
      id: row.player_id,
      name: row.name,
    }));

    return {
      players,
      totalCount,
    };
  } catch (error) {
    console.error(`Error searching for players by name '${search}':`, error);
    return {
      players: [],
      totalCount: 0,
    };
  }
}

async function getAllPlayers(
  db: any,
  page: number
): Promise<{
  entries: Array<{ id: string; name: string; lastUpdated: string }>;
  totalEntries: number;
  page: number;
  totalPages: number;
}> {
  try {
    // Get total count first
    const countResult = await db.sql`
      SELECT COUNT(*) as total FROM player_names
    `;

    let totalEntries = 0;
    if (countResult && countResult.rows && countResult.rows.length > 0) {
      totalEntries = Number(countResult.rows[0].total);
    }

    const totalPages = Math.ceil(totalEntries / MAX_RESULTS_PER_PAGE);

    // Get paginated results
    const offset = (page - 1) * MAX_RESULTS_PER_PAGE;

    const result = await db.sql`
      SELECT player_id, name, timestamp FROM player_names
      ORDER BY name
      LIMIT ${MAX_RESULTS_PER_PAGE} OFFSET ${offset}
    `;

    const entries: Array<{ id: string; name: string; lastUpdated: string }> = [];

    if (result && result.rows) {
      for (const row of result.rows) {
        entries.push({
          id: row.player_id,
          name: row.name,
          lastUpdated: new Date(Number(row.timestamp)).toISOString(),
        });
      }
    }

    return {
      entries,
      totalEntries,
      page,
      totalPages,
    };
  } catch (error) {
    console.error("Error retrieving all players:", error);
    return {
      entries: [],
      totalEntries: 0,
      page,
      totalPages: 0,
    };
  }
}

async function savePlayerName(db: any, playerId: string, name: string): Promise<void> {
  try {
    const timestamp = Date.now();

    // First check if the player exists
    const existingResult = await db.sql`
      SELECT 1 FROM player_names WHERE player_id = ${playerId}
    `;

    const exists = existingResult && existingResult.rows && existingResult.rows.length > 0;

    if (exists) {
      // Update existing player
      await db.sql`
        UPDATE player_names
        SET name = ${name}, timestamp = ${timestamp}
        WHERE player_id = ${playerId}
      `;
    } else {
      // Insert new player
      await db.sql`
        INSERT INTO player_names (player_id, name, timestamp)
        VALUES (${playerId}, ${name}, ${timestamp})
      `;
    }
  } catch (error) {
    console.error(`Error saving player name for ${playerId}:`, error);
    throw error;
  }
}

async function cleanExpiredEntries(db: any): Promise<number> {
  try {
    const expiryTimestamp = Date.now() - PLAYER_NAMES_CACHE_TTL;

    // SQLite doesn't support RETURNING clause, so we need to count first
    const countResult = await db.sql`
      SELECT COUNT(*) as count FROM player_names
      WHERE timestamp < ${expiryTimestamp}
    `;

    let count = 0;
    if (countResult && countResult.rows && countResult.rows.length > 0) {
      count = Number(countResult.rows[0].count);
    }

    // Then perform the delete
    await db.sql`
      DELETE FROM player_names
      WHERE timestamp < ${expiryTimestamp}
    `;

    return count;
  } catch (error) {
    console.error("Error cleaning expired entries:", error);
    return 0;
  }
}

// Helper validation functions
function validatePlayerId(playerId: string): boolean {
  return typeof playerId === "string" && (playerId.length === 32 || playerId.length === 36) && /^[0-9a-f-]+$/i.test(playerId);
}

function validatePlayerName(name: string): boolean {
  return typeof name === "string" && name.length >= 3 && name.length <= 16 && /^[a-zA-Z0-9_]+$/.test(name);
}

export default defineEventHandler(async (event: H3Event) => {
  const method = event.node.req.method || "GET";
  const db = useDatabase();

  // Initialize database if tables don't exist
  await initializeDatabase(db);

  // Handle POST request to add/update player name
  if (method === "POST") {
    try {
      const body = await readBody(event);
      const { playerId, name } = body;

      // Validate input
      if (!playerId || !name) {
        throw createError({
          statusCode: 400,
          message: "Both playerId and name are required",
        });
      }

      // Validate playerId format
      if (!validatePlayerId(playerId)) {
        throw createError({
          statusCode: 400,
          message: "Invalid playerId format",
        });
      }

      // Validate name format
      if (!validatePlayerName(name)) {
        throw createError({
          statusCode: 400,
          message: "Invalid player name format",
        });
      }

      // Check if update is needed
      const existingPlayer = await getPlayerById(db, playerId);
      if (!existingPlayer || existingPlayer.name !== name) {
        // Save to database
        await savePlayerName(db, playerId, name);
        console.log(`Updated name for player ${playerId}: ${name}`);
      } else {
        console.log(`Name for player ${playerId} unchanged: ${name}`);
      }

      return { success: true, message: "Player name updated" };
    } catch (error: any) {
      console.error("Error processing POST request:", error);

      throw createError({
        statusCode: error.statusCode || 500,
        message: error.message || "Error updating player name",
      });
    }
  }

  // Handle GET request to retrieve names
  if (method === "GET") {
    try {
      const query = getQuery(event);
      const search = query.search ? String(query.search).toLowerCase().trim() : "";
      const pageParam = query.page ? parseInt(String(query.page), 10) : 1;
      const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
      const idList = query.ids ? String(query.ids).split(",") : null;

      // Clean expired entries periodically (1% chance)
      if (Math.random() < 0.01) {
        const deletedCount = await cleanExpiredEntries(db);
        if (deletedCount > 0) {
          console.log(`Cleaned ${deletedCount} expired entries from player name cache`);
        }
      }

      // Specific ID lookup
      if (idList && idList.length > 0) {
        const result = await getPlayersByIds(db, idList);
        return result;
      }

      // Search by name
      if (search) {
        const result = await searchPlayersByName(db, search, page);

        // Set total results count header
        event.node.res.setHeader("X-Total-Count", result.totalCount.toString());

        return result.players;
      }

      // Return all names (paginated)
      const result = await getAllPlayers(db, page);

      // Set total results count header
      event.node.res.setHeader("X-Total-Count", result.totalEntries.toString());

      return result;
    } catch (error: any) {
      console.error("Error processing GET request:", error);

      throw createError({
        statusCode: error.statusCode || 500,
        message: error.message || "Error retrieving player names",
      });
    }
  }

  // Handle unsupported methods
  throw createError({
    statusCode: 405,
    message: "Method not allowed",
  });
});
