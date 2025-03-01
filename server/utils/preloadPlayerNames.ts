import type { EventHandler, EventHandlerRequest } from "h3";
import { PlayerData, playerNameCache } from "../api/players";
import { saveNameCache } from "./saveNameCache";

export const preloadPlayerNames = async <T extends EventHandlerRequest, D>(handler: EventHandler<T, D>): Promise<EventHandler<T, D>> =>
  defineEventHandler<T>(async () => {
    console.log("Starte Preloading aller Spielernamen...");

    try {
      // Alle Spielerdaten laden
      let allPlayers: PlayerData[] = [];
      let currentPage = 1;
      let reachedEnd = false;

      while (currentPage <= 20 && !reachedEnd) {
        // Maximal 20 Seiten
        console.log(`Lade Spielerdaten für Seite ${currentPage}...`);

        try {
          const response = await fetch(`https://api.hglabor.de/stats/FFA/top?sort=kills&page=${currentPage}`, {
            headers: { accept: "*/*" },
          });

          if (!response.ok) {
            if (response.status === 404) {
              reachedEnd = true;
              continue;
            }
            throw new Error(`API-Fehler: ${response.status}`);
          }

          const pageData: PlayerData[] = await response.json();
          if (!Array.isArray(pageData) || pageData.length === 0) {
            reachedEnd = true;
            continue;
          }

          allPlayers = [...allPlayers, ...pageData];
          currentPage++;
        } catch (error) {
          console.error(`Fehler beim Laden von Seite ${currentPage}:`, error);
          reachedEnd = true;
        }
      }

      // Aktuellen Cache sichern
      const existingCache = { ...playerNameCache };
      let newNamesCount = 0;

      // Spielernamen für alle IDs laden, die noch nicht im Cache sind
      const batchSize = 10; // Anzahl der parallelen Anfragen
      const playerIds = allPlayers.map((p) => p.playerId).filter((id) => !existingCache[id]);

      console.log(`Lade Namen für ${playerIds.length} Spieler...`);

      for (let i = 0; i < playerIds.length; i += batchSize) {
        const batch = playerIds.slice(i, i + batchSize);
        const promises = batch.map(async (playerId) => {
          try {
            const response = await fetch(`https://api.minetools.eu/profile/${playerId}`);
            if (!response.ok) {
              return null;
            }

            const data = await response.json();
            if (data && data.decoded && data.decoded.profileName) {
              playerNameCache[playerId] = data.decoded.profileName;
              newNamesCount++;
              return { id: playerId, name: data.decoded.profileName };
            }
            return null;
          } catch (error) {
            console.error(`Fehler beim Laden des Namens für ${playerId}:`, error);
            return null;
          }
        });

        // Alle Anfragen in diesem Batch abwarten
        const results = await Promise.all(promises);
        console.log(`Batch ${i / batchSize + 1}/${Math.ceil(playerIds.length / batchSize)} abgeschlossen`);

        // Alle 100 Spieler speichern
        if (i % 100 === 0 && i > 0) {
          await saveNameCache();
          console.log(`Zwischenspeicherung: ${newNamesCount} neue Namen bisher`);
        }
      }

      // Cache speichern
      await saveNameCache();
      console.log(`Preloading abgeschlossen: ${newNamesCount} neue Spielernamen geladen.`);
    } catch (error) {
      console.error("Fehler beim Preloaden der Spielernamen:", error);
    }
  });
