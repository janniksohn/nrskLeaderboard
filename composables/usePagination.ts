export const usePaginationCount = (fetchFunction: (page: number) => Promise<any[]>) => {
  const totalPages = ref<number | null>(null);
  const isCountingPages = ref(false);
  const isLoading = ref(false);

  // Ermittelt die Gesamtzahl der Seiten
  const countTotalPages = async (): Promise<number | null> => {
    if (totalPages.value !== null) {
      return totalPages.value;
    }

    if (isCountingPages.value) {
      return null; // Bereits beim Zählen
    }

    isCountingPages.value = true;
    isLoading.value = true;

    try {
      let low = 1;
      let high = 20; // Starte mit einer höheren Schätzung

      // Finde eine obere Grenze, die definitiv nicht existiert
      while (true) {
        try {
          await fetchFunction(high);
          low = high; // Diese Seite existiert noch
          high = high * 2; // Verdoppeln für nächsten Versuch
        } catch (error) {
          // Seite existiert nicht, high ist jetzt eine obere Grenze
          break;
        }
      }

      // Binäre Suche zur Ermittlung der letzten gültigen Seite
      while (low + 1 < high) {
        const mid = Math.floor((low + high) / 2);
        try {
          await fetchFunction(mid);
          low = mid; // Wenn erfolgreich, setze low auf mid
        } catch (error) {
          high = mid; // Wenn 404, setze high auf mid
        }
      }

      // Low ist jetzt die letzte bekannte gültige Seite
      totalPages.value = low;
      return low;
    } catch (error) {
      console.error("Error counting pages:", error);
      return null;
    } finally {
      isCountingPages.value = false;
      isLoading.value = false;
    }
  };

  return {
    totalPages,
    isCountingPages,
    isLoading,
    countTotalPages,
  };
};
