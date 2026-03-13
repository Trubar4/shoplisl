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

import { AnalyticsAggregationService, OverviewMetrics, AICommandBreakdown } from './analytics-aggregation.service';
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

  describe('AI Command Breakdown', () => {
    it('should count AI commands by type from events', async () => {
      const events = [
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, { commandType: 'standard' }),
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, { commandType: 'standard' }),
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, { commandType: 'recipe' }),
        makeEvent(AnalyticsEventType.AI_COMMAND_FAILED, { commandType: 'recipe' }),
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, { commandType: 'multi_item' }),
      ];

      mockGetDocs.mockResolvedValueOnce(mockEventsSnapshot(events));

      const breakdown = await firstValueFrom(service.getAICommandBreakdown());

      console.log('[TEST] AI Command Breakdown result:', JSON.stringify(breakdown, null, 2));

      expect(breakdown.totalCommands).toBe(5);
      expect(breakdown.commandTypeCounts['standard']).toBe(2);
      expect(breakdown.commandTypeCounts['recipe']).toBe(2);
      expect(breakdown.commandTypeCounts['multi_item']).toBe(1);
      expect(breakdown.failedCommandTypeCounts['recipe']).toBe(1);
    });

    it('should return empty breakdown when no AI events exist', async () => {
      mockGetDocs.mockResolvedValueOnce(mockEventsSnapshot([]));

      const breakdown = await firstValueFrom(service.getAICommandBreakdown());

      console.log('[TEST] Empty breakdown result:', JSON.stringify(breakdown, null, 2));

      expect(breakdown.totalCommands).toBe(0);
      expect(Object.keys(breakdown.commandTypeCounts)).toHaveLength(0);
      expect(Object.keys(breakdown.failedCommandTypeCounts)).toHaveLength(0);
    });

    it('should filter out non-AI events from mixed event set', async () => {
      const events = [
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, { commandType: 'standard' }),
        makeEvent(AnalyticsEventType.LIST_CREATED, { listName: 'Groceries' }),
        makeEvent(AnalyticsEventType.PAGE_VIEW, { page: '/home' }),
        makeEvent(AnalyticsEventType.USER_LOGIN),
        makeEvent(AnalyticsEventType.ARTICLE_CREATED, { articleName: 'Milk' }),
        makeEvent(AnalyticsEventType.AI_COMMAND_FAILED, { commandType: 'help' }),
      ];

      mockGetDocs.mockResolvedValueOnce(mockEventsSnapshot(events));

      const breakdown = await firstValueFrom(service.getAICommandBreakdown());

      console.log('[TEST] Mixed events - AI breakdown:', JSON.stringify(breakdown, null, 2));
      console.log('[TEST] Mixed events - total events returned by query:', events.length);
      console.log('[TEST] Mixed events - AI events found after filter:', breakdown.totalCommands);

      expect(breakdown.totalCommands).toBe(2);
      expect(breakdown.commandTypeCounts['standard']).toBe(1);
      expect(breakdown.commandTypeCounts['help']).toBe(1);
    });

    it('should use "unknown" for events with missing commandType', async () => {
      const events = [
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, {}),
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, undefined),
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, { commandType: 'standard' }),
      ];

      mockGetDocs.mockResolvedValueOnce(mockEventsSnapshot(events));

      const breakdown = await firstValueFrom(service.getAICommandBreakdown());

      console.log('[TEST] Missing commandType breakdown:', JSON.stringify(breakdown, null, 2));

      expect(breakdown.totalCommands).toBe(3);
      expect(breakdown.commandTypeCounts['unknown']).toBe(2);
      expect(breakdown.commandTypeCounts['standard']).toBe(1);
    });

    it('BUG: should find AI events even when non-AI events dominate the dataset', async () => {
      // This test exposes the core bug: without orderBy('timestamp', 'desc'),
      // the query returns the OLDEST 500 events (ascending order).
      // If there are many non-AI events, AI events get pushed out of the 500 limit.
      //
      // The fix: add orderBy('timestamp', 'desc') to match computeOverviewMetrics,
      // so the NEWEST events are returned first.
      const nonAIEvents = Array.from({ length: 20 }, (_, i) =>
        makeEvent(AnalyticsEventType.PAGE_VIEW, { page: `/page-${i}` })
      );
      const aiEvents = [
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, { commandType: 'standard' }),
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, { commandType: 'recipe' }),
        makeEvent(AnalyticsEventType.AI_COMMAND_FAILED, { commandType: 'help' }),
      ];

      // Simulate what Firestore returns: all events mixed together.
      // With the fix (orderBy desc), newest events come first so AI events are included.
      const allEvents = [...nonAIEvents, ...aiEvents];
      mockGetDocs.mockResolvedValueOnce(mockEventsSnapshot(allEvents));

      const breakdown = await firstValueFrom(service.getAICommandBreakdown());

      console.log('[TEST] Dominated dataset - total events from query:', allEvents.length);
      console.log('[TEST] Dominated dataset - AI events found:', breakdown.totalCommands);
      console.log('[TEST] Dominated dataset - commandTypeCounts:', JSON.stringify(breakdown.commandTypeCounts));

      // The query must use orderBy('timestamp', 'desc') to get newest events first.
      // Verify that orderBy was called with 'timestamp' and 'desc'.
      const orderByCalls = mockOrderBy.mock.calls;
      console.log('[TEST] orderBy calls:', JSON.stringify(orderByCalls));

      expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
      expect(breakdown.totalCommands).toBe(3);
      expect(breakdown.commandTypeCounts['standard']).toBe(1);
      expect(breakdown.commandTypeCounts['recipe']).toBe(1);
      expect(breakdown.commandTypeCounts['help']).toBe(1);
    });

    it('should track failed commands separately in failedCommandTypeCounts', async () => {
      const events = [
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, { commandType: 'standard' }),
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, { commandType: 'standard' }),
        makeEvent(AnalyticsEventType.AI_COMMAND_FAILED, { commandType: 'standard' }),
        makeEvent(AnalyticsEventType.AI_COMMAND_FAILED, { commandType: 'recipe' }),
        makeEvent(AnalyticsEventType.AI_COMMAND_FAILED, { commandType: 'recipe' }),
      ];

      mockGetDocs.mockResolvedValueOnce(mockEventsSnapshot(events));

      const breakdown = await firstValueFrom(service.getAICommandBreakdown());

      console.log('[TEST] Failed commands - commandTypeCounts:', JSON.stringify(breakdown.commandTypeCounts));
      console.log('[TEST] Failed commands - failedCommandTypeCounts:', JSON.stringify(breakdown.failedCommandTypeCounts));

      // Total counts include both executed and failed
      expect(breakdown.commandTypeCounts['standard']).toBe(3);
      expect(breakdown.commandTypeCounts['recipe']).toBe(2);

      // Failed counts only include failed
      expect(breakdown.failedCommandTypeCounts['standard']).toBe(1);
      expect(breakdown.failedCommandTypeCounts['recipe']).toBe(2);
      expect(breakdown.failedCommandTypeCounts['multi_item']).toBeUndefined();
    });

    it('should log debug messages during breakdown computation', async () => {
      const events = [
        makeEvent(AnalyticsEventType.AI_COMMAND_EXECUTED, { commandType: 'standard' }),
      ];

      mockGetDocs.mockResolvedValueOnce(mockEventsSnapshot(events));

      await firstValueFrom(service.getAICommandBreakdown());

      const logger = (service as any).logger;
      const debugCalls = logger.debug.mock.calls.map((c: any[]) => c[1]);
      console.log('[TEST] Debug log messages:', debugCalls);

      // Should have logged query results and AI event count
      expect(logger.debug).toHaveBeenCalled();
      const analyticsLogs = logger.debug.mock.calls.filter((c: any[]) => c[0] === 'analytics');
      expect(analyticsLogs.length).toBeGreaterThanOrEqual(2);
    });
  });
});
