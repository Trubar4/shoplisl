/**
 * Global setup for integration tests
 *
 * This runs once before all integration tests to verify emulators are running.
 */

export default async function globalSetup() {
  console.log('🔧 Checking Firebase emulators...');

  // Check if Firestore emulator is running
  try {
    const firestoreResponse = await fetch('http://localhost:8080');
    if (!firestoreResponse.ok) {
      throw new Error('Firestore emulator not responding');
    }
    console.log('✅ Firestore emulator is running on port 8080');
  } catch (error) {
    console.error('❌ Firestore emulator is not running on port 8080');
    console.error('   Please start emulators with: npm run emulators:start');
    process.exit(1);
  }

  // Check if Auth emulator is running
  try {
    const authResponse = await fetch('http://localhost:9099');
    if (!authResponse.ok) {
      throw new Error('Auth emulator not responding');
    }
    console.log('✅ Auth emulator is running on port 9099');
  } catch (error) {
    console.error('❌ Auth emulator is not running on port 9099');
    console.error('   Please start emulators with: npm run emulators:start');
    process.exit(1);
  }

  console.log('✅ All emulators are ready!\n');
}
