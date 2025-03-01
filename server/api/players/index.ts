import { H3Event } from "h3";
import { resolve } from "path";
import { loadNameCache } from "~/server/utils/loadNameCache";
import { preloadPlayerNames } from "~/server/utils/preloadPlayerNames";

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
}

interface PlayerNameCache {
  [playerId: string]: string;
}

// Pfad zur Cache-Datei
export const CACHE_FILE_PATH = resolve(process.cwd(), "server/cache/player-names.json");

// Cache für die Spielerdaten
const dataCache: {
  data: PlayerData[];
  timestamp: number;
  sort: string;
} = {
  data: [],
  timestamp: 0,
  sort: "",
};

// Cache für Spielernamen
export let playerNameCache: PlayerNameCache = {};

// Gültigkeit des Caches (5 Minuten)
const CACHE_TTL = 5 * 60 * 1000;

export default defineEventHandler(async (event: H3Event) => {
  await loadNameCache();
  setTimeout(preloadPlayerNames, 1000);

  // Hauptlogik für Spielerdaten
  const query = getQuery(event) as QueryParams;

  // Pagination-Parameter extrahieren
  const page = query.page ? Number(query.page) : 1;
  const limit = query.limit ? Number(query.limit) : 100;
  const fullSort = query.fullSort === "true"; // Prüfen, ob vollständige Sortierung angefordert wurde
  const search = query.search ? decodeURIComponent(query.search) : ""; // Suchbegriff extrahieren

  // Sortierung aus der Anfrage extrahieren
  const sort = query.sort || "kills";
  const direction = query.direction || "desc";

  try {
    // Für vollständige Sortierung über alle Seiten
    if (fullSort) {
      // Cache-Key aus Sortierparametern erstellen
      const cacheKey = `${sort}`;
      const now = Date.now();

      // Wenn wir gültige Cache-Daten haben, verwenden wir diese
      if (dataCache.data.length > 0 && dataCache.sort === cacheKey && now - dataCache.timestamp < CACHE_TTL) {
        console.log("Verwende Cache-Daten für Sortierung:", cacheKey);

        // Sortieren der Cache-Daten nach Richtung
        const sortedData = direction === "asc" ? sortData([...dataCache.data], sort, "asc") : sortData([...dataCache.data], sort, "desc");

        // Filterung anwenden, wenn ein Suchbegriff angegeben wurde
        let filteredData = sortedData;
        if (search) {
          filteredData = filterData(sortedData, search);
        }

        // Gesamtzahl der gefilterten Ergebnisse in Header setzen
        event.node.res.setHeader("X-Total-Count", filteredData.length.toString());

        // Paginierung anwenden
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        if (startIndex >= filteredData.length) {
          // Wenn die Seite außerhalb des Bereichs ist, leeres Array zurückgeben
          return [];
        }

        return filteredData.slice(startIndex, endIndex);
      }

      // Keine Cache-Daten, also alle Seiten abrufen
      console.log("Hole alle Daten für vollständige Sortierung nach", sort);

      // Maximal 20 Seiten holen (konfigurierbar je nach Datenmenge)
      const MAX_PAGES = 20;
      let allData: PlayerData[] = [];
      let currentPage = 1;
      let reachedEnd = false;

      while (currentPage <= MAX_PAGES && !reachedEnd) {
        console.log(`Hole Seite ${currentPage} von maximal ${MAX_PAGES}`);

        const pageResponse = await fetch(`https://api.hglabor.de/stats/FFA/top?sort=${sort}&page=${currentPage}`, {
          headers: { accept: "*/*" },
        });

        // 404 bedeutet, wir haben das Ende erreicht
        if (pageResponse.status === 404) {
          reachedEnd = true;
          continue;
        }

        if (!pageResponse.ok) {
          console.error(`Fehler beim Abrufen von Seite ${currentPage}: ${pageResponse.status}`);
          break;
        }

        const pageData: PlayerData[] = await pageResponse.json();

        if (!Array.isArray(pageData) || pageData.length === 0) {
          reachedEnd = true;
          continue;
        }

        allData = [...allData, ...pageData];
        allData.map((player, i) => {
          player.index = i + 1;
          return player;
        });

        // Wenn wir weniger als die angeforderten Einträge erhalten, haben wir das Ende erreicht
        if (pageData.length < limit) {
          reachedEnd = true;
        }

        currentPage++;
      }

      // Cache aktualisieren
      dataCache.data = allData;
      dataCache.timestamp = now;
      dataCache.sort = cacheKey;

      // Sortieren entsprechend der Richtung
      const sortedData = direction === "asc" ? sortData(allData, sort, "asc") : sortData(allData, sort, "desc");

      // Filterung anwenden, wenn ein Suchbegriff angegeben wurde
      let filteredData = sortedData;
      if (search) {
        filteredData = filterData(sortedData, search);
      }

      // Gesamtzahl der gefilterten Ergebnisse in Header setzen
      event.node.res.setHeader("X-Total-Count", filteredData.length.toString());

      // Paginierung anwenden
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;

      if (startIndex >= filteredData.length) {
        // Wenn die Seite außerhalb des Bereichs ist, leeres Array zurückgeben
        return [];
      }

      return filteredData.slice(startIndex, endIndex);
    } else {
      // Ursprüngliche Logik für die Sortierung nur auf der aktuellen Seite
      const response = await fetch(`https://api.hglabor.de/stats/FFA/top?sort=${sort}&page=${page}${limit ? `&limit=${limit}` : ""}`, {
        headers: { accept: "*/*" },
      });

      if (!response.ok) {
        const error = await response.text();
        if (response.status === 404) {
          throw createError({
            statusCode: 404,
            message: `Seite ${page} nicht gefunden`,
          });
        }

        throw createError({
          statusCode: response.status,
          message: `API-Fehler: ${error}`,
        });
      }

      const data: PlayerData[] = await response.json();
      data.map((player, i) => {
        player.index = i + 1;
        return player;
      });

      if (direction === "asc" && Array.isArray(data)) {
        return sortData(data, sort, "asc");
      }

      return data;
    }
  } catch (error: any) {
    if (error.statusCode === 404) {
      throw createError({
        statusCode: 404,
        message: error.message,
      });
    }

    console.error("Fehler beim Abrufen der Spielerdaten:", error);
    throw createError({
      statusCode: 500,
      message: "Fehler beim Abrufen der Spielerdaten",
    });
  }
});

// Hilfsfunktion zum Sortieren der Daten
function sortData(data: PlayerData[], sortKey: string, direction: "asc" | "desc"): PlayerData[] {
  if (!Array.isArray(data)) return data;

  return [...data].sort((a: PlayerData, b: PlayerData): number => {
    // Stelle sicher, dass die Werte vergleichbar sind
    const valueA = a[sortKey] !== undefined ? a[sortKey] : 0;
    const valueB = b[sortKey] !== undefined ? b[sortKey] : 0;

    let comparison = 0;
    if (typeof valueA === "number" && typeof valueB === "number") {
      comparison = valueA - valueB;
    } else {
      comparison = String(valueA).localeCompare(String(valueB));
    }

    // Bei absteigender Sortierung Ergebnis umkehren
    return direction === "asc" ? comparison : -comparison;
  });
}

// Erweiterte Filterfunktion, die auch Namen berücksichtigt
function filterData(data: PlayerData[], search: string): PlayerData[] {
  if (!Array.isArray(data) || !search.trim()) return data;

  const searchTerm = search.toLowerCase().trim();
  const isNumeric = !isNaN(Number(searchTerm));
  const searchNumber = isNumeric ? Number(searchTerm) : null;

  // Nach Namen im Cache suchen
  const matchingPlayerIds = Object.entries(playerNameCache)
    .filter(([_, name]) => name.toLowerCase().includes(searchTerm))
    .map(([id]) => id);

  return data.filter((player) => {
    // Suche nach Spieler-ID/UUID
    if (player.playerId && player.playerId.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // Suche nach Namen aus dem Cache
    if (matchingPlayerIds.includes(player.playerId)) {
      return true;
    }

    // Suche nach numerischen Werten
    if (isNumeric && searchNumber !== null) {
      return (
        player.kills === searchNumber ||
        player.deaths === searchNumber ||
        player.xp === searchNumber ||
        (player.bounty !== undefined && player.bounty === searchNumber) ||
        (player.currentKillStreak !== undefined && player.currentKillStreak === searchNumber) ||
        (player.highestKillStreak !== undefined && player.highestKillStreak === searchNumber)
      );
    }

    return false;
  });
}
