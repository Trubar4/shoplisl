import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsEventType } from '../models/analytics.model';
import { of } from 'rxjs';

// Mock @angular/fire/firestore at module level for ESM compatibility
const mockAddDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();
const mockArrayUnion = vi.fn().mockImplementation((...args: any[]) => args);
const mockArrayRemove = vi.fn().mockImplementation((...args: any[]) => args);
const mockTimestampNow = vi.fn().mockReturnValue({ toDate: () => new Date() });

vi.mock('@angular/fire/firestore', () => ({
  Firestore: vi.fn(),
  addDoc: (...args: any[]) => mockAddDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  doc: (...args: any[]) => mockDoc(...args),
  collection: (...args: any[]) => mockCollection(...args),
  collectionGroup: vi.fn(),
  query: (...args: any[]) => mockQuery(...args),
  where: (...args: any[]) => mockWhere(...args),
  arrayUnion: (...args: any[]) => mockArrayUnion(...args),
  arrayRemove: (...args: any[]) => mockArrayRemove(...args),
  Timestamp: { now: () => mockTimestampNow() },
}));

// Import after mocking
import { SharingService } from './sharing.service';

describe('SharingService - Analytics Events', () => {
  let service: SharingService;
  let firestoreMock: any;
  let authServiceMock: any;
  let loggerMock: any;
  let analyticsServiceMock: any;

  const testUser = { id: 'user-1', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();

    firestoreMock = {};

    authServiceMock = {
      getCurrentUser: vi.fn().mockReturnValue(of(testUser)),
      getCurrentUserId: vi.fn().mockReturnValue('user-1'),
    };

    loggerMock = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    analyticsServiceMock = {
      trackEvent: vi.fn(),
    };

    service = new SharingService(
      firestoreMock,
      authServiceMock,
      loggerMock,
      analyticsServiceMock
    );
  });

  describe('createShareInvite', () => {
    it('should track SHARE_INVITE_CREATED and LIST_SHARED on success', async () => {
      mockAddDoc.mockResolvedValue({ id: 'invite-123' });
      mockCollection.mockReturnValue('share-invites-ref');

      const result = await service.createShareInvite('list-1', 'My List');

      expect(analyticsServiceMock.trackEvent).toHaveBeenCalledWith(
        'user-1',
        AnalyticsEventType.SHARE_INVITE_CREATED,
        expect.objectContaining({
          listId: 'list-1',
          fromUserId: 'user-1',
        })
      );

      expect(analyticsServiceMock.trackEvent).toHaveBeenCalledWith(
        'user-1',
        AnalyticsEventType.LIST_SHARED,
        expect.objectContaining({
          listId: 'list-1',
        })
      );

      expect(analyticsServiceMock.trackEvent).toHaveBeenCalledTimes(2);
    });

    it('should not track events when user is not authenticated', async () => {
      authServiceMock.getCurrentUser.mockReturnValue(of(null));

      await expect(service.createShareInvite('list-1', 'My List'))
        .rejects.toThrow('User must be authenticated');

      expect(analyticsServiceMock.trackEvent).not.toHaveBeenCalled();
    });

    it('should not track events when getCurrentUserId returns null after successful write', async () => {
      mockAddDoc.mockResolvedValue({ id: 'invite-123' });
      mockCollection.mockReturnValue('share-invites-ref');
      authServiceMock.getCurrentUserId.mockReturnValue(null);

      await service.createShareInvite('list-1', 'My List');

      expect(analyticsServiceMock.trackEvent).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvite', () => {
    it('should track SHARE_INVITE_ACCEPTED on success', async () => {
      const mockInviteDoc = {
        id: 'invite-123',
        data: () => ({
          listId: 'list-1',
          listName: 'My List',
          fromUserId: 'user-2',
          fromUserEmail: 'owner@example.com',
          inviteToken: 'token-abc',
          status: 'pending',
          createdAt: { toDate: () => new Date() },
        }),
      };

      const mockListDoc = {
        exists: () => true,
        id: 'list-1',
        data: () => ({
          name: 'My List',
          color: '#fff',
          icon: 'cart',
          shopId: 'shop-1',
          articleIds: [],
          itemStates: {},
          createdAt: { toDate: () => new Date() },
          updatedAt: { toDate: () => new Date() },
          ownerId: 'user-2',
          sharedWith: ['user-1'],
        }),
      };

      // First getDocs call is for getInviteByToken
      mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [mockInviteDoc],
      });

      mockGetDoc.mockResolvedValue(mockListDoc);
      mockUpdateDoc.mockResolvedValue(undefined);
      mockDoc.mockReturnValue('doc-ref');
      mockCollection.mockReturnValue('collection-ref');
      mockQuery.mockReturnValue('query-ref');
      mockWhere.mockReturnValue('where-ref');

      const result = await service.acceptInvite('token-abc');

      expect(result).not.toBeNull();
      expect(analyticsServiceMock.trackEvent).toHaveBeenCalledWith(
        'user-1',
        AnalyticsEventType.SHARE_INVITE_ACCEPTED,
        {
          listId: 'list-1',
          inviteId: 'invite-123',
          fromUserId: 'user-2',
        }
      );
    });

    it('should not track events when invite is not found', async () => {
      mockGetDocs.mockResolvedValue({
        empty: true,
        docs: [],
      });
      mockCollection.mockReturnValue('collection-ref');
      mockQuery.mockReturnValue('query-ref');
      mockWhere.mockReturnValue('where-ref');

      const result = await service.acceptInvite('invalid-token');

      expect(result).toBeNull();
      expect(analyticsServiceMock.trackEvent).not.toHaveBeenCalled();
    });
  });

  describe('removeCollaborator', () => {
    it('should track LIST_UNSHARED on success', async () => {
      mockDoc.mockReturnValue('doc-ref');
      mockUpdateDoc.mockResolvedValue(undefined);
      mockAddDoc.mockResolvedValue({ id: 'notif-1' });
      mockCollection.mockReturnValue('collection-ref');

      await service.removeCollaborator('list-1', 'owner-1', 'collab-1', 'My List');

      expect(analyticsServiceMock.trackEvent).toHaveBeenCalledWith(
        'user-1',
        AnalyticsEventType.LIST_UNSHARED,
        {
          listId: 'list-1',
          removedUserId: 'collab-1',
        }
      );
    });

    it('should not track events when user is not authenticated', async () => {
      authServiceMock.getCurrentUser.mockReturnValue(of(null));

      await expect(
        service.removeCollaborator('list-1', 'owner-1', 'collab-1', 'My List')
      ).rejects.toThrow('User must be authenticated');

      expect(analyticsServiceMock.trackEvent).not.toHaveBeenCalled();
    });

    it('should not track events when getCurrentUserId returns null', async () => {
      mockDoc.mockReturnValue('doc-ref');
      mockUpdateDoc.mockResolvedValue(undefined);
      mockAddDoc.mockResolvedValue({ id: 'notif-1' });
      mockCollection.mockReturnValue('collection-ref');
      authServiceMock.getCurrentUserId.mockReturnValue(null);

      await service.removeCollaborator('list-1', 'owner-1', 'collab-1', 'My List');

      expect(analyticsServiceMock.trackEvent).not.toHaveBeenCalled();
    });
  });
});
