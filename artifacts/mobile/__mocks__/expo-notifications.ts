export const scheduleNotificationAsync = jest
  .fn()
  .mockResolvedValue("mock-notif-id");
export const cancelScheduledNotificationAsync = jest
  .fn()
  .mockResolvedValue(undefined);
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
export const addNotificationResponseReceivedListener = jest
  .fn()
  .mockReturnValue({ remove: jest.fn() });

export const DEFAULT_ACTION_IDENTIFIER =
  "expo.modules.notifications.actions.DEFAULT";
export const AndroidImportance = { MAX: 5, HIGH: 4 };
export const AndroidNotificationVisibility = { PUBLIC: 1 };
export const SchedulableTriggerInputTypes = { DATE: "date" };
