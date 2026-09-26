/**
 * B26 test-fire: schedule a real notification a few seconds out and wait for
 * the OS to actually deliver it. A permission check only says delivery is
 * allowed; this says it happened.
 *
 * Deps are injected so the race (arrival vs timeout vs schedule failure) is
 * testable without expo-notifications. Arrival is matched on a per-run token in
 * the payload so a real reminder firing meanwhile cannot count as a pass.
 *
 * Limit: the received listener only fires while the app process is alive, so
 * this proves foreground delivery, not delivery to a killed app.
 */

export type TestFireResult = "arrived" | "timeout" | "schedule_failed";

export interface TestFireDeps {
  schedule: (token: string) => Promise<string>;
  cancel: (notificationId: string) => Promise<void>;
  onReceived: (
    cb: (data: Record<string, unknown> | undefined) => void
  ) => { remove: () => void };
  timeoutMs: number;
}

export const TEST_FIRE_DELAY_SECONDS = 5;
export const TEST_FIRE_TIMEOUT_MS = 20_000;

let runCounter = 0;

export function runDeliveryTestFire(deps: TestFireDeps): Promise<TestFireResult> {
  const token = `selftest-${Date.now()}-${++runCounter}`;
  return new Promise<TestFireResult>((resolve) => {
    let settled = false;
    let notificationId: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sub = deps.onReceived((data) => {
      if (data?.deliverySelfTest === token) finish("arrived");
    });

    function finish(result: TestFireResult) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      sub.remove();
      if (result === "timeout" && notificationId) {
        deps.cancel(notificationId).catch(() => {});
      }
      resolve(result);
    }

    deps.schedule(token).then(
      (id) => {
        notificationId = id;
        if (!settled) timer = setTimeout(() => finish("timeout"), deps.timeoutMs);
      },
      () => finish("schedule_failed")
    );
  });
}
