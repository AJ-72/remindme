import React, { useEffect, useState } from "react";

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
 */
export default function NameOnboarding({ enabled }: Props) {
  const { setUserName } = useReminders();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    hasSeenNamePrompt().then((seen) => {
      if (!cancelled && !seen) setVisible(true);
    });
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
