/**
 * Analytics Event Types and Models
 * Used for tracking user behavior and system metrics
 */

// ==========================================
// Event Types
// ==========================================

export enum AnalyticsEventType {
  // User Events
  USER_SIGNUP = 'user_signup',
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',

  // List Events
  LIST_CREATED = 'list_created',
  LIST_UPDATED = 'list_updated',
  LIST_DELETED = 'list_deleted',
  LIST_VIEWED = 'list_viewed',
  LIST_COMPLETED = 'list_completed',
  LIST_SHARED = 'list_shared',
  LIST_UNSHARED = 'list_unshared',
  SHARE_INVITE_CREATED = 'share_invite_created',
  SHARE_INVITE_ACCEPTED = 'share_invite_accepted',

  // Article Events
  ARTICLE_CREATED = 'article_created',
  ARTICLE_UPDATED = 'article_updated',
  ARTICLE_DELETED = 'article_deleted',
  ARTICLE_ADDED_TO_LIST = 'article_added_to_list',
  ARTICLE_REMOVED_FROM_LIST = 'article_removed_from_list',
  ARTICLE_CHECKED = 'article_checked',
  ARTICLE_UNCHECKED = 'article_unchecked',
  ARTICLE_COPIED = 'article_copied',
  ARTICLE_MOVED_BETWEEN_LISTS = 'article_moved_between_lists',

  // AI Events
  AI_COMMAND_EXECUTED = 'ai_command_executed',
  AI_COMMAND_FAILED = 'ai_command_failed',
  AI_DISAMBIGUATION_SHOWN = 'ai_disambiguation_shown',
  AI_DISAMBIGUATION_RESOLVED = 'ai_disambiguation_resolved',
  AI_RECIPE_PROCESSED = 'ai_recipe_processed',
  AI_VOICE_INPUT_USED = 'ai_voice_input_used',

  // Feature Usage
  FEATURE_USED = 'feature_used',
  PAGE_VIEW = 'page_view',

  // Errors
  ERROR_OCCURRED = 'error_occurred',

  // Feedback
  FEEDBACK_SUBMITTED = 'feedback_submitted',
}

// ==========================================
// Analytics Event
// ==========================================

export interface AnalyticsEvent {
  id: string;
  eventType: AnalyticsEventType;
  userId: string;
  timestamp: Date;
  sessionId: string;
  metadata?: Record<string, any>;
}

// ==========================================
// Daily Aggregates
// ==========================================

export interface DailyAggregates {
  date: string; // YYYY-MM-DD format
  totalUsers: number;
  activeUsers: number; // Users who performed any action today
  newUsers: number; // Users who signed up today
  totalLists: number;
  newLists: number; // Lists created today
  totalArticles: number;
  newArticles: number; // Articles created today
  totalSharedLists: number;
  shareInvitesCreated: number;
  shareInvitesAccepted: number;
  aiCommandsTotal: number;
  aiCommandsSuccessful: number;
  aiCommandsFailed: number;
  aiCommandsByType?: Record<string, number>; // e.g., { "add_article": 10, "create_list": 5 }
  articlesAddedViaAI: number;
  listsAddedViaAI: number;
  articlesChecked: number;
  articlesUnchecked: number;
  pageViews: number;
  errors: number;
  feedbackSubmitted: number;
}

// ==========================================
// User Metrics
// ==========================================

export interface UserMetrics {
  userId: string;
  signupDate: Date;
  lastActiveDate: Date;
  totalLists: number;
  totalArticles: number;
  totalSharedLists: number; // Lists they've shared
  totalCollaboratingLists: number; // Lists shared with them
  aiCommandsTotal: number;
  aiCommandsSuccessful: number;
  articlesAddedViaAI: number;
  listsAddedViaAI: number;
  totalSessions: number;
  lastSessionDate?: Date;
}

// ==========================================
// AI Insights
// ==========================================

export interface AIInsights {
  date: string; // YYYY-MM-DD format
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  commandsByType: Record<string, number>; // e.g., { "add_article": 10 }
  failedCommandsByType: Record<string, number>;
  failedCommandExamples: FailedCommandExample[];
  averageResponseTime: number; // milliseconds
  cacheHitRate: number; // percentage
  disambiguationRate: number; // percentage of commands requiring clarification
}

export interface FailedCommandExample {
  inputText: string;
  commandType?: string;
  errorMessage?: string;
  timestamp: Date;
  userId: string;
}

// ==========================================
// Feature Flags
// ==========================================

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage?: number; // 0-100, for gradual rollout
  userWhitelist?: string[]; // User IDs with forced access
  userBlacklist?: string[]; // User IDs denied access
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// User Feedback
// ==========================================

export interface UserFeedback {
  id: string;
  userId: string;
  userEmail: string;
  type: 'bug' | 'feature_request' | 'other';
  description: string;
  screenshotUrl?: string;
  deviceInfo?: {
    userAgent: string;
    platform: string;
    screenSize: string;
  };
  status: 'new' | 'in_progress' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high';
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

// ==========================================
// System Alerts
// ==========================================

export interface SystemAlert {
  id: string;
  alertType: AlertType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  threshold?: number;
  currentValue?: number;
  triggered: boolean;
  triggeredAt?: Date;
  acknowledgedAt?: Date;
  createdAt: Date;
}

export enum AlertType {
  ERROR_RATE_HIGH = 'error_rate_high',
  AI_SUCCESS_RATE_LOW = 'ai_success_rate_low',
  NO_NEW_USERS = 'no_new_users',
  USER_CHURN_HIGH = 'user_churn_high',
  SYSTEM_ERROR = 'system_error',
}

// ==========================================
// Analytics Query Results
// ==========================================

export interface AnalyticsOverview {
  totalUsers: number;
  totalLists: number;
  totalArticles: number;
  totalSharedLists: number;
  activeUsersLast7Days: number;
  activeUsersLast14Days: number;
  activeUsersLast30Days: number;
  aiCommandsTotal: number;
  aiCommandsLast7Days: number;
  aiSuccessRate: number; // percentage
  articlesAddedViaAI: number;
  listsAddedViaAI: number;
}

export interface ActivityMetrics {
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  averageListsPerUser: number;
  averageArticlesPerUser: number;
  averageActiveListsPerUser: number; // Lists used in last 14 days
}

export interface CollaborationMetrics {
  totalSharedLists: number;
  shareInviteAcceptanceRate: number; // percentage
  averageCollaboratorsPerSharedList: number;
  mostCollaborativeUsers: Array<{ userId: string; sharedListsCount: number }>;
}
