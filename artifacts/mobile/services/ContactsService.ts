import * as Contacts from "expo-contacts";

/** One pickable row: a contact flattened to a single phone number. */
export interface PickableContact {
  contactId?: string;
  name: string;
  /** Raw, exactly as the OS gave it - normalization happens at send time. */
  phone: string;
}

/**
 * `denied` and `blocked` used to be the same value, which is what made the
 * picker's dead end a dead end: a user who refused once can be asked again,
 * a user who refused permanently cannot, and only the second one needs to be
 * sent to system settings. `error` is a third thing again - the address book
 * failed, nobody refused anything - and it earns different words.
 */
export type ContactsPermission = "granted" | "denied" | "blocked" | "error";

export interface ContactsPermissionState {
  granted: boolean;
  /** False once the OS will no longer show its dialog for this app. */
  canAskAgain: boolean;
}

/** What the OS thinks right now, with no dialog shown. */
export async function getContactsPermissionState(): Promise<ContactsPermissionState> {
  try {
    const res = await Contacts.getPermissionsAsync();
    return {
      granted: res?.status === Contacts.PermissionStatus.GRANTED,
      // A missing field means an older expo-contacts. Treat it as askable:
      // a wrongly suppressed dialog is worse than one the OS quietly drops.
      canAskAgain: (res as { canAskAgain?: boolean })?.canAskAgain !== false,
    };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

export interface LoadContactsResult {
  permission: ContactsPermission;
  contacts: PickableContact[];
}

/** Digits only, for dedupe and search comparisons. */
function digitsOf(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Load contacts as a flat, pickable list.
 *
 * Never throws: a refused permission or a native failure returns an empty list
 * with a permission marker, so the picker can render an explanatory state
 * rather than crashing the screen that hosts it.
 *
 * `request` decides whether the OS dialog may appear. The picker passes false
 * on open - the system dialog is the second step, after the app has said what
 * it wants the contacts for - and true once the user agrees to be asked.
 */
export async function loadPickableContacts(
  options: { request?: boolean } = {}
): Promise<LoadContactsResult> {
  const request = options.request ?? true;
  try {
    const before = await getContactsPermissionState();
    if (!before.granted) {
      if (!request || !before.canAskAgain) {
        return {
          permission: before.canAskAgain ? "denied" : "blocked",
          contacts: [],
        };
      }
      const res = await Contacts.requestPermissionsAsync();
      if (res?.status !== Contacts.PermissionStatus.GRANTED) {
        return {
          permission:
            (res as { canAskAgain?: boolean })?.canAskAgain === false
              ? "blocked"
              : "denied",
          contacts: [],
        };
      }
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.ID, Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    });

    const out: PickableContact[] = [];
    for (const c of data ?? []) {
      const numbers = (c as any).phoneNumbers ?? [];
      // Android frequently reports one number twice under different labels.
      const seen = new Set<string>();
      for (const entry of numbers) {
        const phone: string = (entry?.number ?? "").trim();
        if (!phone) continue;
        const key = digitsOf(phone);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({
          contactId: (c as any).id,
          name: ((c as any).name ?? "").trim() || phone,
          phone,
        });
      }
    }

    out.sort((a, b) => a.name.localeCompare(b.name));
    return { permission: "granted", contacts: out };
  } catch {
    return { permission: "error", contacts: [] };
  }
}

/** Filter by name or number. Pure, so the picker's search stays testable. */
export function searchContacts(
  contacts: PickableContact[],
  query: string
): PickableContact[] {
  const q = query.trim().toLowerCase();
  if (!q) return contacts;
  const qDigits = digitsOf(q);
  return contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (!!qDigits && digitsOf(c.phone).includes(qDigits))
  );
}
