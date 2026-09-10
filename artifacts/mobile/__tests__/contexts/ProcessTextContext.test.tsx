import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { SharedTextProvider, useSharedText } from "@/contexts/SharedTextContext";
import { RemindersProvider } from "@/contexts/RemindersContext";
import {
  addProcessTextListener,
  getInitialProcessText,
  isProcessTextSupported,
} from "@/modules/process-text";

jest.mock("@/modules/process-text", () => ({
  isProcessTextSupported: jest.fn(() => true),
  getInitialProcessText: jest.fn(() => null),
  addProcessTextListener: jest.fn(() => ({ remove: jest.fn() })),
}));

const mockIsSupported = isProcessTextSupported as jest.Mock;
const mockGetInitial = getInitialProcessText as jest.Mock;
const mockAddListener = addProcessTextListener as jest.Mock;

function Consumer() {
  const { sharedText } = useSharedText();
  return <Text testID="shared-text">{sharedText}</Text>;
}

function renderConsumer() {
  // RemindersProvider must wrap SharedTextProvider — SharedTextContext reads
  // settings through useReminders().
  return render(
    <RemindersProvider>
      <SharedTextProvider>
        <Consumer />
      </SharedTextProvider>
    </RemindersProvider>
  );
}

describe("PROCESS_TEXT capture", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSupported.mockReturnValue(true);
    mockGetInitial.mockReturnValue(null);
    mockAddListener.mockReturnValue({ remove: jest.fn() });
  });

  it("publishes text from the launch intent as sharedText", async () => {
    mockGetInitial.mockReturnValue("call the dentist tomorrow at 5");
    const { getByTestId } = renderConsumer();
    await waitFor(() => {
      expect(getByTestId("shared-text").props.children).toBe(
        "call the dentist tomorrow at 5"
      );
    });
  });

  it("publishes text that arrives while the app already runs", async () => {
    const { getByTestId } = renderConsumer();
    await waitFor(() => expect(mockAddListener).toHaveBeenCalled());
    const listener = mockAddListener.mock.calls[0][0] as (t: string) => void;
    act(() => listener("buy milk"));
    await waitFor(() => {
      expect(getByTestId("shared-text").props.children).toBe("buy milk");
    });
  });

  it("stays empty when no selection arrives", async () => {
    const { getByTestId } = renderConsumer();
    await waitFor(() => expect(mockAddListener).toHaveBeenCalled());
    expect(getByTestId("shared-text").props.children).toBe("");
  });

  it("does not mount the capture when the native module is absent", async () => {
    mockIsSupported.mockReturnValue(false);
    renderConsumer();
    await waitFor(() => expect(mockIsSupported).toHaveBeenCalled());
    expect(mockAddListener).not.toHaveBeenCalled();
    expect(mockGetInitial).not.toHaveBeenCalled();
  });

  it("removes the listener on unmount", async () => {
    const remove = jest.fn();
    mockAddListener.mockReturnValue({ remove });
    const { unmount } = renderConsumer();
    await waitFor(() => expect(mockAddListener).toHaveBeenCalled());
    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
