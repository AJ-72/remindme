export const PermissionStatus = {
  GRANTED: "granted",
  DENIED: "denied",
  UNDETERMINED: "undetermined",
} as const;

export const Fields = {
  ID: "id",
  Name: "name",
  PhoneNumbers: "phoneNumbers",
} as const;

export const requestPermissionsAsync = jest
  .fn()
  .mockResolvedValue({ status: PermissionStatus.GRANTED });

export const getPermissionsAsync = jest
  .fn()
  .mockResolvedValue({ status: PermissionStatus.GRANTED });

export const getContactsAsync = jest
  .fn()
  .mockResolvedValue({ data: [], hasNextPage: false, hasPreviousPage: false });
