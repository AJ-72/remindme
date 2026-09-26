import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Linking } from "react-native";

import NameSheet from "@/components/NameSheet";
import { useReminders } from "@/contexts/RemindersContext";
import { getDriveBackup } from "@/services/DriveBackupService";
import {
  getRegisteredPhone,
  hasSeenNamePrompt,
  loadReminders,
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
  /**
   * Fires once this component has decided the name prompt is done with -
   * either it was shown and closed (answered or skipped), or it decided not
   * to show at all because it was already seen. Deliberately NOT fired on a
   * bind-invite launch, which skips the name prompt for its own reason (see
   * below) but should not have the feature tour barge in on it either. The
   * feature tour hooks into this so it never stacks a second first-launch
   * sheet on top of this one.
   */
  onSettled?: () => void;
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
export default function NameOnboarding({ enabled, onSettled }: Props) {
  const { setUserName } = useReminders();
  const [visible, setVisible] = useState(false);
  const [offerRestore, setOfferRestore] = useState(false);

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
      if (cancelled) return;
      if (seen) {
        onSettled?.();
        return;
      }
      // B3: an EMPTY install may be someone coming back (new phone, iOS, a
      // fresh setup that skipped Android's own restore). An install Android
      // Auto Backup restored is not empty, and already has everything back,
      // so it is never offered a second restore.
      const [reminders, phone] = await Promise.all([loadReminders(), getRegisteredPhone()]);
      if (cancelled) return;
      setOfferRestore(getDriveBackup().isConfigured() && reminders.length === 0 && !phone);
      setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const close = async () => {
    setVisible(false);
    await markNamePromptSeen();
    onSettled?.();
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
      secondaryAction={
        offerRestore
          ? {
              label: "I've used Reminders before — restore",
              testID: "name-sheet-restore",
              // Not onSettled: the feature tour must not start over the
              // welcome-back screen. It starts on the next launch instead.
              onPress: async () => {
                setVisible(false);
                await markNamePromptSeen();
                router.push("/welcome-back");
              },
            }
          : undefined
      }
    />
  );
}
