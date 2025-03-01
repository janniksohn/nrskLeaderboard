import type { EventHandler, EventHandlerRequest } from "h3";
import { playerNameCache } from "../api/players";
import { saveNameCache } from "./saveNameCache";

export const savePlayerName = async <T extends EventHandlerRequest, D>(playerId: string, name: string, handler?: EventHandler<T, D>): Promise<EventHandler<T, D>> =>
  defineEventHandler<T>(async () => {
    if (playerNameCache[playerId] !== name) {
      playerNameCache[playerId] = name;
      // Datei nicht bei jeder Änderung speichern, sondern einen Debounce verwenden
      if (!savePlayerName.debounceTimer) {
        savePlayerName.debounceTimer = setTimeout(async () => {
          await saveNameCache();
          savePlayerName.debounceTimer = null;
        }, 5000); // Alle 5 Sekunden speichern, wenn Änderungen vorliegen
      }
    }
  });

savePlayerName.debounceTimer = null as NodeJS.Timeout | null;
