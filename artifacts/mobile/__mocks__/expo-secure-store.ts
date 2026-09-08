// Manual mock for expo-secure-store.
//
// Backed by `globalThis` rather than module-local state so the fake "device
// storage" survives `jest.resetModules()` — that's how
// DeviceIdentityService.test.ts simulates an app restart (fresh module
// instances, same underlying storage) without also losing what was
// persisted. `__clearMockStorageForTests` is the fresh-install reset, since
// it operates on the same shared backing store regardless of which module
// instance calls it.

const globalWithStore = globalThis as unknown as {
  __mockSecureStore?: Map<string, string>;
};

function backing(): Map<string, string> {
  if (!globalWithStore.__mockSecureStore) {
    globalWithStore.__mockSecureStore = new Map();
  }
  return globalWithStore.__mockSecureStore;
}

export const getItemAsync = jest.fn(async (key: string): Promise<string | null> => {
  return backing().get(key) ?? null;
});

export const setItemAsync = jest.fn(async (key: string, value: string): Promise<void> => {
  backing().set(key, value);
});

export const deleteItemAsync = jest.fn(async (key: string): Promise<void> => {
  backing().delete(key);
});

export function __clearMockStorageForTests(): void {
  backing().clear();
}
