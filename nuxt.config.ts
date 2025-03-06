// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: true },
  modules: ["@nuxt/ui", "@pinia/nuxt", "@nuxt/image", "@nuxthub/core"],

  image: {
    provider: "ipx",
    domains: ["http://textures.minecraft.net"],
    alias: {
      texture: "http://textures.minecraft.net/texture",
    },
  },

  css: ["~/assets/css/main.css"],

  nitro: {
    experimental: {
      database: true,
    },

    database: {
      default: {
        connector: "libsql",
        options: {
          url: "libsql://nrskcache-janniksohn.turso.io",
          authToken: process.env.TURSO_AUTH_TOKEN,
        },
      },
    },

    devDatabase: {
      default: {
        connector: "bun-sqlite",
        options: {
          name: "database",
        },
      },
    },
  },
});
