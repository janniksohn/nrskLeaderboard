import type { EventHandler, EventHandlerRequest } from "h3";
import { CACHE_FILE_PATH, playerNameCache } from "../api/players";
import { promises as fs } from "fs";
import { resolve } from "path";

export const saveNameCache = async <T extends EventHandlerRequest, D>(): Promise<EventHandler<T, D>> =>
  defineEventHandler<T>(async () => {
    try {
      await fs.mkdir(resolve(process.cwd(), "server/cache"), { recursive: true });

      await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(playerNameCache, null, 2));
    } catch (error) {
      console.error("Fehler beim Speichern des Spielernamen-Caches:", error);
    }
  });
