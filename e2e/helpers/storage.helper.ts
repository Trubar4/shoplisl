import { Page } from '@playwright/test';

/**
 * Storage helper for inspecting localStorage and IndexedDB
 */

/**
 * Get all items from localStorage
 */
export async function getLocalStorage(page: Page): Promise<Record<string, string>> {
  return await page.evaluate(() => {
    const items: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        items[key] = localStorage.getItem(key) || '';
      }
    }
    return items;
  });
}

/**
 * Get a specific item from localStorage
 */
export async function getLocalStorageItem(page: Page, key: string): Promise<string | null> {
  return await page.evaluate((k) => localStorage.getItem(k), key);
}

/**
 * Set an item in localStorage
 */
export async function setLocalStorageItem(page: Page, key: string, value: string): Promise<void> {
  await page.evaluate(
    ({ k, v }) => localStorage.setItem(k, v),
    { k: key, v: value }
  );
}

/**
 * Clear localStorage
 */
export async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
}

/**
 * Get all article IDs from a list in IndexedDB cache
 */
export async function getListArticleIdsFromCache(
  page: Page,
  listId: string
): Promise<string[]> {
  return await page.evaluate((id) => {
    return new Promise<string[]>((resolve) => {
      const request = indexedDB.open('ShopLislCache', 1);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['lists'], 'readonly');
        const store = transaction.objectStore('lists');
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
          const list = getRequest.result;
          resolve(list ? list.articleIds : []);
        };

        getRequest.onerror = () => resolve([]);
      };

      request.onerror = () => resolve([]);
    });
  }, listId);
}

/**
 * Check if an article with temp ID exists in IndexedDB cache
 */
export async function hasTempArticleInCache(page: Page, tempIdPrefix: string = 'temp_'): Promise<boolean> {
  return await page.evaluate((prefix) => {
    return new Promise<boolean>((resolve) => {
      const request = indexedDB.open('ShopLislCache', 1);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['articles'], 'readonly');
        const store = transaction.objectStore('articles');
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = () => {
          const articles = getAllRequest.result;
          const hasTempArticle = articles.some((article: any) =>
            article.id && article.id.startsWith(prefix)
          );
          resolve(hasTempArticle);
        };

        getAllRequest.onerror = () => resolve(false);
      };

      request.onerror = () => resolve(false);
    });
  }, tempIdPrefix);
}

/**
 * Get count of articles with temp IDs in cache
 */
export async function getTempArticleCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      const request = indexedDB.open('ShopLislCache', 1);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['articles'], 'readonly');
        const store = transaction.objectStore('articles');
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = () => {
          const articles = getAllRequest.result;
          const tempCount = articles.filter((article: any) =>
            article.id && article.id.startsWith('temp_')
          ).length;
          resolve(tempCount);
        };

        getAllRequest.onerror = () => resolve(0);
      };

      request.onerror = () => resolve(0);
    });
  });
}
