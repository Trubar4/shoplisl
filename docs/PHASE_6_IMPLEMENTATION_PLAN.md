# Phase 6: Feature Flags System - Implementation Plan

**Date:** 2026-01-23
**Branch:** To be created in next session
**Estimated Time:** 4-5 hours
**Status:** Ready to implement

---

## Overview

Phase 6 implements a comprehensive feature flags system that allows admins to:
- Create and manage feature flags
- Toggle features on/off for all users
- Gradual rollout (percentage-based)
- User whitelisting/blacklisting
- A/B testing infrastructure

---

## Business Value

### Why Feature Flags?

1. **Safe Deployments** - Deploy code without activating features
2. **Quick Rollback** - Disable problematic features instantly
3. **Gradual Rollouts** - Test with 10% → 50% → 100% of users
4. **A/B Testing** - Compare different implementations
5. **User Targeting** - Beta test with specific users

### Use Cases

**Scenario 1: New AI Feature**
- Deploy code with flag disabled
- Enable for 5 beta testers (whitelist)
- If good, rollout to 10% of users
- If still good, increase to 50%, then 100%
- If issues found, disable instantly

**Scenario 2: Risky Change**
- Deploy with flag disabled
- Enable only for yourself (whitelist)
- Test thoroughly
- Gradually increase percentage
- Monitor analytics for issues

**Scenario 3: Emergency Disable**
- Feature causing errors in production
- Admin disables flag
- Feature immediately disabled for all users
- Fix deployed, flag re-enabled

---

## Architecture

### Data Model

**Firestore Structure:**
```
feature-flags/
  ├── {flagId}/
  │   ├── id: string
  │   ├── name: string
  │   ├── description: string
  │   ├── enabled: boolean
  │   ├── rolloutPercentage: number (0-100)
  │   ├── userWhitelist: string[] (user IDs)
  │   ├── userBlacklist: string[] (user IDs)
  │   ├── createdAt: timestamp
  │   ├── updatedAt: timestamp
  │   └── createdBy: string (admin user ID)
```

### Service Architecture

```
FeatureFlagService
├── checkFeature(flagName, userId): boolean
├── getAllFlags(): Observable<FeatureFlag[]>
├── getFlag(flagId): Observable<FeatureFlag>
├── createFlag(flag): Promise<void>
├── updateFlag(flagId, data): Promise<void>
├── deleteFlag(flagId): Promise<void>
└── evaluateFlag(flag, userId): boolean
    ├── Check if user in blacklist → false
    ├── Check if user in whitelist → true
    ├── Check if globally enabled → false
    ├── Check rollout percentage → random < percentage
    └── Default → false
```

### Component Architecture

```
/admin/feature-flags
├── Feature Flags List (table view)
│   ├── Flag name & description
│   ├── Status indicator (enabled/disabled)
│   ├── Rollout percentage badge
│   ├── Quick toggle switch
│   └── Edit/Delete actions
│
└── Feature Flag Editor (dialog)
    ├── Basic Info (name, description)
    ├── Enable toggle
    ├── Rollout percentage slider (0-100%)
    ├── User whitelist (chip input)
    ├── User blacklist (chip input)
    └── Save/Cancel buttons
```

---

## Implementation Steps

### Step 1: Create Feature Flag Service (1 hour)

**File:** `src/app/core/services/feature-flag.service.ts`

**Methods:**
```typescript
@Injectable({ providedIn: 'root' })
export class FeatureFlagService {
  // Admin methods (create, update, delete flags)
  getAllFlags(): Observable<FeatureFlag[]>
  getFlag(flagId: string): Observable<FeatureFlag>
  createFlag(flag: Partial<FeatureFlag>): Promise<string>
  updateFlag(flagId: string, data: Partial<FeatureFlag>): Promise<void>
  deleteFlag(flagId: string): Promise<void>

  // Runtime evaluation
  checkFeature(flagName: string, userId: string): Observable<boolean>
  evaluateFlag(flag: FeatureFlag, userId: string): boolean

  // Utilities
  generateFlagId(name: string): string
  isUserInWhitelist(userId: string, whitelist: string[]): boolean
  shouldRolloutToUser(percentage: number): boolean
}
```

**Key Logic:**
```typescript
evaluateFlag(flag: FeatureFlag, userId: string): boolean {
  // 1. Check blacklist (highest priority)
  if (flag.userBlacklist?.includes(userId)) {
    return false;
  }

  // 2. Check whitelist (second priority)
  if (flag.userWhitelist?.includes(userId)) {
    return true;
  }

  // 3. Check global enabled
  if (!flag.enabled) {
    return false;
  }

  // 4. Check rollout percentage
  if (flag.rolloutPercentage !== undefined) {
    // Use deterministic hash for consistency
    const hash = this.hashUserId(userId, flag.id);
    const userPercentile = hash % 100;
    return userPercentile < flag.rolloutPercentage;
  }

  // Default: enabled for everyone if globally enabled
  return true;
}

// Deterministic hash ensures same user always gets same result
private hashUserId(userId: string, flagId: string): number {
  let hash = 0;
  const str = userId + flagId;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
```

### Step 2: Create Admin UI Component (2 hours)

**File:** `src/app/features/admin/feature-flags/feature-flags.component.ts`

**Template Structure:**
```html
<div class="feature-flags-dashboard">
  <!-- Header -->
  <div class="dashboard-header">
    <h1>🚩 Feature Flags</h1>
    <button mat-raised-button color="primary" (click)="createFlag()">
      <mat-icon>add</mat-icon>
      Create Flag
    </button>
  </div>

  <!-- Flags Table -->
  <mat-card>
    <table mat-table [dataSource]="flags">
      <!-- Name Column -->
      <ng-container matColumnDef="name">
        <th mat-header-cell *matHeaderCellDef>Flag Name</th>
        <td mat-cell *matCellDef="let flag">
          <strong>{{ flag.name }}</strong>
          <div class="flag-description">{{ flag.description }}</div>
        </td>
      </ng-container>

      <!-- Status Column -->
      <ng-container matColumnDef="status">
        <th mat-header-cell *matHeaderCellDef>Status</th>
        <td mat-cell *matCellDef="let flag">
          <mat-slide-toggle
            [checked]="flag.enabled"
            (change)="toggleFlag(flag, $event)">
          </mat-slide-toggle>
        </td>
      </ng-container>

      <!-- Rollout Column -->
      <ng-container matColumnDef="rollout">
        <th mat-header-cell *matHeaderCellDef>Rollout</th>
        <td mat-cell *matCellDef="let flag">
          <mat-chip-set>
            <mat-chip [color]="getRolloutColor(flag.rolloutPercentage)">
              {{ flag.rolloutPercentage }}%
            </mat-chip>
          </mat-chip-set>
        </td>
      </ng-container>

      <!-- Whitelist Column -->
      <ng-container matColumnDef="whitelist">
        <th mat-header-cell *matHeaderCellDef>Whitelist</th>
        <td mat-cell *matCellDef="let flag">
          {{ flag.userWhitelist?.length || 0 }} users
        </td>
      </ng-container>

      <!-- Actions Column -->
      <ng-container matColumnDef="actions">
        <th mat-header-cell *matHeaderCellDef>Actions</th>
        <td mat-cell *matCellDef="let flag">
          <button mat-icon-button (click)="editFlag(flag)">
            <mat-icon>edit</mat-icon>
          </button>
          <button mat-icon-button (click)="deleteFlag(flag)">
            <mat-icon>delete</mat-icon>
          </button>
        </td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
    </table>
  </mat-card>
</div>
```

### Step 3: Create Flag Editor Dialog (1.5 hours)

**File:** `src/app/features/admin/feature-flags/flag-editor-dialog.component.ts`

**Template:**
```html
<h2 mat-dialog-title>{{ data.flag ? 'Edit' : 'Create' }} Feature Flag</h2>

<mat-dialog-content>
  <form [formGroup]="flagForm">
    <!-- Name -->
    <mat-form-field appearance="outline">
      <mat-label>Flag Name</mat-label>
      <input matInput formControlName="name" placeholder="new-ai-feature">
      <mat-hint>Use kebab-case (e.g., new-ai-feature)</mat-hint>
    </mat-form-field>

    <!-- Description -->
    <mat-form-field appearance="outline">
      <mat-label>Description</mat-label>
      <textarea matInput formControlName="description" rows="3"></textarea>
    </mat-form-field>

    <!-- Enabled Toggle -->
    <div class="form-field">
      <mat-slide-toggle formControlName="enabled">
        Enabled Globally
      </mat-slide-toggle>
      <mat-hint>When disabled, only whitelisted users can access</mat-hint>
    </div>

    <!-- Rollout Percentage -->
    <div class="form-field">
      <label>Rollout Percentage: {{ flagForm.value.rolloutPercentage }}%</label>
      <mat-slider
        min="0"
        max="100"
        step="5"
        formControlName="rolloutPercentage">
      </mat-slider>
      <mat-hint>0% = nobody, 100% = everyone (if enabled)</mat-hint>
    </div>

    <!-- User Whitelist -->
    <mat-form-field appearance="outline">
      <mat-label>User Whitelist (always enabled)</mat-label>
      <mat-chip-grid #whitelistChips formControlName="userWhitelist">
        <mat-chip-row
          *ngFor="let user of flagForm.value.userWhitelist"
          (removed)="removeFromWhitelist(user)">
          {{ user }}
          <button matChipRemove><mat-icon>cancel</mat-icon></button>
        </mat-chip-row>
      </mat-chip-grid>
      <input
        [matChipInputFor]="whitelistChips"
        (matChipInputTokenEnd)="addToWhitelist($event)">
      <mat-hint>Enter user IDs or emails</mat-hint>
    </mat-form-field>

    <!-- User Blacklist -->
    <mat-form-field appearance="outline">
      <mat-label>User Blacklist (always disabled)</mat-label>
      <mat-chip-grid #blacklistChips formControlName="userBlacklist">
        <mat-chip-row
          *ngFor="let user of flagForm.value.userBlacklist"
          (removed)="removeFromBlacklist(user)">
          {{ user }}
          <button matChipRemove><mat-icon>cancel</mat-icon></button>
        </mat-chip-row>
      </mat-chip-grid>
      <input
        [matChipInputFor]="blacklistChips"
        (matChipInputTokenEnd)="addToBlacklist($event)">
      <mat-hint>Enter user IDs or emails</mat-hint>
    </mat-form-field>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-button (click)="cancel()">Cancel</button>
  <button
    mat-raised-button
    color="primary"
    [disabled]="!flagForm.valid"
    (click)="save()">
    {{ data.flag ? 'Update' : 'Create' }}
  </button>
</mat-dialog-actions>
```

### Step 4: Add Firestore Security Rules (15 min)

**File:** `firestore.rules`

```javascript
// Feature Flags - Admin only
match /feature-flags/{flagId} {
  // Admins can do everything
  allow read, write: if isAdmin();

  // Regular users can only read
  allow read: if request.auth != null;
}
```

### Step 5: Add Navigation & Routing (15 min)

**File:** `src/app/features/admin/admin.module.ts`

```typescript
const routes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [AdminGuard],
    children: [
      { path: '', redirectTo: 'analytics', pathMatch: 'full' },
      { path: 'analytics', component: AnalyticsDashboardComponent },
      { path: 'user-support', component: UserSupportComponent },
      { path: 'feature-flags', component: FeatureFlagsComponent }, // NEW
      { path: 'quota-monitor', component: QuotaMonitorComponent },
    ]
  }
];
```

**Update Navigation in Template:**
```html
<button mat-raised-button routerLink="/admin/feature-flags" routerLinkActive="active-nav">
  <mat-icon>flag</mat-icon>
  Feature Flags
</button>
```

### Step 6: Usage Example (15 min)

**How to use in components:**

```typescript
// In any component
export class MyComponent {
  private featureFlagService = inject(FeatureFlagService);
  private authService = inject(AuthService);

  showNewAIFeature$ = this.authService.user$.pipe(
    switchMap(user =>
      this.featureFlagService.checkFeature('new-ai-feature', user.uid)
    )
  );
}
```

```html
<!-- In template -->
<div *ngIf="showNewAIFeature$ | async">
  <!-- New AI Feature UI -->
  <button>Try New AI Feature</button>
</div>
```

**Service-level usage:**
```typescript
// In a service
async processCommand(command: string, userId: string) {
  const useNewAI = await firstValueFrom(
    this.featureFlagService.checkFeature('new-ai-model', userId)
  );

  if (useNewAI) {
    return this.processWithNewModel(command);
  } else {
    return this.processWithOldModel(command);
  }
}
```

---

## Testing Strategy

### Unit Tests

1. **FeatureFlagService Tests**
   - `evaluateFlag()` with different configurations
   - Blacklist takes priority over whitelist
   - Rollout percentage is deterministic
   - Hash function distributes evenly

2. **Component Tests**
   - Flags list displays correctly
   - Toggle switch updates flag
   - Dialog opens and saves

### Integration Tests

1. **End-to-End Scenarios**
   - Create flag → appears in list
   - Toggle flag → reflected in UI
   - Edit flag → changes saved
   - Delete flag → removed from list
   - User checks flag → correct result

### Manual Testing

1. **Create Test Flag**
   - Name: `test-feature`
   - Enabled: Yes
   - Rollout: 50%
   - Whitelist: Your user ID

2. **Test Scenarios**
   - Verify you always see feature (whitelist)
   - Disable flag → feature hidden
   - Add user to blacklist → feature hidden even if whitelisted
   - Set rollout to 100% → everyone sees it
   - Set rollout to 0% → only whitelist sees it

---

## UI/UX Design

### Color Coding

- **Enabled + 100% rollout:** Green badge
- **Enabled + partial rollout:** Orange badge
- **Disabled:** Red badge
- **Whitelisted users only:** Blue badge

### Status Indicators

```
🟢 100% Enabled     (green)
🟠 50% Rollout      (orange)
🔴 Disabled         (red)
🔵 Whitelist Only   (blue)
```

### Confirmation Dialogs

- Delete flag: "Are you sure? This cannot be undone."
- Disable flag: "Disable [flag name]? This will affect all users."

---

## Security Considerations

1. **Admin-Only Access**
   - Only admins can create/edit/delete flags
   - Regular users can only read flags

2. **Validation**
   - Flag names must be unique
   - Rollout percentage: 0-100
   - User IDs validated before adding to whitelist/blacklist

3. **Audit Trail**
   - Track who created/modified flags
   - Log flag changes to analytics
   - Include timestamps

---

## Performance Considerations

1. **Caching**
   - Cache flag results for 5 minutes
   - Invalidate cache on flag update
   - Per-user cache to avoid recalculation

2. **Firestore Optimization**
   - Index on `enabled` field
   - Limit queries to active flags
   - Use real-time listeners for admin UI

3. **Client-Side Evaluation**
   - Fetch all flags once on app startup
   - Evaluate locally (no Firestore query per check)
   - Update flags via real-time listener

---

## Edge Cases

1. **Flag Not Found**
   - Default to `false` (feature disabled)
   - Log warning to console

2. **User Not Logged In**
   - Treat as userId = 'anonymous'
   - Usually returns `false`

3. **Rollout Percentage Changes**
   - User may see feature appear/disappear
   - Accept as expected behavior
   - Document in admin UI

4. **Conflicting Settings**
   - User in both whitelist AND blacklist
   - Blacklist wins (priority order)

---

## Migration & Rollback

### Adding First Flag

1. Create flag with 0% rollout
2. Test with whitelisted users
3. Gradually increase percentage
4. Monitor analytics for issues

### Removing a Flag

1. Set rollout to 0%
2. Monitor for 24 hours
3. If no issues, delete flag
4. Remove code that checks flag

### Emergency Rollback

1. Set enabled = false
2. Feature instantly disabled for all users
3. Fix issue
4. Re-enable flag

---

## Documentation

### Admin Guide

Create `docs/FEATURE_FLAGS_ADMIN_GUIDE.md`:
- How to create a flag
- How to gradually rollout
- How to handle emergencies
- Best practices

### Developer Guide

Create `docs/FEATURE_FLAGS_DEVELOPER_GUIDE.md`:
- How to add flag checks to code
- Naming conventions
- Testing with flags
- Cleanup process

---

## Success Criteria

Phase 6 is complete when:

- [x] FeatureFlagService implemented
- [x] Admin UI component created
- [x] Flag editor dialog working
- [x] CRUD operations functional
- [x] Firestore rules updated
- [x] Navigation added
- [x] Toggle switches work
- [x] Rollout percentage slider works
- [x] Whitelist/blacklist chip inputs work
- [x] Evaluation logic correct
- [x] TypeScript strict mode compliant
- [x] Build successful
- [x] Tests passing
- [x] Documentation complete

---

## Files to Create

### New Files

1. `src/app/core/services/feature-flag.service.ts`
2. `src/app/features/admin/feature-flags/feature-flags.component.ts`
3. `src/app/features/admin/feature-flags/feature-flags.component.html`
4. `src/app/features/admin/feature-flags/feature-flags.component.scss`
5. `src/app/features/admin/feature-flags/flag-editor-dialog.component.ts`
6. `src/app/features/admin/feature-flags/flag-editor-dialog.component.html`
7. `src/app/features/admin/feature-flags/flag-editor-dialog.component.scss`
8. `docs/FEATURE_FLAGS_ADMIN_GUIDE.md`
9. `docs/FEATURE_FLAGS_DEVELOPER_GUIDE.md`
10. `docs/PHASE_6_SUMMARY.md`

### Modified Files

1. `firestore.rules` - Add feature-flags rules
2. `src/app/features/admin/admin.module.ts` - Add routing
3. `src/app/features/admin/analytics-dashboard/analytics-dashboard.component.html` - Add navigation button

---

## Estimated Timeline

| Task | Time |
|------|------|
| Feature Flag Service | 1 hour |
| Admin UI Component | 2 hours |
| Flag Editor Dialog | 1.5 hours |
| Firestore Rules | 15 min |
| Navigation & Routing | 15 min |
| Testing | 30 min |
| Documentation | 30 min |
| **Total** | **4.5-5 hours** |

---

## Next Steps After Phase 6

Once Phase 6 is complete:

1. **Test Thoroughly**
   - Create test flags
   - Verify all scenarios
   - Check mobile responsive

2. **Document Usage**
   - Add examples to docs
   - Create admin guide
   - Update developer guide

3. **Deploy to Production**
   - Update Firestore rules
   - Deploy application
   - Monitor for issues

4. **Proceed to Phase 7**
   - User Feedback System (2-3 hours)

---

*Last Updated: 2026-01-23*
*Status: Ready for Implementation*
*Estimated Effort: 4-5 hours*
