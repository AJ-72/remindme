import React, { useCallback, useRef, useState } from "react";

import AppDialog, { type DialogOptions, type DialogTone } from "@/components/AppDialog";

/**
 * Promise-based `AppDialog`: `await show({...})` resolves to the pressed
 * button's `value`, or `"cancel"` when the sheet is dismissed (back button,
 * tap outside). Render the returned `dialog` element once in the screen.
 * Local to each screen rather than a provider, so a screen under test needs
 * no extra wrapper.
 */
export function useAppDialog() {
  const [visible, setVisible] = useState(false);
  // Options outlive `visible` so the sheet keeps its content while sliding out.
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const resolver = useRef<((value: string) => void) | null>(null);

  const close = useCallback((value: string) => {
    const resolve = resolver.current;
    resolver.current = null;
    setVisible(false);
    resolve?.(value);
  }, []);

  const show = useCallback((opts: DialogOptions) => {
    // A dialog opened over an unanswered one answers the old one "cancel".
    resolver.current?.("cancel");
    return new Promise<string>((resolve) => {
      resolver.current = resolve;
      setOptions(opts);
      setVisible(true);
    });
  }, []);

  const notify = useCallback(
    (title: string, message?: string, tone: DialogTone = "info") =>
      show({ title, message, tone }).then(() => undefined),
    [show]
  );

  const dialog = (
    <AppDialog
      visible={visible}
      options={options}
      onSelect={close}
      onDismiss={() => close("cancel")}
    />
  );

  return { show, notify, dialog };
}
