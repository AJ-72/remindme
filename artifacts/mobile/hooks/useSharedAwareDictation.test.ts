import { act, renderHook } from "@testing-library/react-native";

import { useSharedAwareDictation } from "@/hooks/useSharedAwareDictation";
import * as SpeechService from "@/services/SpeechService";

describe("useSharedAwareDictation", () => {
  const noSharedAudio = {
    sharedAudioTranscribing: false,
    sharedAudioNotice: null,
    sharedAudioDebugInfo: null,
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(SpeechService, "getMicPermissionStatus").mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });
    jest
      .spyOn(SpeechService, "resolveDictationReadiness")
      .mockResolvedValue({ status: "ready", onDevice: true, shouldBail: false });
    jest.spyOn(SpeechService, "startListening").mockReturnValue({ busy: false });
    jest.spyOn(SpeechService, "stopListening").mockImplementation(() => {});
  });

  it("starts listening on mic press when permission and model are ready", async () => {
    const onText = jest.fn();
    const { result } = renderHook(() =>
      useSharedAwareDictation("", onText, "en-US", noSharedAudio)
    );

    await act(async () => {
      result.current.handleMicPress();
    });

    expect(result.current.listening).toBe(true);
    expect(SpeechService.startListening).toHaveBeenCalledWith(
      "",
      "en-US",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      true
    );

    // Stop the mic-pulse loop this press started. startMicPulse/stopMicPulse
    // are plain functions, not tied to a useEffect — unmounting the hook does
    // NOT stop an Animated.loop already running, it only tears down React's
    // side; the loop itself keeps scheduling native-driver frames forever,
    // which is what was leaking a handle across the suite. A second press is
    // the hook's only exposed way to stop it, same as a real mic-off tap.
    act(() => {
      result.current.handleMicPress();
    });
  });

  it("shows a preparing notice and does not call startListening while the offline model is still downloading", async () => {
    (SpeechService.resolveDictationReadiness as jest.Mock).mockResolvedValueOnce({
      status: "preparing",
      onDevice: false,
      shouldBail: true,
    });
    const { result } = renderHook(() =>
      useSharedAwareDictation("", jest.fn(), "ml-IN", noSharedAudio)
    );

    await act(async () => {
      result.current.handleMicPress();
    });

    expect(result.current.listening).toBe(false);
    expect(result.current.micNotice).toMatch(/preparing/i);
    expect(SpeechService.startListening).not.toHaveBeenCalled();
  });

  it("stops listening on a second mic press", async () => {
    const { result } = renderHook(() =>
      useSharedAwareDictation("", jest.fn(), "en-US", noSharedAudio)
    );

    await act(async () => {
      result.current.handleMicPress();
    });
    act(() => {
      result.current.handleMicPress();
    });

    expect(SpeechService.stopListening).toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  });

  it("does not stop a shared-audio transcription in flight, and surfaces a busy notice instead", async () => {
    const { result, rerender } = renderHook(
      (props: { sharedAudioTranscribing: boolean }) =>
        useSharedAwareDictation("", jest.fn(), "en-US", {
          ...noSharedAudio,
          sharedAudioTranscribing: props.sharedAudioTranscribing,
        }),
      { initialProps: { sharedAudioTranscribing: false } }
    );

    rerender({ sharedAudioTranscribing: true });
    expect(result.current.listening).toBe(true);

    act(() => {
      result.current.handleMicPress();
    });

    expect(SpeechService.stopListening).not.toHaveBeenCalled();
    expect(result.current.micNotice).toMatch(/still transcribing/i);

    // Stop the mic-pulse loop the shared-audio transition started, for the
    // same reason as the first test above.
    act(() => {
      rerender({ sharedAudioTranscribing: false });
    });
  });
});
