import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import * as Contacts from "expo-contacts";
import ContactPickerModal from "@/components/ContactPickerModal";
import { ThemeProvider } from "@/contexts/ThemeContext";

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
    (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: Contacts.PermissionStatus.DENIED,
    });
    const { findByTestId } = renderPicker();
    expect(await findByTestId("contacts-denied")).toBeTruthy();
  });

  it("says contacts stay on the device, since that is the permission rationale", async () => {
    (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: Contacts.PermissionStatus.DENIED,
    });
    const { findByText } = renderPicker();
    expect(await findByText(/never leave your phone/i)).toBeTruthy();
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
