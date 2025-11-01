// src/app/core/services/ai/disambiguation/article-matcher.service.ts
import { Injectable } from '@angular/core';
import { Article } from '../../../models';
import { MIN_SIMILARITY_THRESHOLD } from '../ai-models';

/**
 * Article matching service for finding similar articles using fuzzy matching
 *
 * Provides similarity scoring based on:
 * - Exact matches (1.0)
 * - Substring matches (0.8)
 * - Levenshtein distance for fuzzy matching
 *
 * @example
 * ```typescript
 * const matcher = new ArticleMatcherService();
 * const similar = matcher.findSimilarArticles(articles, 'Milch', 'exclude-id-123');
 * // Returns top 3 matches above similarity threshold
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class ArticleMatcherService {

  /**
   * Finds similar articles based on fuzzy matching
   *
   * @param articles - Array of articles to search through
   * @param itemName - Search term for matching
   * @param excludeId - Optional article ID to exclude from results
   * @returns Array of articles with similarity scores, sorted by relevance
   *
   * @example
   * ```typescript
   * const results = matcher.findSimilarArticles(allArticles, 'Vollmilch', 'skip-123');
   * // Returns: [
   * //   { article: {...}, similarity: 0.95 },
   * //   { article: {...}, similarity: 0.85 }
   * // ]
   * ```
   */
  findSimilarArticles(articles: Article[], itemName: string, excludeId?: string) {
    const searchTerm = itemName.toLowerCase().trim();

    return articles
      .filter(article => article.id !== excludeId)
      .map(article => {
        const similarity = this.calculateArticleSimilarity(searchTerm, article.name.toLowerCase());
        return { article, similarity };
      })
      .filter(item => item.similarity >= MIN_SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
  }

  /**
   * Calculates similarity between search term and article name
   *
   * Uses three-tier matching:
   * 1. Exact match: 1.0
   * 2. Contains/substring match: 0.8
   * 3. Levenshtein distance: variable based on edit distance
   *
   * @param searchTerm - Normalized search string
   * @param articleName - Normalized article name
   * @returns Similarity score between 0.0 and 1.0
   *
   * @example
   * ```typescript
   * matcher.calculateArticleSimilarity('milch', 'milch'); // Returns 1.0 (exact)
   * matcher.calculateArticleSimilarity('milch', 'vollmilch'); // Returns 0.8 (contains)
   * matcher.calculateArticleSimilarity('melch', 'milch'); // Returns ~0.8 (Levenshtein)
   * ```
   */
  calculateArticleSimilarity(searchTerm: string, articleName: string): number {
    // Exact match
    if (articleName === searchTerm) return 1.0;

    // Contains match
    if (articleName.includes(searchTerm) || searchTerm.includes(articleName)) return 0.8;

    // Levenshtein similarity
    return this.calculateLevenshteinSimilarity(searchTerm, articleName);
  }

  /**
   * Calculates normalized Levenshtein similarity (0.0 to 1.0)
   *
   * Converts Levenshtein edit distance to similarity score by normalizing
   * against the length of the longer string.
   *
   * @param str1 - First string
   * @param str2 - Second string
   * @returns Similarity score: 1.0 (identical) to 0.0 (completely different)
   *
   * @example
   * ```typescript
   * matcher.calculateLevenshteinSimilarity('cat', 'cat'); // 1.0
   * matcher.calculateLevenshteinSimilarity('cat', 'cut'); // 0.67
   * matcher.calculateLevenshteinSimilarity('cat', 'dog'); // 0.0
   * ```
   */
  calculateLevenshteinSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLength);
  }

  /**
   * Calculates Levenshtein edit distance between two strings
   *
   * Uses dynamic programming to find minimum number of single-character edits
   * (insertions, deletions, substitutions) needed to transform str1 into str2.
   *
   * @param str1 - First string
   * @param str2 - Second string
   * @returns Edit distance (lower is more similar)
   *
   * @example
   * ```typescript
   * matcher.levenshteinDistance('kitten', 'sitting'); // Returns 3
   * matcher.levenshteinDistance('saturday', 'sunday'); // Returns 3
   * ```
   *
   * @see {@link https://en.wikipedia.org/wiki/Levenshtein_distance} for algorithm details
   */
  levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,      // deletion
          matrix[j - 1][i] + 1,      // insertion
          matrix[j - 1][i - 1] + indicator  // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}
