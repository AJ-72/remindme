import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  HANDLED_RESPONSES_KEY,
  HANDLED_RESPONSES_LIMIT,
  hasHandledResponse,
  markResponseHandled,
} from "@/services/handledResponses";

beforeEach(async () => {
  await (AsyncStorage as any).clear();
  jest.restoreAllMocks();
});

describe("handledResponses", () => {
  it("reports an unseen identifier as unhandled", async () => {
    expect(await hasHandledResponse("notif-1")).toBe(false);
  });

  it("remembers an identifier across calls", async () => {
    await markResponseHandled("notif-1");
    expect(await hasHandledResponse("notif-1")).toBe(true);
    expect(await hasHandledResponse("notif-2")).toBe(false);
  });

  it("survives a fresh read of storage, which is the whole point", async () => {
    await markResponseHandled("notif-1");
    const raw = (await AsyncStorage.getItem(HANDLED_RESPONSES_KEY)) as string;
    expect(JSON.parse(raw)).toContain("notif-1");
  });

  it("caps the ring and evicts the oldest entries", async () => {
    for (let i = 0; i < HANDLED_RESPONSES_LIMIT + 5; i++) {
      await markResponseHandled(`notif-${i}`);
    }
    const stored = JSON.parse(
      (await AsyncStorage.getItem(HANDLED_RESPONSES_KEY)) as string
    ) as string[];
    expect(stored).toHaveLength(HANDLED_RESPONSES_LIMIT);
    expect(stored[0]).toBe(`notif-${HANDLED_RESPONSES_LIMIT + 4}`);
    expect(stored).not.toContain("notif-0");
  });

  it("does not grow when the same identifier is marked twice", async () => {
    await markResponseHandled("notif-1");
    await markResponseHandled("notif-1");
    const stored = JSON.parse(
      (await AsyncStorage.getItem(HANDLED_RESPONSES_KEY)) as string
    ) as string[];
    expect(stored).toEqual(["notif-1"]);
  });

  it("treats corrupt stored data as empty rather than throwing", async () => {
    await AsyncStorage.setItem(HANDLED_RESPONSES_KEY, "{not json");
    expect(await hasHandledResponse("notif-1")).toBe(false);
    await markResponseHandled("notif-1");
    expect(await hasHandledResponse("notif-1")).toBe(true);
  });

  it("reports unhandled when storage itself fails, so an action is never lost", async () => {
    jest
      .spyOn(AsyncStorage, "getItem")
      .mockRejectedValue(new Error("storage down"));
    expect(await hasHandledResponse("notif-1")).toBe(false);
  });
});
