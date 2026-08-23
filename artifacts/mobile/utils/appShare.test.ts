import {
  APP_SHARE_BLURB,
  buildAppShareMessage,
} from "./appShare";

describe("buildAppShareMessage", () => {
  it("appends the store link when one is configured", () => {
    expect(buildAppShareMessage("https://play.google.com/store/apps/details?id=x")).toBe(
      `${APP_SHARE_BLURB}\n\nhttps://play.google.com/store/apps/details?id=x`
    );
  });

  // The link is a placeholder until first publish. Emitting an empty line or a
  // dead URL would ship a broken-looking message to a real recipient.
  it("omits the link line entirely while the store URL is unset", () => {
    expect(buildAppShareMessage("")).toBe(APP_SHARE_BLURB);
    expect(buildAppShareMessage("   ")).toBe(APP_SHARE_BLURB);
  });
});
