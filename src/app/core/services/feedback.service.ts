import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc, serverTimestamp } from '@angular/fire/firestore';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEventType, UserFeedback } from '../models/analytics.model';
import { AuthService } from './auth.service';

export interface FeedbackInput {
  type: UserFeedback['type'];
  description: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  private readonly firestore = inject(Firestore);

  constructor(
    private authService: AuthService,
    private analyticsService: AnalyticsService
  ) {}

  async submitFeedback(input: FeedbackInput): Promise<void> {
    const user = this.authService.getCurrentUserValue();

    const doc: Omit<UserFeedback, 'id' | 'createdAt' | 'updatedAt'> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      updatedAt: ReturnType<typeof serverTimestamp>;
      deviceInfo: UserFeedback['deviceInfo'];
    } = {
      userId: user?.id ?? 'anonymous',
      userEmail: user?.email ?? 'anonymous',
      type: input.type,
      description: input.description,
      status: 'new',
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        screenSize: `${window.screen.width}x${window.screen.height}`
      },
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any
    };

    await addDoc(collection(this.firestore, 'feedback'), doc);

    if (user?.id) {
      this.analyticsService.trackEvent(user.id, AnalyticsEventType.FEEDBACK_SUBMITTED, {
        type: input.type,
        descriptionLength: input.description.length
      });
    }
  }
}
