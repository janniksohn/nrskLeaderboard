// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: true },
  modules: [
    "@nuxt/ui",
    "@pinia/nuxt",
    "@nuxt/image",
    "@nuxthub/core",
  ],

  image: {
    provider: "ipx",
    domains: ["http://textures.minecraft.net"],
    alias: {
      texture: "http://textures.minecraft.net/texture",
    },
  },

  css: ["~/assets/css/main.css"],
});