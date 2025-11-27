import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { ArticleStatsService } from './article-stats.service';
import { ShoppingList } from '../models';

describe('ArticleStatsService', () => {
  let service: ArticleStatsService;
  let storeMock: any;

  const mockLists: ShoppingList[] = [
    {
      id: 'list1',
      name: 'Groceries',
      articleIds: ['article1', 'article2'],
      itemStates: {
        'article1': {
          articleId: 'article1',
          isChecked: true,
          amount: '2L',
          checkedAt: new Date('2025-11-22T10:30:00'),
          checkedBy: 'user1',
          history: [
            {
              timestamp: new Date('2025-11-22T10:30:00'),
              userId: 'user1',
              userName: 'Du',
              action: 'checked',
              amount: '2L'
            },
            {
              timestamp: new Date('2025-11-20T14:00:00'),
              userId: 'user1',
              userName: 'Du',
              action: 'checked',
              amount: '1L'
            }
          ]
        },
        'article2': {
          articleId: 'article2',
          isChecked: false,
          amount: '1kg'
        }
      },
      departmentOrder: [],
      createdAt: new Date('2025-11-15T10:00:00'),
      updatedAt: new Date('2025-11-22T10:30:00')
    },
    {
      id: 'list2',
      name: 'Shopping',
      articleIds: ['article1', 'article3'],
      itemStates: {
        'article1': {
          articleId: 'article1',
          isChecked: true,
          amount: '1L',
          checkedAt: new Date('2025-11-21T15:00:00'),
          checkedBy: 'user1',
          history: [
            {
              timestamp: new Date('2025-11-21T15:00:00'),
              userId: 'user1',
              userName: 'Du',
              action: 'checked',
              amount: '1L'
            }
          ]
        },
        'article3': {
          articleId: 'article3',
          isChecked: false,
          amount: ''
        }
      },
      departmentOrder: [],
      createdAt: new Date('2025-11-18T12:00:00'),
      updatedAt: new Date('2025-11-21T15:00:00')
    }
  ];

  beforeEach(() => {
    storeMock = {
      select: vi.fn(() => of(mockLists))
    };

    service = new ArticleStatsService(storeMock);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should get stats for a specific article', async () => {
    const stats = await firstValueFrom(service.getArticleStats('article1'));

    expect(stats.articleId).toBe('article1');
    expect(stats.numberOfChecks).toBe(3); // 2 from list1 + 1 from list2
    expect(stats.lastCheckedDate).toBeDefined();
    expect(stats.lastCheckedDate?.getTime()).toBe(new Date('2025-11-22T10:30:00').getTime());
  });

  it('should get stats for all articles', async () => {
    const statsMap = await firstValueFrom(service.getAllArticleStats());

    expect(statsMap.size).toBeGreaterThan(0);

    const article1Stats = statsMap.get('article1');
    expect(article1Stats).toBeDefined();
    expect(article1Stats?.numberOfChecks).toBe(3);

    const article2Stats = statsMap.get('article2');
    expect(article2Stats).toBeDefined();
    expect(article2Stats?.numberOfChecks).toBe(0); // No history

    const article3Stats = statsMap.get('article3');
    expect(article3Stats).toBeDefined();
    expect(article3Stats?.numberOfChecks).toBe(0);
  });

  it('should calculate correct last checked date across lists', async () => {
    const stats = await firstValueFrom(service.getArticleStats('article1'));

    // Should use the most recent check from list1 (2025-11-22)
    expect(stats.lastCheckedDate).toBeDefined();
    expect(stats.lastCheckedDate?.toISOString()).toBe(new Date('2025-11-22T10:30:00').toISOString());
  });

  it('should calculate correct number of checks', async () => {
    const stats = await firstValueFrom(service.getArticleStats('article1'));

    // 2 checks in list1 history + 1 check in list2 history = 3 total
    expect(stats.numberOfChecks).toBe(3);
  });

  it('should handle article with no history', async () => {
    const stats = await firstValueFrom(service.getArticleStats('article2'));

    expect(stats.articleId).toBe('article2');
    expect(stats.numberOfChecks).toBe(0);
    expect(stats.lastCheckedDate).toBeUndefined();
  });

  it('should handle article not in any list', async () => {
    const stats = await firstValueFrom(service.getArticleStats('nonexistent'));

    expect(stats.articleId).toBe('nonexistent');
    expect(stats.numberOfChecks).toBe(0);
    expect(stats.lastCheckedDate).toBeUndefined();
    expect(stats.lastAddedToListDate).toBeUndefined();
  });

  it('should set lastAddedToListDate based on list creation', async () => {
    const stats = await firstValueFrom(service.getArticleStats('article1'));

    expect(stats.lastAddedToListDate).toBeDefined();
    // Should be the most recent list createdAt where article is present
  });
});
