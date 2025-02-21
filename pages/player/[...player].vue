<script setup lang="ts">
import { useActivePlayerStore } from "~/store/activePlayer";
import type { MinecraftProfileResponse } from "~/types/minecraftApi";
import type { FFAPlayer } from "~/types/player";

const notFound = ref(false);

if (!useActivePlayerStore().player) {
  const { data } = await useAsyncData<Omit<FFAPlayer, "id"> & { playerId: string }>("profile", () => $fetch(`https://api.hglabor.de/stats/ffa/${useRoute().params.player[0]}`));

  notFound.value = !data.value;

  if (data.value) {
    const player = {
      ...data.value,
      id: data.value.playerId,
    };

    await $fetch<MinecraftProfileResponse>(`https://api.minetools.eu/profile/${player.id}`).then((response) => {
      player.name = response.decoded.profileName;
      console.log(response);
      useActivePlayerStore().setActivePlayer(player);
    });

    useActivePlayerStore().setActivePlayer(player);
  }
}

const player = useActivePlayerStore().player;
</script>

<template>
  <div v-if="notFound">
    <h1>Player not found</h1>
  </div>
  <div v-if="player">
    <h1>{{ player.name }}</h1>
    <p>{{ player.kills }} kills</p>
    <p>{{ player.deaths }} deaths</p>
    <p>{{ player.xp }} xp</p>
  </div>
</template>
