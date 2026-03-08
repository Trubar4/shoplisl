import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { DataService } from './data.service';
import { AnalyticsEventType } from '../models/analytics.model';

describe('DataService - ARTICLE_MOVED_BETWEEN_LISTS Analytics', () => {
  let service: DataService;
  let analyticsServiceMock: any;
  let authServiceMock: any;
  let listsRepoMock: any;
  let loggerMock: any;

  beforeEach(() => {
    analyticsServiceMock = {
      trackEvent: vi.fn(),
    };

    authServiceMock = {
      getCurrentUserId: vi.fn().mockReturnValue('user-1'),
    };

    listsRepoMock = {
      addMultipleArticlesToList: vi.fn().mockReturnValue(of(true)),
      markMultipleArticlesAsChecked: vi.fn().mockReturnValue(of(true)),
    };

    loggerMock = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Construct service with mocks — DataService has many deps, mock the ones needed
    service = new DataService(
      {} as any,         // firebaseData
      {} as any,         // offlineSync
      {} as any,         // articlesRepo
      listsRepoMock,     // listsRepo
      {} as any,         // migration
      {} as any,         // connectionService
      {} as any,         // cacheService
      loggerMock,        // logger
      authServiceMock,   // authService
      analyticsServiceMock // analyticsService
    );
  });

  it('should track ARTICLE_MOVED_BETWEEN_LISTS on successful move', async () => {
    const result = await firstValueFrom(
      service.moveArticlesBetweenLists(['a1', 'a2'], 'source-list', 'target-list')
    );

    expect(result.success).toBe(true);
    expect(analyticsServiceMock.trackEvent).toHaveBeenCalledWith(
      'user-1',
      AnalyticsEventType.ARTICLE_MOVED_BETWEEN_LISTS,
      {
        sourceListId: 'source-list',
        targetListId: 'target-list',
        count: 2,
        articleIds: ['a1', 'a2'],
      }
    );
  });

  it('should not track when move fails at add phase', async () => {
    listsRepoMock.addMultipleArticlesToList.mockReturnValue(
      of(false).pipe() // Will be caught by catchError in the service — but it doesn't throw
    );

    // The service catches errors, so let's simulate an actual error
    const { throwError } = await import('rxjs');
    listsRepoMock.addMultipleArticlesToList.mockReturnValue(
      throwError(() => new Error('Add failed'))
    );

    const result = await firstValueFrom(
      service.moveArticlesBetweenLists(['a1'], 'source-list', 'target-list')
    );

    // The move continues but marks as checked fails gracefully
    // The trackSuccess function checks errors.length === 0
    expect(result.success).toBe(false);
    expect(analyticsServiceMock.trackEvent).not.toHaveBeenCalled();
  });

  it('should not track when articleIds is empty', async () => {
    const result = await firstValueFrom(
      service.moveArticlesBetweenLists([], 'source-list', 'target-list')
    );

    expect(result.success).toBe(true);
    expect(analyticsServiceMock.trackEvent).not.toHaveBeenCalled();
  });

  it('should not track when user is not authenticated', async () => {
    authServiceMock.getCurrentUserId.mockReturnValue(null);

    const result = await firstValueFrom(
      service.moveArticlesBetweenLists(['a1'], 'source-list', 'target-list')
    );

    expect(result.success).toBe(true);
    expect(analyticsServiceMock.trackEvent).not.toHaveBeenCalled();
  });

  it('should track on successful move without checking source list', async () => {
    const result = await firstValueFrom(
      service.moveArticlesBetweenLists(['a1'], 'source-list', 'target-list', false)
    );

    expect(result.success).toBe(true);
    expect(analyticsServiceMock.trackEvent).toHaveBeenCalledWith(
      'user-1',
      AnalyticsEventType.ARTICLE_MOVED_BETWEEN_LISTS,
      expect.objectContaining({
        sourceListId: 'source-list',
        targetListId: 'target-list',
      })
    );
  });
});
