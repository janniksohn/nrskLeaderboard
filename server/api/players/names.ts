import { savePlayerName } from "~/server/utils/savePlayerName";
import { playerNameCache } from ".";

export default defineEventHandler(async (event) => {
  const method = event.node.req.method || "GET";

  if (method === "POST") {
    const body = await readBody(event);
    const { playerId, name } = body;

    if (!playerId || !name) {
      throw createError({
        statusCode: 400,
        message: "PlayerId und Name sind erforderlich",
      });
    }

    await savePlayerName(playerId, name);
    return { success: true };
  }

  // GET-Anfrage zum Abrufen von Namen
  if (method === "GET") {
    const query = getQuery(event);
    const search = query.search ? String(query.search).toLowerCase() : "";

    if (search) {
      // Nach Namen suchen
      const matchingIds = Object.entries(playerNameCache)
        .filter(([_, name]) => name.toLowerCase().includes(search))
        .map(([id]) => id);

      return matchingIds;
    }

    // Alle Namen zurückgeben
    return playerNameCache;
  }

  throw createError({
    statusCode: 405,
    message: "Methode nicht erlaubt",
  });
});
