// expo-task-manager has no native module under Jest, so importing it for real
// throws "Cannot find native module 'ExpoTaskManager'" at module load. The
// task files call defineTask at load time by design (it must be registered
// before TaskManager wakes a headless JS runtime), so any test that imports
// one needs this stub.
//
// defineTask records the handler so a test can invoke it directly, which is
// the only way to exercise a task body without a real background wake.
const definedTasks = new Map<string, (...args: any[]) => unknown>();

export const defineTask = jest.fn((name: string, handler: (...args: any[]) => unknown) => {
  definedTasks.set(name, handler);
});

export const isTaskRegisteredAsync = jest.fn(async () => false);
export const unregisterTaskAsync = jest.fn(async () => {});
export const getRegisteredTasksAsync = jest.fn(async () => []);

export function __getDefinedTask(name: string) {
  return definedTasks.get(name);
}

export function __clearDefinedTasks() {
  definedTasks.clear();
}
