import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  UserSupportService,
  UserSearchResult,
  UserProfile,
} from '../../../core/services/user-support.service';
import { AnalyticsEventType } from '../../../core/models/analytics.model';

/**
 * User Support Dashboard Component
 *
 * Phase 4: Admin tool for searching users, viewing profiles,
 * and managing user accounts.
 */
@Component({
  selector: 'app-user-support',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatExpansionModule,
    MatTabsModule,
    MatDividerModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './user-support.component.html',
  styleUrl: './user-support.component.scss',
})
export class UserSupportComponent {
  private userSupport = inject(UserSupportService);
  private snackBar = inject(MatSnackBar);

  searchQuery = signal('');
  searchResults = signal<UserSearchResult[]>([]);
  selectedUser = signal<UserProfile | null>(null);
  isSearching = signal(false);
  isLoadingProfile = signal(false);
  errorMessage = signal<string | null>(null);

  displayedColumns = ['name', 'email', 'lists', 'articles', 'lastActive', 'actions'];

  /**
   * Search for users
   */
  async search() {
    const query = this.searchQuery().trim();

    if (query.length < 2) {
      this.snackBar.open('Please enter at least 2 characters', 'Close', { duration: 3000 });
      return;
    }

    this.isSearching.set(true);
    this.errorMessage.set(null);
    this.selectedUser.set(null);

    try {
      console.log('🔍 Searching for users:', query);
      const results = await this.userSupport.searchUsers(query);
      this.searchResults.set(results);
      console.log(`✅ Found ${results.length} users`);

      if (results.length === 0) {
        this.snackBar.open('No users found', 'Close', { duration: 3000 });
      }
    } catch (error: any) {
      console.error('❌ Search failed:', error);
      this.errorMessage.set(error.message || 'Failed to search users');
      this.snackBar.open('Search failed. Please try again.', 'Close', { duration: 5000 });
    } finally {
      this.isSearching.set(false);
    }
  }

  /**
   * View user profile
   */
  async viewProfile(userId: string) {
    this.isLoadingProfile.set(true);
    this.errorMessage.set(null);

    try {
      console.log('📊 Loading profile for user:', userId);
      const profile = await this.userSupport.getUserProfile(userId);
      this.selectedUser.set(profile);
      console.log('✅ Profile loaded successfully');

      // Scroll to profile section
      setTimeout(() => {
        document.getElementById('user-profile')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error: any) {
      console.error('❌ Failed to load profile:', error);
      this.errorMessage.set(error.message || 'Failed to load user profile');
      this.snackBar.open('Failed to load profile. Please try again.', 'Close', { duration: 5000 });
    } finally {
      this.isLoadingProfile.set(false);
    }
  }

  /**
   * Export user data as JSON
   */
  async exportUserData(userId: string, userName: string) {
    try {
      console.log('📦 Exporting data for user:', userId);
      this.snackBar.open('Preparing export...', undefined, { duration: 2000 });

      const blob = await this.userSupport.exportUserData(userId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `user-${userId}-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      window.URL.revokeObjectURL(url);

      console.log('✅ Export complete');
      this.snackBar.open('User data exported successfully', 'Close', { duration: 3000 });
    } catch (error: any) {
      console.error('❌ Export failed:', error);
      this.snackBar.open('Failed to export user data', 'Close', { duration: 5000 });
    }
  }

  /**
   * Close user profile
   */
  closeProfile() {
    this.selectedUser.set(null);
  }

  /**
   * Format date for display
   */
  formatDate(date: Date | null): string {
    if (!date) return 'Never';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Format event type for display
   */
  formatEventType(eventType: string): string {
    // Convert snake_case to Title Case
    return eventType
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get icon for event type
   */
  getEventIcon(eventType: string): string {
    const iconMap: Record<string, string> = {
      [AnalyticsEventType.USER_LOGIN]: 'login',
      [AnalyticsEventType.USER_LOGOUT]: 'logout',
      [AnalyticsEventType.LIST_CREATED]: 'add_circle',
      [AnalyticsEventType.LIST_UPDATED]: 'edit',
      [AnalyticsEventType.LIST_DELETED]: 'delete',
      [AnalyticsEventType.ARTICLE_ADDED_TO_LIST]: 'add_shopping_cart',
      [AnalyticsEventType.ARTICLE_REMOVED_FROM_LIST]: 'remove_shopping_cart',
      [AnalyticsEventType.ARTICLE_CHECKED]: 'check_box',
      [AnalyticsEventType.ARTICLE_UNCHECKED]: 'check_box_outline_blank',
      [AnalyticsEventType.AI_COMMAND_EXECUTED]: 'smart_toy',
      [AnalyticsEventType.AI_COMMAND_FAILED]: 'error',
      [AnalyticsEventType.LIST_SHARED]: 'share',
    };

    return iconMap[eventType] || 'event';
  }

  /**
   * Get color for event type
   */
  getEventColor(eventType: string): string {
    if (eventType.includes('failed') || eventType.includes('deleted')) {
      return 'warn';
    }
    if (eventType.includes('created') || eventType.includes('added')) {
      return 'primary';
    }
    return '';
  }

  /**
   * Clear search and results
   */
  clearSearch() {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.selectedUser.set(null);
    this.errorMessage.set(null);
  }
}
