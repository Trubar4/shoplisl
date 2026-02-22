import { Injectable } from '@angular/core';
import { Observable, from, of, combineLatest } from 'rxjs';
import { map, switchMap, catchError, take } from 'rxjs/operators';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  collectionGroup,
  Timestamp,
  arrayUnion,
  arrayRemove
} from '@angular/fire/firestore';

import { ShoppingList, ShareInvite, UnshareNotification } from '../models';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEventType } from '../models/analytics.model';

/**
 * Phase 8B: Service for managing list sharing and collaboration
 *
 * Features:
 * - Generate shareable invite links
 * - Manage share invites (create, accept, decline)
 * - Add/remove collaborators from lists
 * - Query lists shared with current user
 * - Create unshare notifications
 */
@Injectable({
  providedIn: 'root'
})
export class SharingService {

  constructor(
    private firestore: Firestore,
    private authService: AuthService,
    private logger: LoggerService,
    private analyticsService: AnalyticsService
  ) {}

  /**
   * Generate a secure invite token for shareable links
   * Uses crypto.randomUUID() for secure random tokens
   */
  private generateInviteToken(): string {
    // Use crypto.randomUUID() if available (modern browsers)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback: Generate random string
    return 'invite_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Create a shareable invite link for a list
   *
   * @param listId - ID of the list to share
   * @param listName - Name of the list (denormalized for display)
   * @returns ShareInvite with inviteToken for generating link
   */
  async createShareInvite(listId: string, listName: string): Promise<ShareInvite> {
    const currentUser = await this.authService.getCurrentUser().pipe(take(1)).toPromise();

    if (!currentUser) {
      throw new Error('User must be authenticated to create share invite');
    }

    const inviteToken = this.generateInviteToken();

    const inviteData = {
      listId,
      listName,
      fromUserId: currentUser.id,
      fromUserEmail: currentUser.email || '',
      inviteToken,
      status: 'pending' as const,
      createdAt: Timestamp.now()
    };

    try {
      const docRef = await addDoc(
        collection(this.firestore, 'share-invites'),
        inviteData
      );

      const invite: ShareInvite = {
        id: docRef.id,
        ...inviteData,
        createdAt: new Date()
      };

      this.logger.info('sharing', `Created share invite for list ${listId}, token: ${inviteToken}`);

      const userId = this.authService.getCurrentUserId();
      if (userId) {
        this.analyticsService.trackEvent(userId, AnalyticsEventType.SHARE_INVITE_CREATED, {
          listId,
          fromUserId: inviteData.fromUserId
        });
        this.analyticsService.trackEvent(userId, AnalyticsEventType.LIST_SHARED, {
          listId
        });
      }

      return invite;
    } catch (error: any) {
      this.logger.error('sharing', 'Failed to create share invite', error);
      throw error;
    }
  }

  /**
   * Get the shareable link URL for an invite
   *
   * @param inviteToken - The invite token
   * @returns Full URL for sharing (e.g., https://shoplisl.app/invite/abc123)
   */
  getShareableLink(inviteToken: string): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/invite/${inviteToken}`;
  }

  /**
   * Get a share invite by its token
   *
   * @param inviteToken - The invite token from the URL
   * @returns ShareInvite if found, null if not found
   */
  async getInviteByToken(inviteToken: string): Promise<ShareInvite | null> {
    try {
      const q = query(
        collection(this.firestore, 'share-invites'),
        where('inviteToken', '==', inviteToken),
        where('status', '==', 'pending')
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        this.logger.warn('sharing', `No pending invite found for token ${inviteToken}`);
        return null;
      }

      const inviteDoc = snapshot.docs[0];
      const data = inviteDoc.data();

      return {
        id: inviteDoc.id,
        listId: data['listId'],
        listName: data['listName'],
        fromUserId: data['fromUserId'],
        fromUserEmail: data['fromUserEmail'],
        inviteToken: data['inviteToken'],
        status: data['status'],
        createdAt: data['createdAt']?.toDate() || new Date(),
        acceptedAt: data['acceptedAt']?.toDate(),
        acceptedByUserId: data['acceptedByUserId']
      };
    } catch (error: any) {
      this.logger.error('sharing', 'Failed to get invite by token', error);
      throw error;
    }
  }

  /**
   * Accept a share invite and add current user to list's sharedWith array
   *
   * @param inviteToken - The invite token from the URL
   * @returns The list that was shared, or null if invite not found/invalid
   */
  async acceptInvite(inviteToken: string): Promise<ShoppingList | null> {
    const currentUser = await this.authService.getCurrentUser().pipe(take(1)).toPromise();

    if (!currentUser) {
      throw new Error('User must be authenticated to accept invite');
    }

    // Get the invite
    const invite = await this.getInviteByToken(inviteToken);

    if (!invite) {
      this.logger.warn('sharing', 'Invite not found or already used');
      return null;
    }

    // Check if user is trying to accept their own invite
    if (invite.fromUserId === currentUser.id) {
      throw new Error('Cannot accept your own invite');
    }

    try {
      // Use the fromUserId from the invite to construct the path directly
      // No need to query across users - we already know the owner
      const ownerUserId = invite.fromUserId;
      const listRef = doc(this.firestore, `users-v2/${ownerUserId}/lists/${invite.listId}`);

      this.logger.info('sharing', `Accepting invite for list ${invite.listId} from owner ${ownerUserId}`);

      // Add current user to sharedWith array
      // The new security rules allow this even if user isn't in sharedWith yet
      await updateDoc(listRef, {
        sharedWith: arrayUnion(currentUser.id),
        updatedAt: Timestamp.now()
      });

      this.logger.info('sharing', `Added user ${currentUser.id} to sharedWith array`);

      // Now read the list (user is in sharedWith now, so they have permission)
      const listSnap = await getDoc(listRef);

      if (!listSnap.exists()) {
        throw new Error('List not found');
      }

      const listData = listSnap.data();
      const list: ShoppingList = {
        id: listSnap.id,
        name: listData['name'],
        color: listData['color'],
        icon: listData['icon'],
        shopId: listData['shopId'],
        articleIds: listData['articleIds'] || [],
        itemStates: listData['itemStates'] || {},
        departmentOrder: listData['departmentOrder'],
        createdAt: listData['createdAt']?.toDate() || new Date(),
        updatedAt: listData['updatedAt']?.toDate() || new Date(),
        ownerId: listData['ownerId'] || '',
        sharedWith: listData['sharedWith'] || []
      };

      // Update invite status
      const inviteRef = doc(this.firestore, `share-invites/${invite.id}`);
      await updateDoc(inviteRef, {
        status: 'accepted',
        acceptedAt: Timestamp.now(),
        acceptedByUserId: currentUser.id
      });

      this.logger.info('sharing', `User ${currentUser.id} accepted invite for list ${invite.listId}`);

      this.analyticsService.trackEvent(currentUser.id, AnalyticsEventType.SHARE_INVITE_ACCEPTED, {
        listId: invite.listId,
        inviteId: invite.id,
        fromUserId: invite.fromUserId
      });

      return list;
    } catch (error: any) {
      this.logger.error('sharing', 'Failed to accept invite', error);
      throw error;
    }
  }

  /**
   * Helper method to find a list by ID across all users
   * Uses collection group query to search all lists subcollections
   *
   * @param listId - The list ID to search for
   * @returns Object with list and ownerUserId, or null if not found
   */
  private async getListByIdAcrossUsers(listId: string): Promise<{ list: ShoppingList, ownerUserId: string } | null> {
    try {
      // Query all lists subcollections using collection group
      const listsQuery = collectionGroup(this.firestore, 'lists');
      const snapshot = await getDocs(listsQuery);

      // Find the list with matching ID
      for (const docSnapshot of snapshot.docs) {
        if (docSnapshot.id === listId) {
          const data = docSnapshot.data();

          // Extract ownerUserId from the document path
          // Path format: users-v2/{ownerUserId}/lists/{listId}
          const pathParts = docSnapshot.ref.path.split('/');
          const ownerUserId = pathParts[1]; // users-v2/{ownerUserId}/lists/{listId}

          const list: ShoppingList = {
            id: docSnapshot.id,
            name: data['name'],
            color: data['color'],
            icon: data['icon'],
            shopId: data['shopId'],
            articleIds: data['articleIds'] || [],
            itemStates: data['itemStates'] || {},
            departmentOrder: data['departmentOrder'],
            createdAt: data['createdAt']?.toDate() || new Date(),
            updatedAt: data['updatedAt']?.toDate() || new Date(),
            ownerId: data['ownerId'],
            sharedWith: data['sharedWith'] || []
          };

          return { list, ownerUserId };
        }
      }

      return null;
    } catch (error: any) {
      this.logger.error('sharing', 'Failed to find list by ID', error);
      throw error;
    }
  }

  /**
   * Remove a user from a list's sharedWith array
   * Creates an unshare notification for the removed user
   *
   * @param listId - ID of the list
   * @param ownerId - ID of the list owner (where the list is stored)
   * @param userId - User ID to remove
   * @param listName - Name of the list (for notification)
   */
  async removeCollaborator(listId: string, ownerId: string, userId: string, listName: string): Promise<void> {
    const currentUser = await this.authService.getCurrentUser().pipe(take(1)).toPromise();

    if (!currentUser) {
      throw new Error('User must be authenticated to remove collaborator');
    }

    try {
      // Update list in owner's path (where the list is actually stored)
      const listRef = doc(this.firestore, `users-v2/${ownerId}/lists/${listId}`);

      // Remove user from sharedWith array
      await updateDoc(listRef, {
        sharedWith: arrayRemove(userId),
        updatedAt: Timestamp.now()
      });

      // Create unshare notification for the removed user (if not removing self)
      if (userId !== currentUser.id) {
        const notificationData = {
          listId,
          listName,
          ownerUserId: ownerId,
          ownerEmail: currentUser.email || '',
          removedUserId: userId,
          createdAt: Timestamp.now(),
          seen: false
        };

        await addDoc(
          collection(this.firestore, `users-v2/${userId}/unshare-notifications`),
          notificationData
        );
      }

      this.logger.info('sharing', `Removed user ${userId} from list ${listId}`);

      const currentUserId = this.authService.getCurrentUserId();
      if (currentUserId) {
        this.analyticsService.trackEvent(currentUserId, AnalyticsEventType.LIST_UNSHARED, {
          listId,
          removedUserId: userId
        });
      }
    } catch (error: any) {
      this.logger.error('sharing', 'Failed to remove collaborator', error);
      throw error;
    }
  }

  /**
   * Get all lists shared with the current user
   * Uses collection group query to search across all users' lists
   *
   * @returns Observable of lists where current user is in sharedWith array
   */
  getSharedLists(): Observable<ShoppingList[]> {
    return this.authService.getCurrentUser().pipe(
      switchMap(user => {
        if (!user) {
          return of([]);
        }

        return from(this.getSharedListsForUser(user.id));
      }),
      catchError(error => {
        this.logger.error('sharing', 'Failed to get shared lists', error);
        return of([]);
      })
    );
  }

  /**
   * Helper method to get shared lists for a specific user
   *
   * @param userId - User ID to get shared lists for
   * @returns Promise of lists shared with this user
   */
  private async getSharedListsForUser(userId: string): Promise<ShoppingList[]> {
    try {
      // Query all lists collections where sharedWith contains userId
      const listsQuery = query(
        collectionGroup(this.firestore, 'lists'),
        where('sharedWith', 'array-contains', userId)
      );

      const snapshot = await getDocs(listsQuery);
      const lists: ShoppingList[] = [];

      snapshot.forEach(docSnapshot => {
        const data = docSnapshot.data();

        lists.push({
          id: docSnapshot.id,
          name: data['name'],
          color: data['color'],
          icon: data['icon'],
          shopId: data['shopId'],
          articleIds: data['articleIds'] || [],
          itemStates: data['itemStates'] || {},
          departmentOrder: data['departmentOrder'],
          createdAt: data['createdAt']?.toDate() || new Date(),
          updatedAt: data['updatedAt']?.toDate() || new Date(),
          ownerId: data['ownerId'],
          sharedWith: data['sharedWith'] || []
        });
      });

      this.logger.info('sharing', `Found ${lists.length} shared lists for user ${userId}`);
      return lists;
    } catch (error: any) {
      this.logger.error('sharing', 'Failed to get shared lists for user', error);
      throw error;
    }
  }

  /**
   * Get all collaborators (user IDs) for a specific list
   *
   * @param listId - ID of the list
   * @returns Observable of user IDs who have access to this list
   */
  getListCollaborators(listId: string): Observable<string[]> {
    const currentUser = this.authService.getCurrentUserId();

    if (!currentUser) {
      return of([]);
    }

    return from(
      getDoc(doc(this.firestore, `users-v2/${currentUser}/lists/${listId}`))
    ).pipe(
      map(docSnapshot => {
        if (!docSnapshot.exists()) {
          return [];
        }

        const data = docSnapshot.data();
        return data['sharedWith'] || [];
      }),
      catchError(error => {
        this.logger.error('sharing', 'Failed to get list collaborators', error);
        return of([]);
      })
    );
  }

  /**
   * Get unshare notifications for current user
   *
   * @returns Observable of unshare notifications
   */
  getUnshareNotifications(): Observable<UnshareNotification[]> {
    return this.authService.getCurrentUser().pipe(
      switchMap(user => {
        if (!user) {
          return of([]);
        }

        return from(this.getUnshareNotificationsForUser(user.id));
      }),
      catchError(error => {
        this.logger.error('sharing', 'Failed to get unshare notifications', error);
        return of([]);
      })
    );
  }

  /**
   * Helper method to get unshare notifications for a specific user
   *
   * @param userId - User ID to get notifications for
   * @returns Promise of unshare notifications
   */
  private async getUnshareNotificationsForUser(userId: string): Promise<UnshareNotification[]> {
    try {
      const notificationsRef = collection(this.firestore, `users-v2/${userId}/unshare-notifications`);
      const q = query(notificationsRef, where('seen', '==', false));
      const snapshot = await getDocs(q);

      const notifications: UnshareNotification[] = [];

      snapshot.forEach(docSnapshot => {
        const data = docSnapshot.data();

        notifications.push({
          id: docSnapshot.id,
          listId: data['listId'],
          listName: data['listName'],
          ownerUserId: data['ownerUserId'],
          ownerEmail: data['ownerEmail'],
          removedUserId: data['removedUserId'],
          createdAt: data['createdAt']?.toDate() || new Date(),
          seen: data['seen'],
          action: data['action']
        });
      });

      return notifications;
    } catch (error: any) {
      this.logger.error('sharing', 'Failed to get unshare notifications', error);
      throw error;
    }
  }

  /**
   * Mark an unshare notification as seen and set the user's action
   *
   * @param notificationId - ID of the notification
   * @param action - User's choice: 'keep_copy' or 'delete'
   */
  async handleUnshareNotification(notificationId: string, action: 'keep_copy' | 'delete'): Promise<void> {
    const currentUser = await this.authService.getCurrentUser().pipe(take(1)).toPromise();

    if (!currentUser) {
      throw new Error('User must be authenticated');
    }

    try {
      const notificationRef = doc(
        this.firestore,
        `users-v2/${currentUser.id}/unshare-notifications/${notificationId}`
      );

      await updateDoc(notificationRef, {
        seen: true,
        action
      });

      this.logger.info('sharing', `Handled unshare notification ${notificationId} with action: ${action}`);
    } catch (error: any) {
      this.logger.error('sharing', 'Failed to handle unshare notification', error);
      throw error;
    }
  }
}
