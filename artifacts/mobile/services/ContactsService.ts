import * as Contacts from "expo-contacts";

/** One pickable row: a contact flattened to a single phone number. */
export interface PickableContact {
  contactId?: string;
  name: string;
  /** Raw, exactly as the OS gave it - normalization happens at send time. */
  phone: string;
}

export type ContactsPermission = "granted" | "denied" | "error";

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
 * Never throws: a denied permission or a native failure returns an empty list
 * with a permission marker, so the picker can render an explanatory state
 * rather than crashing the screen that hosts it.
 */
export async function loadPickableContacts(): Promise<LoadContactsResult> {
  try {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== Contacts.PermissionStatus.GRANTED) {
      return { permission: "denied", contacts: [] };
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
