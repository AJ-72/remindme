import * as Contacts from "expo-contacts";
import { loadPickableContacts, searchContacts } from "@/services/ContactsService";

beforeEach(() => {
  jest.clearAllMocks();
  (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValue({
    status: Contacts.PermissionStatus.GRANTED,
  });
});

function mockContacts(data: unknown[]) {
  (Contacts.getContactsAsync as jest.Mock).mockResolvedValue({ data });
}

describe("loadPickableContacts", () => {
  it("returns a denied result without throwing when permission is refused", async () => {
    (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: Contacts.PermissionStatus.DENIED,
    });
    const result = await loadPickableContacts();
    expect(result.permission).toBe("denied");
    expect(result.contacts).toEqual([]);
    expect(Contacts.getContactsAsync).not.toHaveBeenCalled();
  });

  it("flattens one entry per phone number", async () => {
    mockContacts([
      {
        id: "c1",
        name: "Priya",
        phoneNumbers: [
          { number: "+91 98765 43210", label: "mobile" },
          { number: "080 1234 5678", label: "home" },
        ],
      },
    ]);
    const { contacts } = await loadPickableContacts();
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toMatchObject({
      contactId: "c1",
      name: "Priya",
      phone: "+91 98765 43210",
    });
    expect(contacts[1].phone).toBe("080 1234 5678");
  });

  it("drops contacts with no phone numbers at all", async () => {
    mockContacts([
      { id: "c1", name: "No Phone" },
      { id: "c2", name: "Has Phone", phoneNumbers: [{ number: "9876543210" }] },
    ]);
    const { contacts } = await loadPickableContacts();
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe("Has Phone");
  });

  it("dedupes the same normalized number within one contact", async () => {
    // Android often reports the same number twice under different labels.
    mockContacts([
      {
        id: "c1",
        name: "Priya",
        phoneNumbers: [
          { number: "+91 98765 43210" },
          { number: "+919876543210" },
        ],
      },
    ]);
    const { contacts } = await loadPickableContacts();
    expect(contacts).toHaveLength(1);
  });

  it("keeps distinct numbers for the same contact", async () => {
    mockContacts([
      {
        id: "c1",
        name: "Priya",
        phoneNumbers: [{ number: "9876543210" }, { number: "9123456789" }],
      },
    ]);
    const { contacts } = await loadPickableContacts();
    expect(contacts).toHaveLength(2);
  });

  it("skips entries with a blank number", async () => {
    mockContacts([
      { id: "c1", name: "Priya", phoneNumbers: [{ number: "  " }, { number: "9876543210" }] },
    ]);
    const { contacts } = await loadPickableContacts();
    expect(contacts).toHaveLength(1);
  });

  it("falls back to the raw number as the label when a contact has no name", async () => {
    mockContacts([{ id: "c1", phoneNumbers: [{ number: "9876543210" }] }]);
    const { contacts } = await loadPickableContacts();
    expect(contacts[0].name).toBe("9876543210");
  });

  it("returns an error result rather than throwing when the module fails", async () => {
    (Contacts.getContactsAsync as jest.Mock).mockRejectedValue(
      new Error("native blew up")
    );
    const result = await loadPickableContacts();
    expect(result.permission).toBe("error");
    expect(result.contacts).toEqual([]);
  });

  it("sorts by name so the list is stable", async () => {
    mockContacts([
      { id: "c2", name: "Zoya", phoneNumbers: [{ number: "9000000002" }] },
      { id: "c1", name: "Anand", phoneNumbers: [{ number: "9000000001" }] },
    ]);
    const { contacts } = await loadPickableContacts();
    expect(contacts.map((c) => c.name)).toEqual(["Anand", "Zoya"]);
  });
});

describe("searchContacts", () => {
  const list = [
    { contactId: "c1", name: "Priya Menon", phone: "+91 98765 43210" },
    { contactId: "c2", name: "Anand", phone: "9123456789" },
  ];

  it("returns everything for an empty query", () => {
    expect(searchContacts(list, "")).toHaveLength(2);
    expect(searchContacts(list, "   ")).toHaveLength(2);
  });

  it("matches on name, case-insensitively", () => {
    expect(searchContacts(list, "priya")).toHaveLength(1);
    expect(searchContacts(list, "MENON")).toHaveLength(1);
  });

  it("matches on a partial number", () => {
    expect(searchContacts(list, "98765")).toHaveLength(1);
  });

  it("matches a number typed without formatting", () => {
    // The stored string has spaces; the user types digits.
    expect(searchContacts(list, "9876543210")).toHaveLength(1);
  });

  it("returns nothing for a query that matches neither field", () => {
    expect(searchContacts(list, "zzz")).toHaveLength(0);
  });
});
