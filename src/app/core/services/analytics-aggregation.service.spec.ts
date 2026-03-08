import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsEventType } from '../models/analytics.model';

// Mock Firestore
const mockGetDocs = vi.fn();
const mockCollection = vi.fn().mockReturnValue('events-ref');
const mockCollectionGroup = vi.fn().mockReturnValue('group-ref');
const mockQuery = vi.fn().mockReturnValue('query-ref');
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockTimestampFromDate = vi.fn().mockReturnValue('mock-timestamp');

vi.mock('@angular/fire/firestore', () => ({
  Firestore: vi.fn(),
  collection: (...args: any[]) => mockCollection(...args),
  collectionGroup: (...args: any[]) => mockCollectionGroup(...args),
  query: (...args: any[]) => mockQuery(...args),
  where: (...args: any[]) => mockWhere(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  limit: (...args: any[]) => mockLimit(...args),
  orderBy: (...args: any[]) => mockOrderBy(...args),
  Timestamp: { fromDate: (...args: any[]) => mockTimestampFromDate(...args) },
}));

import { AnalyticsAggregationService, OverviewMetrics } from './analytics-aggregation.service';
import { firstValueFrom } from 'rxjs';

describe('AnalyticsAggregationService - Sharing Metrics', () => {
  let service: AnalyticsAggregationService;

  const now = new Date();

  function makeEvent(eventType: string, metadata?: Record<string, any>) {
    return {
      id: `evt-${Math.random().toString(36).slice(2)}`,
      eventType,
      userId: 'user-1',
      timestamp: { toDate: () => now },
      metadata,
    };
  }

  function mockEventsSnapshot(events: any[]) {
    return {
      docs: events.map((e) => ({
        id: e.id,
        data: () => e,
      })),
      size: events.length,
    };
  }

  function mockEmptySnapshot() {
    return { docs: [], size: 0 };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    // Use Object.create to bypass inject() field initializers
    service = Object.create(AnalyticsAggregationService.prototype);

    // Manually set the private fields that inject() would have set
    (service as any).firestore = {};
    (service as any).quotaMonitor = { trackRead: vi.fn() };
    (service as any).aiCachingService = { getStats: vi.fn().mockReturnValue({ hitRate: 50 }) };
    (service as any).logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    (service as any).cache = new Map();
    (service as any).CACHE_DURATION = 5 * 60 * 1000;
  });

  describe('sharing metrics computation', () => {
    it('should compute shareAcceptanceRate from real events', async () => {
      const events = [
        makeEvent(AnalyticsEventType.SHARE_INVITE_CREATED, { listId: 'list-1', fromUserId: 'user-1' }),
        makeEvent(AnalyticsEventType.SHARE_INVITE_CREATED, { listId: 'list-2', fromUserId: 'user-1' }),
        makeEvent(AnalyticsEventType.SHARE_INVITE_CREATED, { listId: 'list-3', fromUserId: 'user-1' }),
        makeEvent(AnalyticsEventType.SHARE_INVITE_ACCEPTED, { listId: 'list-1', inviteId: 'inv-1' }),
        makeEvent(AnalyticsEventType.SHARE_INVITE_ACCEPTED, { listId: 'list-2', inviteId: 'inv-2' }),
      ];

      mockGetDocs
        .mockResolvedValueOnce(mockEventsSnapshot(events)) // events query
        .mockResolvedValueOnce(mockEmptySnapshot()) // users count
        .mockResolvedValueOnce(mockEmptySnapshot()) // lists count
        .mockResolvedValueOnce(mockEmptySnapshot()) // articles count
        .mockResolvedValue(mockEmptySnapshot()); // top user email lookups

      const metrics = await firstValueFrom(service.getOverviewMetrics(true));

      expect(metrics.shareInvitesSent).toBe(3);
      expect(metrics.shareInvitesAccepted).toBe(2);
      expect(metrics.shareAcceptanceRate).toBe(66.7);
    });

    it('should return 0% acceptance rate when no invites sent', async () => {
      mockGetDocs
        .mockResolvedValueOnce(mockEventsSnapshot([]))
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValue(mockEmptySnapshot());

      const metrics = await firstValueFrom(service.getOverviewMetrics(true));

      expect(metrics.shareAcceptanceRate).toBe(0);
      expect(metrics.shareInvitesSent).toBe(0);
      expect(metrics.shareInvitesAccepted).toBe(0);
    });

    it('should count unique active shared lists', async () => {
      const events = [
        makeEvent(AnalyticsEventType.LIST_SHARED, { listId: 'list-1' }),
        makeEvent(AnalyticsEventType.LIST_SHARED, { listId: 'list-1' }), // duplicate
        makeEvent(AnalyticsEventType.LIST_SHARED, { listId: 'list-2' }),
        makeEvent(AnalyticsEventType.LIST_SHARED, { listId: 'list-3' }),
      ];

      mockGetDocs
        .mockResolvedValueOnce(mockEventsSnapshot(events))
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValue(mockEmptySnapshot());

      const metrics = await firstValueFrom(service.getOverviewMetrics(true));

      expect(metrics.activeSharedLists).toBe(3);
    });

    it('should count collaborators removed (LIST_UNSHARED)', async () => {
      const events = [
        makeEvent(AnalyticsEventType.LIST_UNSHARED, { listId: 'list-1', removedUserId: 'user-2' }),
        makeEvent(AnalyticsEventType.LIST_UNSHARED, { listId: 'list-1', removedUserId: 'user-3' }),
      ];

      mockGetDocs
        .mockResolvedValueOnce(mockEventsSnapshot(events))
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValue(mockEmptySnapshot());

      const metrics = await firstValueFrom(service.getOverviewMetrics(true));

      expect(metrics.listsUnshared).toBe(2);
    });

    it('should compute 100% acceptance rate when all invites accepted', async () => {
      const events = [
        makeEvent(AnalyticsEventType.SHARE_INVITE_CREATED, { listId: 'list-1' }),
        makeEvent(AnalyticsEventType.SHARE_INVITE_ACCEPTED, { listId: 'list-1' }),
      ];

      mockGetDocs
        .mockResolvedValueOnce(mockEventsSnapshot(events))
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValue(mockEmptySnapshot());

      const metrics = await firstValueFrom(service.getOverviewMetrics(true));

      expect(metrics.shareAcceptanceRate).toBe(100);
    });

    it('should ignore LIST_SHARED events with missing listId for activeSharedLists', async () => {
      const events = [
        makeEvent(AnalyticsEventType.LIST_SHARED, { listId: 'list-1' }),
        makeEvent(AnalyticsEventType.LIST_SHARED, {}), // no listId
        makeEvent(AnalyticsEventType.LIST_SHARED, undefined), // no metadata
      ];

      mockGetDocs
        .mockResolvedValueOnce(mockEventsSnapshot(events))
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValueOnce(mockEmptySnapshot())
        .mockResolvedValue(mockEmptySnapshot());

      const metrics = await firstValueFrom(service.getOverviewMetrics(true));

      expect(metrics.activeSharedLists).toBe(1);
    });
  });
});
