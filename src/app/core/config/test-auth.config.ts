/**
 * Test Authentication Configuration
 *
 * Enables simple email/password auth ONLY for E2E testing
 * Production continues to use Google Sign-In
 */

// Set this in your test environment
export const E2E_TEST_MODE = {
  enabled: typeof window !== 'undefined' && (window as any).E2E_TEST_MODE === true,
  testUser: {
    id: 'test-user-e2e-1',
    email: 'test@e2e.local',
    name: 'E2E Test User',
    photoURL: null,
    createdAt: new Date()
  }
};

/**
 * Check if running in E2E test mode
 */
export function isE2ETestMode(): boolean {
  return E2E_TEST_MODE.enabled;
}

/**
 * Get test user for E2E mode
 */
export function getTestUser() {
  return E2E_TEST_MODE.testUser;
}
