import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeedbackService } from './feedback.service';
import { AnalyticsEventType } from '../models/analytics.model';

// ---------------------------------------------------------------------------
// Minimal Firestore stub – addDoc resolves with a fake doc reference
// ---------------------------------------------------------------------------
const addDocMock = vi.fn(() => Promise.resolve({ id: 'doc123' }));
const collectionMock = vi.fn(() => 'feedbackCollection');

vi.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  collection: (...args: any[]) => collectionMock(...args),
  addDoc: (...args: any[]) => addDocMock(...args),
  serverTimestamp: () => ({ _type: 'serverTimestamp' })
}));

vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    inject: vi.fn(() => ({} as any))
  };
});

describe('FeedbackService', () => {
  let service: FeedbackService;
  let authServiceMock: any;
  let analyticsServiceMock: any;
  let firestoreMock: any;

  beforeEach(() => {
    addDocMock.mockClear();
    collectionMock.mockClear();

    authServiceMock = {
      getCurrentUserValue: vi.fn(() => ({ id: 'user1', email: 'test@example.com' }))
    };

    analyticsServiceMock = {
      trackEvent: vi.fn()
    };

    firestoreMock = {};

    service = new FeedbackService(authServiceMock, analyticsServiceMock);
    // Inject the Firestore stub directly (bypasses inject())
    (service as any).firestore = firestoreMock;
  });

  describe('submitFeedback()', () => {
    it('should write a document to the feedback collection', async () => {
      await service.submitFeedback({ type: 'bug', description: 'Something is broken here' });

      expect(collectionMock).toHaveBeenCalledWith(firestoreMock, 'feedback');
      expect(addDocMock).toHaveBeenCalledWith(
        'feedbackCollection',
        expect.objectContaining({
          userId: 'user1',
          userEmail: 'test@example.com',
          type: 'bug',
          description: 'Something is broken here',
          status: 'new'
        })
      );
    });

    it('should include deviceInfo in the document', async () => {
      await service.submitFeedback({ type: 'feature_request', description: 'Please add dark mode support' });

      expect(addDocMock).toHaveBeenCalledWith(
        'feedbackCollection',
        expect.objectContaining({
          deviceInfo: expect.objectContaining({
            userAgent: expect.any(String),
            platform: expect.any(String),
            screenSize: expect.any(String)
          })
        })
      );
    });

    it('should fire FEEDBACK_SUBMITTED analytics event', async () => {
      await service.submitFeedback({ type: 'other', description: 'General feedback text here' });

      expect(analyticsServiceMock.trackEvent).toHaveBeenCalledWith(
        'user1',
        AnalyticsEventType.FEEDBACK_SUBMITTED,
        { type: 'other', descriptionLength: 'General feedback text here'.length }
      );
    });

    it('should not fire analytics event when no user is logged in', async () => {
      authServiceMock.getCurrentUserValue = vi.fn(() => null);

      await service.submitFeedback({ type: 'bug', description: 'Anonymous bug report text' });

      expect(analyticsServiceMock.trackEvent).not.toHaveBeenCalled();
    });

    it('should use "anonymous" userId and email when no user is logged in', async () => {
      authServiceMock.getCurrentUserValue = vi.fn(() => null);

      await service.submitFeedback({ type: 'bug', description: 'Anonymous bug report text' });

      expect(addDocMock).toHaveBeenCalledWith(
        'feedbackCollection',
        expect.objectContaining({ userId: 'anonymous', userEmail: 'anonymous' })
      );
    });

    it('should re-throw Firestore errors so the dialog can show an error snackbar', async () => {
      addDocMock.mockRejectedValueOnce(new Error('Firestore write failed'));

      await expect(
        service.submitFeedback({ type: 'bug', description: 'Trigger error scenario' })
      ).rejects.toThrow('Firestore write failed');
    });
  });
});
