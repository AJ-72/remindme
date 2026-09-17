// jest.resetModules() between cases gives each test fresh instances of both
// the service and its expo-secure-store mock — simulating an app restart —
// while the mock's backing store lives on `globalThis` and survives that
// reset, simulating persisted on-device storage. See
// __mocks__/expo-secure-store.ts for why.

// eslint-disable-next-line @typescript-eslint/no-var-requires
function freshImport() {
  jest.resetModules();
  const SecureStore = require("expo-secure-store");
  const service = require("@/services/DeviceIdentityService");
  return { SecureStore, service };
}

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const SecureStore = require("expo-secure-store");
  (SecureStore as unknown as { __clearMockStorageForTests: () => void }).__clearMockStorageForTests();
});

describe("DeviceIdentityService", () => {
  it("is absent on a fresh install", async () => {
    const { service } = freshImport();
    expect(await service.hasDeviceKey()).toBe(false);
  });

  it("generates a key on first use, entirely locally", async () => {
    const { SecureStore, service } = freshImport();
    const key = await service.getOrCreateDeviceKey();

    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), key);
  });

  it("survives a simulated app restart: same key, no second write", async () => {
    const first = freshImport();
    const key1 = await first.service.getOrCreateDeviceKey();

    // Simulate a restart: new module instances, same underlying storage.
    const second = freshImport();
    expect(await second.service.hasDeviceKey()).toBe(true);

    const key2 = await second.service.getOrCreateDeviceKey();
    expect(key2).toBe(key1);
    // The restarted instance found an existing key and must not overwrite it.
    expect(second.SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("is idempotent under concurrent callers: only one key is ever generated", async () => {
    const { SecureStore, service } = freshImport();

    const [a, b, c] = await Promise.all([
      service.getOrCreateDeviceKey(),
      service.getOrCreateDeviceKey(),
      service.getOrCreateDeviceKey(),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });

  it("repeated calls after the key exists never write again", async () => {
    const { SecureStore, service } = freshImport();
    await service.getOrCreateDeviceKey();
    await service.getOrCreateDeviceKey();
    await service.getOrCreateDeviceKey();

    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });
});
