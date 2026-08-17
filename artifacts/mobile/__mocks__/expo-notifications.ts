export const scheduleNotificationAsync = jest
  .fn()
  .mockResolvedValue("mock-notif-id");
export const cancelScheduledNotificationAsync = jest
  .fn()
  .mockResolvedValue(undefined);
// Defaults to empty; a test that needs to exercise the orphan sweep in
// cancelScheduledForReminder mocks a resolved value with real request shapes.
export const getAllScheduledNotificationsAsync = jest
  .fn()
  .mockResolvedValue([] as unknown[]);

export const dismissNotificationAsync = jest
  .fn()
  .mockResolvedValue(undefined);
// Defaults to empty, like getAllScheduledNotificationsAsync above; a test that
// needs the delivered-copy sweep in dismissDeliveredForReminder mocks a
// resolved value with real notification shapes.
export const getPresentedNotificationsAsync = jest
  .fn()
  .mockResolvedValue([] as unknown[]);
export const requestPermissionsAsync = jest
  .fn()
  .mockResolvedValue({ status: "granted" });
export const getPermissionsAsync = jest.fn().mockResolvedValue({
  status: "granted",
  android: { alarm: true },
});
export const setNotificationChannelAsync = jest
  .fn()
  .mockResolvedValue(undefined);
export const deleteNotificationChannelAsync = jest
  .fn()
  .mockResolvedValue(undefined);
export const setNotificationCategoryAsync = jest
  .fn()
  .mockResolvedValue(undefined);
export const setNotificationHandler = jest.fn();
export const getLastNotificationResponseAsync = jest
  .fn()
  .mockResolvedValue(null);
export const clearLastNotificationResponse = jest.fn();
// Deprecated spelling, kept because the component falls back to it on SDKs
// that predate the rename.
export const clearLastNotificationResponseAsync = jest
  .fn()
  .mockResolvedValue(undefined);
export const addNotificationResponseReceivedListener = jest
  .fn()
  .mockReturnValue({ remove: jest.fn() });

export const DEFAULT_ACTION_IDENTIFIER =
  "expo.modules.notifications.actions.DEFAULT";
export const AndroidImportance = { MAX: 5, HIGH: 4 };
export const AndroidNotificationVisibility = { PUBLIC: 1 };
export const SchedulableTriggerInputTypes = { DATE: "date" };
