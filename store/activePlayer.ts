import { defineStore } from "pinia";
import type { FFAPlayer } from "~/types/player";

export const useActivePlayerStore = defineStore("ActivePlayer", () => {
  const activePlayer = ref<FFAPlayer | null>(null);

  const setActivePlayer = (player: (FFAPlayer | null) | Ref<FFAPlayer | null>) => (isRef(player) ? (activePlayer.value = player.value) : (activePlayer.value = player));

  return {
    player: activePlayer,
    setActivePlayer,
  };
});
