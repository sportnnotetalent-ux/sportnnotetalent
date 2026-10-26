/**
 * Signing out on a shared phone or browser: the device stops acting for the
 * account that's leaving. Found 2026-10-26: after a friend signed out and the
 * founder signed in on the same phone, the friend's pushes still arrived and
 * their in-app alert stayed in the list. One device token served three accounts.
 *  - phone: release its push token (the server row is the user's own, so this
 *    runs before the session ends); on the next sign-in, claim_push_token moves
 *    it to the new account in any case;
 *  - browser: unsubscribe web push, so the next person turns it on for themselves;
 *  - both: clear the in-app alerts and cancel the reminders scheduled on this device.
 * Never holds sign-out up for long: offline, it gives up after 3 s.
 */
import { Platform } from 'react-native';

export async function releaseDeviceForSignOut(): Promise<void> {
  const work = (async () => {
    const tasks: Promise<unknown>[] = [];
    if (Platform.OS === 'web') {
      tasks.push(import('./webPush').then((m) => m.disableWebPush()));
    } else {
      const n = await import('./notifications');
      const token = n.currentPushToken();
      if (token) tasks.push(import('../data/repos').then((r) => r.releasePushToken(token)));
    }
    tasks.push(import('./notifications').then((n) => n.forgetAccountOnDevice()));
    await Promise.allSettled(tasks);
  })();
  await Promise.race([work.catch(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
}
