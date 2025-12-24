# Admin Analytics Implementation Plan

## Overview
Implement comprehensive analytics and admin functionality for Shoplisl to track user behavior, system health, and provide support tools.

---

## Goals
1. Track user engagement and feature usage
2. Monitor AI assistant performance and failures
3. Provide admin dashboard for insights
4. Enable user support capabilities
5. Minimize Firestore costs through optimization
6. Support A/B testing and feature flags
7. Collect user feedback without paid tools

---

## Architecture Overview

### Database Schema

#### Collections

**1. `analytics/daily-aggregates/{date}`**
- Stores pre-aggregated daily metrics
- Reduces read costs (read once vs thousands of events)
- Enables historical trend analysis

**2. `analytics/user-metrics/{userId}`**
- Per-user statistics (cached)
- Last activity, signup date, feature usage flags
- Updated on user actions (debounced)

**3. `analytics/ai-insights/{date}`**
- AI-specific metrics
- Command success/failure rates
- Failed command patterns
- Cache performance

**4. `analytics/events/{eventId}` (Short-term storage)**
- Raw events (90-day retention)
- Used for debugging and detailed analysis
- Auto-deleted after aggregation

**5. `admin/feature-flags/{flagId}`**
- Feature flag configuration
- Enable/disable features per user or globally
- A/B test assignments

**6. `admin/user-feedback/{feedbackId}`**
- User-submitted feedback and bug reports
- Includes device info, screenshot URLs, user description
- Free alternative to paid tools

**7. `admin/system-alerts/{alertId}`**
- Automated alert conditions
- Email notifications for critical events
- Alert history and acknowledgment

---

## Services Architecture

### Core Analytics Services

**1. `AnalyticsService`**
- Central event tracking hub
- Batches writes to reduce costs (write every 5-10 events or 30 seconds)
- Handles online/offline buffering
- Methods: `trackEvent()`, `trackPageView()`, `trackUserAction()`

**2. `AggregationService`**
- Daily metric aggregation (scheduled)
- Computes derived metrics from raw events
- Runs cleanup of old events (>90 days)

**3. `FeatureFlagService`**
- Manages feature flags and A/B tests
- Cached flag values for performance
- Methods: `isEnabled(flagName)`, `getVariant(experimentName)`

**4. `UserSupportService`**
- User search and profile lookup
- Activity timeline generation
- Data export (GDPR compliance)

**5. `FeedbackService`**
- Submit user feedback
- Attach screenshots/context
- Admin review interface

**6. `AlertingService`**
- Monitor conditions (error rate, user churn, etc.)
- Send email notifications (Firebase Cloud Functions + SendGrid free tier)
- Alert history tracking

---

## Component Structure

### Admin Module (`/admin`)

**Existing:**
- `/admin/upload` - Article upload
- `/admin/upload-list` - List upload
- `/admin/performance` - AI performance dashboard

**New Components:**

**1. `/admin/analytics` (Main Analytics Dashboard)**
```
├── Overview Tab
│   ├── Key Metrics Cards (Total users, DAU, MAU, Active lists)
│   ├── User Growth Chart (7/30/90 days)
│   ├── Feature Adoption Chart
│   └── Quick Stats Summary
│
├── Users Tab
│   ├── User count trends
│   ├── Retention cohorts
│   ├── Activity distribution
│   └── Top active users
│
├── Lists & Articles Tab
│   ├── Lists created over time
│   ├── Articles added over time
│   ├── Shared lists metrics
│   ├── Average articles per list
│   └── Department usage distribution
│
├── Collaboration Tab
│   ├── Shared lists count
│   ├── Share invite acceptance rate
│   ├── Average collaborators per list
│   └── Most collaborative users
│
├── AI Assistant Tab
│   ├── Commands processed (total, by type)
│   ├── Success rate by command type
│   ├── Failed commands table (with examples)
│   ├── Cache hit rate
│   └── Response time trends
│
└── System Health Tab
    ├── Error rate over time
    ├── Recent errors list
    ├── Performance metrics
    └── Offline sync stats
```

**2. `/admin/user-support` (User Support Dashboard)**
```
├── User Search
│   └── Search by email/ID/name
│
├── User Profile Viewer
│   ├── Basic info (name, email, signup date)
│   ├── Activity summary (last active, total lists, articles)
│   ├── Lists overview
│   ├── Shared lists
│   └── Recent activity timeline
│
├── User Actions
│   ├── Export user data (JSON/CSV)
│   ├── Delete user account
│   └── Send notification to user
│
└── Error Logs
    └── Filter by user ID
```

**3. `/admin/feature-flags` (Feature Management)**
```
├── Flag List
│   ├── Active flags
│   ├── Archived flags
│   └── Create new flag button
│
├── Flag Editor
│   ├── Flag name and description
│   ├── Enabled/disabled toggle
│   ├── Rollout percentage (for gradual rollout)
│   ├── User whitelist/blacklist
│   └── A/B test configuration
│
└── Experiment Results
    └── Compare metrics between variants
```

**4. `/admin/feedback` (User Feedback Manager)**
```
├── Feedback List
│   ├── Filter by status (new, in-progress, resolved)
│   ├── Filter by type (bug, feature request, other)
│   └── Sort by date/priority
│
└── Feedback Detail
    ├── User info
    ├── Description and context
    ├── Screenshots/attachments
    ├── Device and browser info
    ├── Status and notes
    └── Admin actions (respond, close, prioritize)
```

**5. `/admin/alerts` (Alert Configuration)**
```
├── Alert Rules
│   ├── Create alert rule (condition + threshold)
│   ├── Email notification settings
│   └── Enable/disable alerts
│
└── Alert History
    └── Past alerts and acknowledgments
```

---

## Event Tracking Schema

### Event Types

```typescript
interface AnalyticsEvent {
  id: string;
  eventType: EventType;
  userId: string;
  timestamp: Date;
  sessionId: string;
  metadata: Record<string, any>;
}

enum EventType {
  // User Events
  USER_SIGNUP = 'user_signup',
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',

  // List Events
  LIST_CREATED = 'list_created',
  LIST_UPDATED = 'list_updated',
  LIST_DELETED = 'list_deleted',
  LIST_VIEWED = 'list_viewed',
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

  // AI Events
  AI_COMMAND_EXECUTED = 'ai_command_executed',
  AI_COMMAND_FAILED = 'ai_command_failed',
  AI_DISAMBIGUATION_SHOWN = 'ai_disambiguation_shown',
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
```

### Metadata Examples

```typescript
// AI Command
{
  eventType: 'AI_COMMAND_EXECUTED',
  metadata: {
    commandType: 'add_article',
    success: true,
    responseTime: 234,
    cacheHit: true,
    inputText: 'add milk to grocery list'
  }
}

// List Shared
{
  eventType: 'LIST_SHARED',
  metadata: {
    listId: 'abc123',
    collaboratorCount: 2,
    inviteMethod: 'link'
  }
}

// Page View
{
  eventType: 'PAGE_VIEW',
  metadata: {
    page: '/lists/detail',
    referrer: '/lists/overview',
    loadTime: 456
  }
}
```

---

## Cost Optimization Strategies

### 1. Batch Writes
- Buffer events in memory
- Write in batches (max 500 per batch)
- Flush on: 10 events accumulated OR 30 seconds elapsed OR user leaves page

### 2. Pre-Aggregation
- Daily aggregates instead of querying raw events
- Store computed metrics (e.g., DAU, retention)
- Reduces read costs by 100x+

### 3. Event Sampling
- Sample low-priority events (e.g., 10% of page views)
- Always track critical events (signup, purchases, errors)

### 4. Auto-Cleanup
- Delete raw events after 90 days
- Keep aggregates indefinitely
- Cloud Function scheduled daily

### 5. Indexed Queries Only
- Create composite indexes for common queries
- Avoid document scans

### 6. Client-Side Aggregation
- Compute simple metrics in browser when possible
- Reduce Cloud Function invocations

**Estimated Costs:**
- Current usage: ~5-10 users → ~500-1000 events/day
- With optimization: ~50-100 Firestore writes/day
- **Cost: <$0.01/day** (well within free tier)

---

## Implementation Phases

### Phase 1: Analytics Foundation (Week 1)
**Goal:** Set up core analytics infrastructure

**Tasks:**
1. Create Firestore collections and security rules
2. Implement `AnalyticsService` with batching
3. Add session tracking
4. Integrate event tracking in key user flows:
   - User signup/login
   - List creation/deletion
   - Article addition
   - Share invite creation/acceptance
   - AI command execution
5. Create daily aggregation Cloud Function (or client-side fallback)
6. Test event collection in dev environment

**Deliverables:**
- `AnalyticsService` working
- Events being tracked
- Daily aggregates being computed
- Security rules in place

---

### Phase 2: Admin Dashboard - Core Metrics (Week 2)
**Goal:** Build admin dashboard showing key metrics (1-13 from user's list)

**Tasks:**
1. Create admin route guard (restrict to your user ID)
2. Build `/admin/analytics` component with tabs
3. Implement "Overview" tab with:
   - Total users
   - Total lists
   - Total shared lists
   - Total articles
   - Active users (last 7/14/30 days)
4. Add manual refresh button (for testing)
5. Implement date range selector
6. Create reusable metric card component
7. Add loading states and error handling

**Deliverables:**
- Admin dashboard accessible at `/admin/analytics`
- Shows metrics 1-13 from user's list
- Refresh button works
- Responsive design

---

### Phase 3: AI Assistant Analytics (Week 3)
**Goal:** Track and display AI performance metrics

**Tasks:**
1. Enhance AI event tracking:
   - Track command type, success/failure, response time
   - Log failed commands with input text
   - Track disambiguation events
2. Build "AI Assistant" tab in dashboard:
   - Total commands processed
   - Success rate by command type
   - Failed commands table (sortable)
   - Cache hit rate
   - Average response time
3. Add export functionality (CSV) for failed commands
4. Implement filtering and search for failed commands

**Deliverables:**
- Comprehensive AI metrics
- Failed commands are logged and exportable
- Insights into AI performance

---

### Phase 4: User Support Tools (Week 4)
**Goal:** Enable admin to search users and view activity

**Tasks:**
1. Build `/admin/user-support` component
2. Implement user search (by email, ID, name)
3. Create user profile viewer:
   - Basic info (name, email, signup date, last active)
   - Lists count, articles count, shared lists count
   - Recent activity timeline (last 30 events)
4. Add user data export (JSON format for GDPR)
5. Implement "Delete User Account" with confirmation
6. Add error log viewer (filter by user ID)

**Deliverables:**
- User search working
- User profiles viewable
- Data export functional
- Delete account working

---

### Phase 5: Feature Flags & A/B Testing (Week 5)
**Goal:** Enable controlled feature rollouts and experiments

**Tasks:**
1. Create `FeatureFlagService`
2. Build `/admin/feature-flags` component:
   - List all flags
   - Create/edit flags
   - Toggle enabled/disabled
   - Set rollout percentage
   - Add user whitelist
3. Implement flag evaluation logic (cached)
4. Add A/B test variant assignment
5. Create example feature flag integration in code
6. Build experiment results viewer

**Deliverables:**
- Feature flags working
- Admin can create/toggle flags
- Code examples for using flags
- A/B test infrastructure ready

---

### Phase 6: User Feedback System (Week 6)
**Goal:** Allow users to submit feedback; admin can review

**Tasks:**
1. Create `FeedbackService`
2. Build user-facing feedback dialog:
   - Feedback type (bug, feature request, other)
   - Description field
   - Optional screenshot upload (Firebase Storage)
   - Auto-capture device/browser info
3. Build `/admin/feedback` component:
   - List all feedback
   - Filter by status/type
   - View details
   - Add admin notes
   - Mark as resolved
4. Add feedback trigger button in app (Help menu?)

**Deliverables:**
- Users can submit feedback
- Admin can review and manage feedback
- Screenshots attached automatically

---

### Phase 7: Automated Alerts (Week 7)
**Goal:** Get notified of critical events

**Tasks:**
1. Create `AlertingService`
2. Define alert conditions:
   - Error rate > 5% in last hour
   - No new users in 7 days
   - AI success rate < 80%
   - User churn > 30%
3. Build `/admin/alerts` component:
   - Configure alert rules
   - Set email recipients
   - View alert history
4. Implement email notifications:
   - Use Firebase Cloud Functions + SendGrid (free tier: 100 emails/day)
   - Or use Firebase Extensions (Trigger Email)
5. Add alert acknowledgment

**Deliverables:**
- Alerts configured and monitored
- Email notifications working
- Alert history visible

---

### Phase 8: Advanced Analytics & Visualizations (Week 8+)
**Goal:** Add charts, trends, and deeper insights

**Tasks:**
1. Integrate charting library (Chart.js or Apache ECharts)
2. Add visualizations:
   - User growth chart (line chart)
   - Feature adoption (bar chart)
   - Retention cohort (heatmap)
   - AI command distribution (pie chart)
   - Active users over time (line chart)
3. Add trend indicators (up/down arrows, % change)
4. Implement drill-down capabilities
5. Add comparative metrics (this week vs last week)

**Deliverables:**
- Beautiful charts and graphs
- Trend analysis
- Interactive visualizations

---

## Security & Access Control

### Admin Access Restriction

**Firestore Security Rules:**
```javascript
// Only allow specific admin user(s)
function isAdmin() {
  return request.auth != null &&
         request.auth.uid == 'YOUR_USER_ID_HERE';
}

match /analytics/{document=**} {
  allow read, write: if isAdmin();
}

match /admin/{document=**} {
  allow read, write: if isAdmin();
}
```

**Route Guard:**
```typescript
// admin.guard.ts
canActivate(): boolean {
  const currentUserId = this.authService.getCurrentUserId();
  const ADMIN_USER_ID = environment.adminUserId;
  return currentUserId === ADMIN_USER_ID;
}
```

---

## Technology Choices

### Analytics
- **Storage:** Firestore (already using, no new dependencies)
- **Aggregation:** Cloud Functions (scheduled) or client-side (simpler, no backend needed)
- **Charts:** Chart.js (free, lightweight) or Apache ECharts (more powerful)

### Feature Flags
- **Custom implementation** (Firestore-based)
- Alternative: Firebase Remote Config (free, but less flexible)

### User Feedback
- **Custom implementation** (Firestore + Firebase Storage for screenshots)
- Free alternative to: UserVoice, Canny, Instabug

### Alerting
- **Firebase Cloud Functions + SendGrid** (100 emails/day free)
- Alternative: Firebase Extensions "Trigger Email" (uses Gmail, simpler)

### A/B Testing
- **Custom implementation** (feature flags + metrics)
- Alternative: Firebase A/B Testing (free, integrated with Analytics)

---

## Metrics Summary (Your 13 + Recommended)

### Core Metrics (Your 13)
1. ✅ Total users
2. ✅ Total lists
3. ✅ Total shared lists
4. ✅ Max collaborators on a shared list
5. ✅ Total articles
6. ✅ Active users (using app every other week)
7. ✅ Average lists per user
8. ✅ Average active lists per user (every other week)
9. ✅ AI conversations count
10. ✅ AI inputs count
11. ✅ AI failed inputs (with examples)
12. ✅ Articles added via AI
13. ✅ Lists added via AI

### Additional High-Value Metrics
14. ✅ User retention (7/30/90-day cohorts)
15. ✅ Share invite acceptance rate
16. ✅ Feature adoption rates
17. ✅ Average session duration
18. ✅ Error rate
19. ✅ Most popular AI commands
20. ✅ Cache hit rate

---

## Testing Strategy

### Unit Tests
- `AnalyticsService` event batching
- `FeatureFlagService` flag evaluation
- `AggregationService` metric computation

### Integration Tests
- Event flow: track → batch → write → aggregate
- Admin dashboard data loading
- Feature flag integration in components

### Manual Testing Checklist
- [ ] Events tracked correctly
- [ ] Dashboard shows accurate metrics
- [ ] Refresh button updates data
- [ ] User search finds users
- [ ] Export downloads CSV
- [ ] Feature flags toggle correctly
- [ ] Feedback submission works
- [ ] Alerts trigger on conditions

---

## Monitoring & Maintenance

### Daily (Automated)
- Aggregate metrics from events
- Cleanup old events (>90 days)
- Check alert conditions
- Send digest email (optional)

### Weekly (Manual Review)
- Review key metrics trends
- Check failed AI commands
- Review user feedback
- Verify system health

### Monthly
- Export metrics for archival
- Review and archive resolved feedback
- Analyze retention cohorts
- Plan feature improvements based on data

---

## Future Enhancements (Post-MVP)

### Advanced Analytics
- User journey mapping (funnel analysis)
- Predictive churn modeling
- Anomaly detection (ML-based)
- Custom report builder

### Performance
- Real-time streaming dashboard (WebSockets)
- Mobile admin app
- Push notifications for alerts

### Integrations
- Optional Google Analytics 4 integration
- Slack notifications for alerts
- Zapier webhooks for automation

### User Features
- User-facing analytics (personal stats)
- Gamification (badges, streaks)
- Sharing analytics (shared list activity)

---

## Success Criteria

### Phase 1-2 (Foundation + Dashboard)
- ✅ Events being tracked reliably
- ✅ Dashboard shows all 13 core metrics
- ✅ Refresh works without waiting
- ✅ Costs < $0.01/day

### Phase 3-4 (AI + Support)
- ✅ Failed AI commands logged and exportable
- ✅ User search finds any user instantly
- ✅ Data export works (GDPR compliance)

### Phase 5-6 (Flags + Feedback)
- ✅ Can toggle feature on/off for testing
- ✅ Users can submit feedback with screenshots
- ✅ Admin can review and respond to feedback

### Phase 7-8 (Alerts + Viz)
- ✅ Email alerts sent when error rate spikes
- ✅ Charts show trends clearly
- ✅ Dashboard is intuitive and useful

---

## Next Steps

1. **Review this plan** - Confirm priorities and approach
2. **Set up admin user ID** - Add your Firebase UID to environment config
3. **Start Phase 1** - Implement AnalyticsService and event tracking
4. **Iterate based on learnings** - Adjust plan as we go

---

## Questions & Decisions

### Open Questions
- [ ] Should we use Cloud Functions or client-side aggregation? (Client-side = simpler, no backend)
- [ ] Chart library preference? (Chart.js = simple, ECharts = powerful)
- [ ] Email provider for alerts? (SendGrid = 100/day free, Firebase Extensions = easier)
- [ ] Want to add Google Analytics 4 alongside custom analytics?

### Decisions Made
- ✅ Build custom analytics (no paid tools)
- ✅ Daily aggregation with manual refresh
- ✅ Admin access: only you
- ✅ Cost optimization: critical requirement
- ✅ Feature flags: yes
- ✅ User feedback: yes (custom implementation)
- ✅ Alerts: yes (email notifications)
- ✅ Export: CSV format, no external BI tools

---

**Document Version:** 1.0
**Last Updated:** 2025-12-23
**Author:** Claude Code
**Status:** Ready for Implementation
