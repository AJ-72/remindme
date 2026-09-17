// Manual mock for expo-crypto. Only randomUUID is used in this repo so far
// (DeviceIdentityService's local, non-network device key generation).

let counter = 0;

export const randomUUID = jest.fn((): string => {
  counter += 1;
  return `mock-uuid-${counter}-${Math.random().toString(16).slice(2)}`;
});
