export const usePaginationCount = (fetchFunction: (page: number, search?: string) => Promise<{ data: any[]; headers: Headers }>) => {
  const totalPages = ref<number | null>(null);
  const isCountingPages = ref(false);
  const isLoading = ref(false);
  const totalFilteredCount = ref<number | null>(null);

  // Ermittelt die Gesamtzahl der Seiten
  const countTotalPages = async (searchTerm: string = ""): Promise<number | null> => {
    if (searchTerm && totalFilteredCount.value !== null) {
      // Wenn wir bereits eine gefilterte Gesamtzahl haben, berechne die Seiten
      return Math.ceil(totalFilteredCount.value / 25); // 25 = pageSize
    }

    // Bei neuer Suche oder wenn noch keine Seiten bekannt sind
    if (searchTerm || totalPages.value === null) {
      totalPages.value = null;
    } else if (totalPages.value !== null && !searchTerm) {
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
          const response = await fetchFunction(high, searchTerm);

          // Prüfe, ob wir einen Header mit der Gesamtzahl bekommen haben
          const totalCount = response.headers.get("X-Total-Count");
          if (totalCount) {
            const count = parseInt(totalCount);
            totalFilteredCount.value = count;
            const pages = Math.ceil(count / 25); // 25 = pageSize
            totalPages.value = pages;
            return pages;
          }

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
          await fetchFunction(mid, searchTerm);
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
    totalFilteredCount,
    isCountingPages,
    isLoading,
    countTotalPages,
  };
};
