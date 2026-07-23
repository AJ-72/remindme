export const ExpoSpeechRecognitionModule = {
  getPermissionsAsync: jest.fn().mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: "granted",
  }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: "granted",
  }),
  getSupportedLocales: jest.fn().mockResolvedValue({
    locales: [],
    installedLocales: [],
  }),
  androidTriggerOfflineModelDownload: jest.fn().mockResolvedValue({
    status: "download_success",
    message: "ok",
  }),
  start: jest.fn(),
  stop: jest.fn(),
  addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
};
