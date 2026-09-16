import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import * as Contacts from "expo-contacts";
import ContactPickerModal from "@/components/ContactPickerModal";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Linking } from "react-native";

/** Nothing granted yet, and the OS is still willing to show its dialog. */
function notYetAsked() {
  (Contacts.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: Contacts.PermissionStatus.DENIED,
    canAskAgain: true,
  });
}

function renderPicker(props: Partial<React.ComponentProps<typeof ContactPickerModal>> = {}) {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <ThemeProvider>
      <ContactPickerModal
        visible
        onSelect={onSelect}
        onClose={onClose}
        {...props}
      />
    </ThemeProvider>
  );
  return { ...utils, onSelect, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValue({
    status: Contacts.PermissionStatus.GRANTED,
    canAskAgain: true,
  });
  (Contacts.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: Contacts.PermissionStatus.GRANTED,
    canAskAgain: true,
  });
  (Contacts.getContactsAsync as jest.Mock).mockResolvedValue({
    data: [
      { id: "c1", name: "Priya Menon", phoneNumbers: [{ number: "+91 98765 43210" }] },
      { id: "c2", name: "Anand", phoneNumbers: [{ number: "9123456789" }] },
    ],
  });
});

describe("ContactPickerModal", () => {
  it("lists contacts once permission is granted", async () => {
    const { findByText } = renderPicker();
    expect(await findByText("Priya Menon")).toBeTruthy();
    expect(await findByText("Anand")).toBeTruthy();
  });

  it("shows each contact's number alongside the name", async () => {
    const { findByText } = renderPicker();
    expect(await findByText("+91 98765 43210")).toBeTruthy();
  });

  it("filters by name as the user types", async () => {
    const { findByTestId, findByText, queryByText } = renderPicker();
    await findByText("Priya Menon");
    fireEvent.changeText(await findByTestId("contact-search"), "anand");
    await waitFor(() => expect(queryByText("Priya Menon")).toBeNull());
    expect(await findByText("Anand")).toBeTruthy();
  });

  it("filters by number typed without formatting", async () => {
    const { findByTestId, findByText, queryByText } = renderPicker();
    await findByText("Priya Menon");
    fireEvent.changeText(await findByTestId("contact-search"), "9876543210");
    await waitFor(() => expect(queryByText("Anand")).toBeNull());
  });

  it("returns the picked contact as name and raw phone", async () => {
    const { findByText, onSelect } = renderPicker();
    fireEvent.press(await findByText("Priya Menon"));
    expect(onSelect).toHaveBeenCalledWith({
      contactId: "c1",
      name: "Priya Menon",
      phone: "+91 98765 43210",
    });
  });

  it("explains the denied state instead of rendering an empty list", async () => {
    notYetAsked();
    (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: Contacts.PermissionStatus.DENIED,
      canAskAgain: true,
    });
    const { findByTestId } = renderPicker();
    fireEvent.press(await findByTestId("contacts-pre-prompt-continue"));
    expect(await findByTestId("contacts-denied")).toBeTruthy();
  });

  it("says contacts stay on the device, since that is the permission rationale", async () => {
    notYetAsked();
    const { findByText } = renderPicker();
    expect(await findByText(/stay on your phone/i)).toBeTruthy();
  });

  it("shows an empty state when the address book has no usable numbers", async () => {
    (Contacts.getContactsAsync as jest.Mock).mockResolvedValue({ data: [] });
    const { findByTestId } = renderPicker();
    expect(await findByTestId("contacts-empty")).toBeTruthy();
  });

  it("shows a no-results state when the search matches nothing", async () => {
    const { findByTestId, findByText } = renderPicker();
    await findByText("Priya Menon");
    fireEvent.changeText(await findByTestId("contact-search"), "zzzzz");
    expect(await findByTestId("contacts-no-results")).toBeTruthy();
  });

  it("closes without selecting when cancel is pressed", async () => {
    const { findByTestId, onClose, onSelect } = renderPicker();
    fireEvent.press(await findByTestId("contact-picker-cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not request contacts while hidden", () => {
    renderPicker({ visible: false });
    expect(Contacts.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});


// On a device the sheet is anchored to the bottom of the screen - exactly
// where the keyboard opens - so the search field's own keyboard covered the
// results. With only a couple of matches the sheet was hidden entirely.
describe("ContactPickerModal — keyboard", () => {
  it("wraps the sheet in a keyboard-avoiding view", () => {
    const { UNSAFE_root } = renderPicker();
    const { KeyboardAvoidingView } = require("react-native-keyboard-controller");
    expect(UNSAFE_root.findAllByType(KeyboardAvoidingView).length).toBeGreaterThan(0);
  });
});

describe("ContactPickerModal — asking for the address book", () => {
  it("asks in its own words before it lets the OS ask", async () => {
    notYetAsked();
    const { findByTestId } = renderPicker();

    expect(await findByTestId("contacts-pre-prompt")).toBeTruthy();
    // The point of the pre-prompt: the system dialog has not been spent.
    expect(Contacts.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("shows the system dialog only once the user agrees to be asked", async () => {
    notYetAsked();
    const { findByTestId, findByText } = renderPicker();
    fireEvent.press(await findByTestId("contacts-pre-prompt-continue"));

    await waitFor(() => expect(Contacts.requestPermissionsAsync).toHaveBeenCalled());
    expect(await findByText("Priya Menon")).toBeTruthy();
  });

  it("never pre-prompts when permission is already granted", async () => {
    const { queryByTestId, findByText } = renderPicker();
    await findByText("Priya Menon");
    expect(queryByTestId("contacts-pre-prompt")).toBeNull();
  });

  it("skips the pre-prompt and offers settings once the OS has stopped asking", async () => {
    (Contacts.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: Contacts.PermissionStatus.DENIED,
      canAskAgain: false,
    });
    const { findByTestId, queryByTestId } = renderPicker();

    expect(await findByTestId("contacts-blocked")).toBeTruthy();
    expect(queryByTestId("contacts-pre-prompt")).toBeNull();

    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    fireEvent.press(await findByTestId("contacts-open-settings"));
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockRestore();
  });

  it("offers a retry, not settings, while the OS will still ask", async () => {
    notYetAsked();
    (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: Contacts.PermissionStatus.DENIED,
      canAskAgain: true,
    });
    const { findByTestId, queryByTestId } = renderPicker();
    fireEvent.press(await findByTestId("contacts-pre-prompt-continue"));

    expect(await findByTestId("contacts-denied-retry")).toBeTruthy();
    expect(queryByTestId("contacts-open-settings")).toBeNull();
  });

  it("names a failure a failure, not a refusal", async () => {
    (Contacts.getContactsAsync as jest.Mock).mockRejectedValue(new Error("boom"));
    const { findByTestId, queryByTestId } = renderPicker();

    expect(await findByTestId("contacts-error")).toBeTruthy();
    expect(queryByTestId("contacts-denied")).toBeNull();
  });
});

describe("ContactPickerModal — typing a number instead", () => {
  it("offers the manual route from every state that has no list", async () => {
    notYetAsked();
    const { findByTestId } = renderPicker();
    expect(await findByTestId("contacts-use-manual")).toBeTruthy();
  });

  it("returns the typed name and number", async () => {
    notYetAsked();
    const { findByTestId, onSelect } = renderPicker();
    fireEvent.press(await findByTestId("contacts-use-manual"));

    fireEvent.changeText(await findByTestId("contacts-manual-name"), "Ammu");
    fireEvent.changeText(await findByTestId("contacts-manual-phone"), "+91 98765 43210");
    fireEvent.press(await findByTestId("contacts-manual-submit"));

    expect(onSelect).toHaveBeenCalledWith({ name: "Ammu", phone: "+91 98765 43210" });
  });

  it("uses the number as the label when no name is typed", async () => {
    notYetAsked();
    const { findByTestId, onSelect } = renderPicker();
    fireEvent.press(await findByTestId("contacts-use-manual"));
    fireEvent.changeText(await findByTestId("contacts-manual-phone"), "9123456789");
    fireEvent.press(await findByTestId("contacts-manual-submit"));

    expect(onSelect).toHaveBeenCalledWith({ name: "9123456789", phone: "9123456789" });
  });

  it("refuses a number too short to be one", async () => {
    notYetAsked();
    const { findByTestId, onSelect } = renderPicker();
    fireEvent.press(await findByTestId("contacts-use-manual"));
    fireEvent.changeText(await findByTestId("contacts-manual-phone"), "123");

    // Disabled, so a press never reaches the handler at all - asserting on
    // the prop rather than on a press, which testing-library forwards to the
    // nearest enabled ancestor.
    expect((await findByTestId("contacts-manual-submit")).props.accessibilityState?.disabled)
      .toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("never reads the address book on the manual route", async () => {
    notYetAsked();
    const { findByTestId } = renderPicker();
    fireEvent.press(await findByTestId("contacts-use-manual"));
    await findByTestId("contacts-manual-phone");

    expect(Contacts.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Contacts.getContactsAsync).not.toHaveBeenCalled();
  });
});
