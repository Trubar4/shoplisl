import { test as base, expect as baseExpect, Page } from '@playwright/test';

/**
 * IMPORTANT: ShopLisl uses Google Sign-In
 *
 * You MUST log in manually before running tests:
 * 1. Run: npm run test:e2e:headed
 * 2. Browser opens - manually click "melden Sie sich an" and log in with Google
 * 3. After logging in, run tests again - browser stays logged in
 *
 * OR use headed mode to log in during test run
 */

export const test = base;
export const expect = baseExpect;
