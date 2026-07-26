export const useShareIntent = jest.fn().mockReturnValue({
  isReady: true,
  hasShareIntent: false,
  shareIntent: null,
  resetShareIntent: jest.fn(),
  error: null,
});
