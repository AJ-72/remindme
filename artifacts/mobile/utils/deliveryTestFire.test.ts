import { runDeliveryTestFire, type TestFireDeps } from "./deliveryTestFire";

function makeDeps(overrides: Partial<TestFireDeps> = {}) {
  let listener: ((data: Record<string, unknown> | undefined) => void) | null = null;
  const remove = jest.fn();
  const deps: TestFireDeps = {
    schedule: jest.fn().mockResolvedValue("notif-1"),
    cancel: jest.fn().mockResolvedValue(undefined),
    onReceived: (cb) => {
      listener = cb;
      return { remove };
    },
    timeoutMs: 1000,
    ...overrides,
  };
  return { deps, remove, fire: (d: Record<string, unknown> | undefined) => listener?.(d) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("runDeliveryTestFire", () => {
  it("resolves arrived when the notification carrying its token is received", async () => {
    const { deps, remove, fire } = makeDeps();
    const p = runDeliveryTestFire(deps);
    await Promise.resolve();
    const token = (deps.schedule as jest.Mock).mock.calls[0][0];
    fire({ deliverySelfTest: token });
    await expect(p).resolves.toBe("arrived");
    expect(remove).toHaveBeenCalled();
  });

  it("ignores other notifications (e.g. a real reminder firing meanwhile)", async () => {
    const { deps, fire } = makeDeps();
    const p = runDeliveryTestFire(deps);
    await Promise.resolve();
    fire({ reminderId: "r1" });
    fire(undefined);
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toBe("timeout");
  });

  it("times out and cancels the pending notification when nothing arrives", async () => {
    const { deps, remove } = makeDeps();
    const p = runDeliveryTestFire(deps);
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toBe("timeout");
    expect(deps.cancel).toHaveBeenCalledWith("notif-1");
    expect(remove).toHaveBeenCalled();
  });

  it("reports schedule_failed when scheduling throws", async () => {
    const { deps, remove } = makeDeps({
      schedule: jest.fn().mockRejectedValue(new Error("no permission")),
    });
    await expect(runDeliveryTestFire(deps)).resolves.toBe("schedule_failed");
    expect(remove).toHaveBeenCalled();
  });

  it("uses a fresh token per run", async () => {
    const { deps, fire } = makeDeps();
    const p1 = runDeliveryTestFire(deps);
    await Promise.resolve();
    const t1 = (deps.schedule as jest.Mock).mock.calls[0][0];
    fire({ deliverySelfTest: t1 });
    await p1;
    const p2 = runDeliveryTestFire(deps);
    await Promise.resolve();
    const t2 = (deps.schedule as jest.Mock).mock.calls[1][0];
    expect(t2).not.toBe(t1);
    fire({ deliverySelfTest: t2 });
    await expect(p2).resolves.toBe("arrived");
  });
});
