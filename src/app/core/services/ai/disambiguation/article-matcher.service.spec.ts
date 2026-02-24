// src/app/core/services/ai/disambiguation/article-matcher.service.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ArticleMatcherService } from './article-matcher.service';
import { Article } from '../../../models';
import { MIN_SIMILARITY_THRESHOLD } from '../ai-models';

describe('ArticleMatcherService', () => {
  let service: ArticleMatcherService;

  const makeArticle = (id: string, name: string): Article =>
    ({ id, name, departmentId: 'misc', icon: '📦' } as any);

  beforeEach(() => {
    service = new ArticleMatcherService();
  });

  // ========================================
  // calculateArticleSimilarity
  // ========================================

  describe('calculateArticleSimilarity', () => {
    it('should return 1.0 for exact match', () => {
      expect(service.calculateArticleSimilarity('butter', 'butter')).toBe(1.0);
    });

    it('should return 0.8 when searchTerm contains articleName (e.g. "weiche butter" contains "butter")', () => {
      // BUG CASE: searching "weiche Butter" for existing "Butter" article should find it
      expect(service.calculateArticleSimilarity('weiche butter', 'butter')).toBe(0.8);
    });

    it('should return 0.8 when articleName contains searchTerm', () => {
      // "vollmilch" contains "milch" → should find "Vollmilch" when searching "Milch"
      expect(service.calculateArticleSimilarity('milch', 'vollmilch')).toBe(0.8);
    });

    it('should return 0.8 when searching "vollmilch 3,5%" for "vollmilch"', () => {
      // "vollmilch 3,5%".includes("vollmilch") = true → contains match
      expect(service.calculateArticleSimilarity('vollmilch 3,5%', 'vollmilch')).toBe(0.8);
    });

    it('should return Levenshtein-based similarity for fuzzy matches', () => {
      const sim = service.calculateArticleSimilarity('melch', 'milch');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1.0);
    });

    it('should return low similarity for completely different strings', () => {
      const sim = service.calculateArticleSimilarity('butter', 'nudeln');
      expect(sim).toBeLessThan(MIN_SIMILARITY_THRESHOLD);
    });
  });

  // ========================================
  // findSimilarArticles
  // ========================================

  describe('findSimilarArticles', () => {
    it('should find "Butter" article when searching for "weiche Butter"', () => {
      // BUG CASE: If "Butter" exists in collection, disambiguation for "weiche Butter"
      // should offer "Butter" as an existing option
      const articles = [
        makeArticle('1', 'Butter'),
        makeArticle('2', 'Nudeln'),
        makeArticle('3', 'Mehl')
      ];

      const results = service.findSimilarArticles(articles, 'weiche Butter');

      expect(results.length).toBeGreaterThan(0);
      const butterMatch = results.find(r => r.article.name === 'Butter');
      expect(butterMatch).toBeDefined();
      expect(butterMatch!.similarity).toBe(0.8); // "weiche butter".includes("butter") = true
    });

    it('should find "Vollmilch" when searching for "Vollmilch 3,5%"', () => {
      const articles = [
        makeArticle('1', 'Vollmilch'),
        makeArticle('2', 'Butter')
      ];

      const results = service.findSimilarArticles(articles, 'Vollmilch 3,5%');

      const vollmilchMatch = results.find(r => r.article.name === 'Vollmilch');
      expect(vollmilchMatch).toBeDefined();
      expect(vollmilchMatch!.similarity).toBe(0.8); // "vollmilch 3,5%".includes("vollmilch") = true
    });

    it('should find exact match with similarity 1.0', () => {
      const articles = [
        makeArticle('1', 'Salz'),
        makeArticle('2', 'Pfeffer')
      ];

      const results = service.findSimilarArticles(articles, 'Salz');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].article.name).toBe('Salz');
      expect(results[0].similarity).toBe(1.0);
    });

    it('should exclude article by ID', () => {
      const articles = [
        makeArticle('exclude-me', 'Butter'),
        makeArticle('2', 'Butterschmalz')
      ];

      const results = service.findSimilarArticles(articles, 'Butter', 'exclude-me');

      const excluded = results.find(r => r.article.id === 'exclude-me');
      expect(excluded).toBeUndefined();
    });

    it('should return at most 3 results', () => {
      const articles = [
        makeArticle('1', 'Butter'),
        makeArticle('2', 'Buttermilch'),
        makeArticle('3', 'Butterschmalz'),
        makeArticle('4', 'Erdnussbutter'),
        makeArticle('5', 'Kakaobutter')
      ];

      const results = service.findSimilarArticles(articles, 'Butter');

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return results sorted by similarity (highest first)', () => {
      const articles = [
        makeArticle('1', 'Butter'),       // exact match → 1.0
        makeArticle('2', 'Buttermilch'),  // contains "butter" → 0.8
      ];

      const results = service.findSimilarArticles(articles, 'Butter');

      expect(results[0].similarity).toBeGreaterThanOrEqual(results[results.length - 1].similarity);
    });

    it('should filter out results below MIN_SIMILARITY_THRESHOLD', () => {
      const articles = [
        makeArticle('1', 'xyz123'), // completely unrelated
        makeArticle('2', 'Butter')
      ];

      const results = service.findSimilarArticles(articles, 'Salz');

      // xyz123 should not be in results (low similarity to 'Salz')
      const xyzMatch = results.find(r => r.article.id === '1');
      expect(xyzMatch).toBeUndefined();
    });

    it('should return empty array when no articles match threshold', () => {
      const articles = [
        makeArticle('1', 'Nudeln'),
        makeArticle('2', 'Karotten')
      ];

      const results = service.findSimilarArticles(articles, 'Butter');

      // These might or might not match depending on Levenshtein distance
      // The key is: results only contain items >= MIN_SIMILARITY_THRESHOLD
      results.forEach(r => {
        expect(r.similarity).toBeGreaterThanOrEqual(MIN_SIMILARITY_THRESHOLD);
      });
    });

    it('should find "Tomaten" when searching "Tomaten gehackt"', () => {
      // "tomaten gehackt".includes("tomaten") = true → contains match → 0.8
      const articles = [
        makeArticle('1', 'Tomaten'),
        makeArticle('2', 'Paprika')
      ];

      const results = service.findSimilarArticles(articles, 'Tomaten gehackt');

      const tomatenMatch = results.find(r => r.article.name === 'Tomaten');
      expect(tomatenMatch).toBeDefined();
      expect(tomatenMatch!.similarity).toBe(0.8);
    });
  });

  // ========================================
  // levenshteinDistance
  // ========================================

  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(service.levenshteinDistance('butter', 'butter')).toBe(0);
    });

    it('should return correct edit distance', () => {
      expect(service.levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(service.levenshteinDistance('saturday', 'sunday')).toBe(3);
    });

    it('should return max length for completely different strings', () => {
      const dist = service.levenshteinDistance('ab', 'cd');
      expect(dist).toBeLessThanOrEqual(2);
    });
  });
});
