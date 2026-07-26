import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@debug_logs_v1";
const MAX_ENTRIES = 200;

export interface DebugLogEntry {
  timestamp: string;
  message: string;
}

let cache: DebugLogEntry[] | null = null;
// Serializes reads/writes so concurrent logDebug() calls (expected during
// the share-intent pipeline, which logs several steps in quick succession)
// can't clobber each other with a lost update.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}

async function readAll(): Promise<DebugLogEntry[]> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  cache = raw ? JSON.parse(raw) : [];
  return cache!;
}

async function writeAll(entries: DebugLogEntry[]): Promise<void> {
  cache = entries;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function logDebug(message: string): Promise<void> {
  return enqueue(async () => {
    const entries = await readAll();
    entries.push({ timestamp: new Date().toISOString(), message });
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    await writeAll(entries);
  });
}

export function getDebugLogs(): Promise<DebugLogEntry[]> {
  return enqueue(async () => [...(await readAll())]);
}

export function clearDebugLogs(): Promise<void> {
  return enqueue(() => writeAll([]));
}

export function formatDebugLogs(entries: DebugLogEntry[]): string {
  return entries.map((e) => `[${e.timestamp}] ${e.message}`).join("\n\n");
}
