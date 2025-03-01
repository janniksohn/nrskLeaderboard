import { CACHE_FILE_PATH, playerNameCache } from "../api/players";
import { promises as fs } from "fs";
import { resolve } from "path";
import { saveNameCache } from "./saveNameCache";

export const loadNameCache = async () => {
  try {
    fs.mkdir(resolve(process.cwd(), "server/cache"), { recursive: true });

    const data = await fs.readFile(CACHE_FILE_PATH, "utf-8");
    Object.assign(playerNameCache, JSON.parse(data));
    console.log(`Spielernamen-Cache geladen mit ${Object.keys(playerNameCache).length} Einträgen`);
  } catch (error) {
    console.log("Keine Spielernamen-Cache-Datei gefunden oder Fehler beim Laden, erstelle einen neuen Cache");
    Object.keys(playerNameCache).forEach((key) => delete playerNameCache[key]);
    await saveNameCache(); // Leere Cache-Datei erstellen
  }
};
