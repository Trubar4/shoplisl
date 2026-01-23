# Next Session Prompt: Phase 6 - Feature Flags System

**Copy and paste this prompt to start your next Claude Code session**

---

## Session Prompt

```
Phase 6: Feature Flags System Implementation

I want to implement Phase 6 of the admin dashboard: Feature Flags System.

CONTEXT:
- Phases 1-5 are complete and merged to main
- Branch: claude/admin-analytics-phase-3-9ahuD-RZTKT was merged to main
- All features tested and working
- Admin dashboard fully functional with analytics and user support

CURRENT STATUS:
- Main branch has all Phase 1-5 code
- Phase 4: User Support Dashboard ✅
- Phase 5: Enhanced Dashboard with Charts ✅
- All features documented and tested
- Build successful, TypeScript strict mode compliant

GOAL:
Implement Phase 6: Feature Flags System (4-5 hours)

REQUIREMENTS:
1. Create FeatureFlagService with CRUD operations
2. Admin UI component (/admin/feature-flags route)
3. Flag editor dialog with Material Design
4. Support for:
   - Global enable/disable toggle
   - Rollout percentage (0-100%)
   - User whitelist (always enabled)
   - User blacklist (always disabled)
   - Deterministic rollout (same user always gets same result)
5. Firestore security rules for feature-flags collection
6. Navigation integration with existing admin dashboard
7. Full TypeScript strict mode compliance
8. Responsive Material Design

TECHNICAL DETAILS:
- Use Angular 18 with standalone components
- Material Design (already set up)
- Firestore for data storage
- Real-time updates with Firestore listeners
- Proper caching strategy
- Admin guard for route protection

IMPLEMENTATION PLAN:
Detailed plan available in: docs/PHASE_6_IMPLEMENTATION_PLAN.md

Key components:
1. FeatureFlagService (feature-flag.service.ts)
   - checkFeature(flagName, userId): Observable<boolean>
   - getAllFlags(): Observable<FeatureFlag[]>
   - createFlag(), updateFlag(), deleteFlag()
   - evaluateFlag() with priority: blacklist > whitelist > enabled > rollout%

2. Feature Flags Component (feature-flags.component.*)
   - Table view with mat-table
   - Quick toggle switches
   - Status badges (enabled/disabled/rollout%)
   - Edit/Delete actions

3. Flag Editor Dialog (flag-editor-dialog.component.*)
   - Form with name, description
   - Enable toggle
   - Rollout percentage slider
   - Chip inputs for whitelist/blacklist
   - Material Design dialog

4. Routing
   - Add /admin/feature-flags route
   - Update navigation in analytics-dashboard.component.html
   - Protect with AdminGuard

EVALUATION LOGIC:
```typescript
evaluateFlag(flag: FeatureFlag, userId: string): boolean {
  // 1. Blacklist (highest priority) - always false
  if (flag.userBlacklist?.includes(userId)) return false;

  // 2. Whitelist (second priority) - always true
  if (flag.userWhitelist?.includes(userId)) return true;

  // 3. Global enabled - if false, return false
  if (!flag.enabled) return false;

  // 4. Rollout percentage - deterministic hash
  const hash = hashUserId(userId, flagId) % 100;
  return hash < flag.rolloutPercentage;
}
```

FIRESTORE STRUCTURE:
```
feature-flags/
  {flagId}/
    - id: string
    - name: string (unique)
    - description: string
    - enabled: boolean
    - rolloutPercentage: number (0-100)
    - userWhitelist: string[]
    - userBlacklist: string[]
    - createdAt: timestamp
    - updatedAt: timestamp
    - createdBy: string
```

FIRESTORE RULES:
```javascript
match /feature-flags/{flagId} {
  allow read, write: if isAdmin();
  allow read: if request.auth != null;
}
```

SUCCESS CRITERIA:
- ✅ Service with all CRUD operations
- ✅ Admin UI with table and dialogs
- ✅ Create, edit, delete flags working
- ✅ Toggle switches functional
- ✅ Rollout percentage slider working
- ✅ Whitelist/blacklist chip inputs working
- ✅ Evaluation logic correct and deterministic
- ✅ TypeScript strict mode compliant
- ✅ Build successful
- ✅ Mobile responsive
- ✅ Documentation complete

DOCUMENTATION:
Please review these files before starting:
- docs/PHASE_6_IMPLEMENTATION_PLAN.md (complete implementation guide)
- docs/PHASE_4_5_FINAL_REPORT.md (what's already complete)
- docs/ADMIN_DASHBOARD_RECOMMENDATIONS.md (project overview)

BRANCH MANAGEMENT:
- Create new branch: claude/feature-flags-phase-6-{SESSION_ID}
- Branch should start with 'claude/' and end with session ID
- When done, push to remote
- I will create PR to merge to main

TESTING:
After implementation, please:
1. Create a test feature flag
2. Verify toggle switch works
3. Test rollout percentage with different values
4. Test whitelist/blacklist functionality
5. Verify deterministic rollout (same user always same result)
6. Check mobile responsive
7. Ensure no TypeScript errors
8. Confirm build successful

Please start by:
1. Reading the implementation plan
2. Creating the FeatureFlagService
3. Implementing the admin UI component
4. Creating the flag editor dialog
5. Adding Firestore rules
6. Updating navigation
7. Testing all functionality
8. Creating completion documentation

Let me know when you're ready to start!
```

---

## Quick Reference

**Branch to create:** `claude/feature-flags-phase-6-{SESSION_ID}`

**Key Files to Create:**
1. `feature-flag.service.ts`
2. `feature-flags.component.ts/html/scss`
3. `flag-editor-dialog.component.ts/html/scss`

**Key Files to Modify:**
1. `firestore.rules`
2. `admin.module.ts` (routing)
3. `analytics-dashboard.component.html` (navigation)

**Documentation to Create:**
1. `docs/PHASE_6_SUMMARY.md`
2. `docs/FEATURE_FLAGS_ADMIN_GUIDE.md`
3. `docs/FEATURE_FLAGS_DEVELOPER_GUIDE.md`

**Time Estimate:** 4-5 hours

**After Completion:**
- Test thoroughly
- Create documentation
- Push to remote
- Create PR to merge to main
- Ready for Phase 7 (User Feedback System)

---

*Last Updated: 2026-01-23*
*Ready for next session*
