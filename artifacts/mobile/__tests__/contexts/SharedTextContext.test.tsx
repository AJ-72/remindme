import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { SharedTextProvider, useSharedText } from "@/contexts/SharedTextContext";
import { useShareIntent } from "expo-share-intent";
import * as SpeechService from "@/services/SpeechService";

function Consumer() {
  const { sharedText, sharedAudioTranscribing, sharedAudioNotice, sharedAudioDebugInfo } =
    useSharedText();
  return (
    <>
      <Text testID="shared-text">{sharedText}</Text>
      <Text testID="transcribing">{String(sharedAudioTranscribing)}</Text>
      <Text testID="notice">{sharedAudioNotice ?? ""}</Text>
      <Text testID="debug-info">{sharedAudioDebugInfo ?? ""}</Text>
    </>
  );
}

function renderConsumer() {
  return render(
    <SharedTextProvider>
      <Consumer />
    </SharedTextProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useShareIntent as jest.Mock).mockReturnValue({
    isReady: true,
    hasShareIntent: false,
    shareIntent: null,
    resetShareIntent: jest.fn(),
    error: null,
  });
});

describe("SharedTextContext — native share-intent errors", () => {
  it("surfaces the native module's error state as a visible notice with debug info, instead of staying silent", async () => {
    const resetShareIntent = jest.fn();
    (useShareIntent as jest.Mock).mockReturnValue({
      isReady: true,
      hasShareIntent: false,
      shareIntent: null,
      resetShareIntent,
      error: "package_not_found",
    });

    const { findByTestId } = renderConsumer();

    await waitFor(async () => {
      expect((await findByTestId("notice")).props.children).toMatch(/Couldn't read the shared audio/i);
    });
    const debugInfo = await findByTestId("debug-info");
    expect(debugInfo.props.children).toMatch(/package_not_found/);
    expect(resetShareIntent).toHaveBeenCalled();
  });

  it("surfaces a notice when shared files exist but none match an audio mimeType", async () => {
    const resetShareIntent = jest.fn();
    (useShareIntent as jest.Mock).mockReturnValue({
      isReady: true,
      hasShareIntent: true,
      shareIntent: {
        files: [{ fileName: "note.pdf", mimeType: "application/pdf", path: "file:///note.pdf" }],
      },
      resetShareIntent,
      error: null,
    });

    const { findByTestId } = renderConsumer();

    await waitFor(async () => {
      expect((await findByTestId("notice")).props.children).toMatch(/Couldn't read the shared audio/i);
    });
    expect(resetShareIntent).toHaveBeenCalled();
  });

  it("surfaces a notice when a shared file has a null mimeType, without throwing", async () => {
    const resetShareIntent = jest.fn();
    (useShareIntent as jest.Mock).mockReturnValue({
      isReady: true,
      hasShareIntent: true,
      shareIntent: {
        files: [{ fileName: "AUD-0001.opus", mimeType: null, path: "content://media/AUD-0001.opus" }],
      },
      resetShareIntent,
      error: null,
    });

    const { findByTestId } = renderConsumer();

    await waitFor(async () => {
      expect((await findByTestId("notice")).props.children).toMatch(/Couldn't read the shared audio/i);
    });
  });

  it("falls back to the filename and shows debug info when transcribeAudioFile resolves failed with a reason (the real-device WhatsApp-audio case)", async () => {
    jest.spyOn(SpeechService, "isFileTranscriptionSupported").mockReturnValue(true);
    jest
      .spyOn(SpeechService, "transcribeAudioFile")
      .mockResolvedValue({ failed: true, reason: "error event: client — no speech input" });
    const resetShareIntent = jest.fn();
    (useShareIntent as jest.Mock).mockReturnValue({
      isReady: true,
      hasShareIntent: true,
      shareIntent: {
        files: [{ fileName: "AUD-0001.opus", mimeType: "audio/ogg", path: "content://media/AUD-0001.opus" }],
      },
      resetShareIntent,
      error: null,
    });

    const { findByTestId } = renderConsumer();

    await waitFor(async () => {
      expect((await findByTestId("shared-text")).props.children).toBe("AUD-0001.opus");
    });
    expect((await findByTestId("notice")).props.children).toMatch(/added the file name instead/i);
    expect((await findByTestId("debug-info")).props.children).toMatch(/no speech input/i);
    expect(resetShareIntent).toHaveBeenCalled();
  });

  it("falls back to the filename and shows debug info when transcribeAudioFile throws", async () => {
    jest.spyOn(SpeechService, "isFileTranscriptionSupported").mockReturnValue(true);
    jest.spyOn(SpeechService, "transcribeAudioFile").mockRejectedValue(new Error("boom"));
    const resetShareIntent = jest.fn();
    (useShareIntent as jest.Mock).mockReturnValue({
      isReady: true,
      hasShareIntent: true,
      shareIntent: {
        files: [{ fileName: "AUD-0001.opus", mimeType: "audio/ogg", path: "content://media/AUD-0001.opus" }],
      },
      resetShareIntent,
      error: null,
    });

    const { findByTestId } = renderConsumer();

    await waitFor(async () => {
      expect((await findByTestId("shared-text")).props.children).toBe("AUD-0001.opus");
    });
    expect((await findByTestId("notice")).props.children).toMatch(/added the file name instead/i);
    expect((await findByTestId("debug-info")).props.children).toMatch(/boom/);
    expect(resetShareIntent).toHaveBeenCalled();
  });

  it("populates sharedText with the transcript on a successful audio share", async () => {
    jest.spyOn(SpeechService, "isFileTranscriptionSupported").mockReturnValue(true);
    jest.spyOn(SpeechService, "transcribeAudioFile").mockResolvedValue({ text: "call mom tomorrow" });
    (useShareIntent as jest.Mock).mockReturnValue({
      isReady: true,
      hasShareIntent: true,
      shareIntent: {
        files: [{ fileName: "AUD-0001.opus", mimeType: "audio/ogg", path: "content://media/AUD-0001.opus" }],
      },
      resetShareIntent: jest.fn(),
      error: null,
    });

    const { findByTestId } = renderConsumer();

    await waitFor(async () => {
      expect((await findByTestId("shared-text")).props.children).toBe("call mom tomorrow");
    });
  });
});
