import React, { useEffect, useState } from "react";
import { Linking } from "react-native";

import NameSheet from "@/components/NameSheet";
import { useReminders } from "@/contexts/RemindersContext";
import {
  hasSeenNamePrompt,
  markNamePromptSeen,
} from "@/services/ReminderService";

interface Props {
  /**
   * Gate from the root layout, true once permission onboarding has settled.
   * Two sheets stacking on a first launch is the failure this prevents - the
   * name ask would render behind the system permission dialog and be skipped
   * by the tap that dismisses it.
   */
  enabled: boolean;
}

/**
 * First-launch name prompt. Lives inside RemindersProvider because it writes
 * through the context, so the header greeting updates without a reload.
 *
 * Skipping is recorded the same as answering: the prompt is a one-time ask,
 * and someone who declined it should not be asked again on every cold start.
 * The home header keeps a permanent tap-to-add affordance for them instead.
 *
 * An install opened by an invite link is the one case that skips it. That
 * user came for somebody else's reminder, and the sheet would render over
 * the bind screen - the invitation is what they opened the app to see. Their
 * name ask waits on the home screen behind Accept, where it can name the
 * person who will read the answer. The launch URL is read rather than a flag
 * set by the bind screen, because that screen mounts alongside this one and
 * a flag would be a race this sheet loses silently.
 */
export default function NameOnboarding({ enabled }: Props) {
  const { setUserName } = useReminders();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      let launchUrl: string | null = null;
      try {
        launchUrl = await Linking.getInitialURL();
      } catch {
        // No launch URL readable: treat it as an ordinary launch.
      }
      if (cancelled) return;
      if (launchUrl?.includes("bind-invite")) return;
      const seen = await hasSeenNamePrompt();
      if (!cancelled && !seen) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const close = async () => {
    setVisible(false);
    await markNamePromptSeen();
  };

  return (
    <NameSheet
      visible={visible}
      skippable
      onSave={async (name) => {
        await setUserName(name);
        await close();
      }}
      onDismiss={close}
    />
  );
}
