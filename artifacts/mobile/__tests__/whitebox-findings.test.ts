import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  STORAGE_KEY,
  loadReminders,
  markNotifiedById,
  toggleComplete,
  type Reminder,
} from "@/services/ReminderService";
import { normalizeForIdentity } from "@/utils/phoneNumber";
import { mergeReminders } from "@/utils/reminderBackup";

/**
 * White-box review findings, one describe block each.
 *
 * Every case uses `it.failing`: it asserts the SAFE behaviour and is expected
 * to fail today, so the suite stays green while the defect is on record. Each
 * turns red the moment the defect is repaired - that is the signal to drop the
 * `.failing` and keep the assertion.
 */

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    title: "Take BP tablets",
    description: "",
    datetime: new Date(Date.now() + 3600_000).toISOString(),
    completed: false,
    ...over,
  };
}

describe("W4 - a context write erases notifiedAt", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  /**
   * markNotifiedById() writes straight to storage and RemindersContext never
   * mirrors the stamp into its own `reminders` state (unlike markOpened, which
   * does). Every context writer - toggleComplete, snoozeReminder, editReminder,
   * addReminder, deleteReminder - then saves that stale array whole, so the
   * stamp is gone. withWriteLock cannot help: these writers are not in the
   * queue, and the losing read happened in React state, not in the service.
   */
  it.failing("keeps notifiedAt when the next context write lands", async () => {
    const r = reminder();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));

    // A notification arrives while the app is open.
    await markNotifiedById(r.id);
    const stamped = await loadReminders();
    expect(stamped[0].notifiedAt).toBeTruthy();

    // The UI still holds the snapshot it rendered from, taken before the
    // stamp, and writes the whole array back.
    await toggleComplete([r], r.id);

    const after = await loadReminders();
    expect(after[0].completed).toBe(true);
    expect(after[0].notifiedAt).toBeTruthy();
  });
});

describe("W5 - normalizeForIdentity keeps a national trunk zero", () => {
  /**
   * The trunk-prefix branch strips the leading 0 only for a number of exactly
   * 11 digits, which fits India and the UK. Australia and every other region
   * with a 9-digit national number fall through to the bare-national branch,
   * which prepends the calling code WITHOUT stripping the zero.
   *
   * The result is a wrong E.164, it hashes to something no sender produces,
   * and the recipient simply looks like they never installed the app - the
   * exact silent, permanent failure the function's own header warns about.
   */
  it.failing("strips the trunk zero from a 10-digit Australian mobile", () => {
    expect(normalizeForIdentity("0412 345 678", "AU").e164).toBe("+61412345678");
  });

  it("resolves the same number in explicit international form", () => {
    // The workaround, and the proof the two forms disagree today.
    expect(normalizeForIdentity("+61412345678", "AU").e164).toBe("+61412345678");
  });
});

describe("W6 - import deletes pre-existing local reminders", () => {
  /**
   * mergeReminders() runs its content-identity de-duplication over the LOCAL
   * list as well as the incoming one, so importing a backup permanently drops
   * a reminder the user already had whenever two of them share a title and an
   * instant - two people to call "Medicine" at 08:00, say. Nothing in the
   * import flow is meant to remove local data; "local always wins" promises
   * the opposite.
   */
  it.failing("never drops a local reminder that the backup did not mention", () => {
    const at = new Date(Date.now() + 3600_000).toISOString();
    const local = [
      reminder({ id: "a", title: "Medicine", datetime: at }),
      reminder({ id: "b", title: "Medicine", datetime: at }),
    ];

    const merged = mergeReminders(local, []);

    expect(merged.reminders).toHaveLength(2);
  });
});
