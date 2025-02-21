export default defineEventHandler(async () => {
  const data = await useStorage("assets:server").getItem("dummy.json");
  return data;
});
