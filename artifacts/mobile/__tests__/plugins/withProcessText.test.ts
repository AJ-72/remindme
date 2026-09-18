import {
  PROCESS_TEXT_LABEL,
  addProcessTextIntentFilter,
} from "@/plugins/withProcessText";

function manifestWithMainActivity() {
  return {
    manifest: {
      application: [
        {
          activity: [
            {
              $: { "android:name": ".MainActivity" },
              "intent-filter": [
                {
                  action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
                },
              ],
            },
          ],
        },
      ],
    },
  } as any;
}

function processTextFilters(manifest: any) {
  const filters =
    manifest.manifest.application[0].activity[0]["intent-filter"] ?? [];
  return filters.filter((f: any) =>
    (f.action ?? []).some(
      (a: any) => a.$["android:name"] === "android.intent.action.PROCESS_TEXT"
    )
  );
}

describe("withProcessText manifest transform", () => {
  it("adds a PROCESS_TEXT filter with label, category and mime type", () => {
    const manifest = manifestWithMainActivity();
    addProcessTextIntentFilter(manifest);

    const filters = processTextFilters(manifest);
    expect(filters).toHaveLength(1);
    expect(filters[0].$["android:label"]).toBe(PROCESS_TEXT_LABEL);
    expect(filters[0].category[0].$["android:name"]).toBe(
      "android.intent.category.DEFAULT"
    );
    expect(filters[0].data[0].$["android:mimeType"]).toBe("text/plain");
  });

  it("keeps the existing MAIN filter", () => {
    const manifest = manifestWithMainActivity();
    addProcessTextIntentFilter(manifest);
    expect(
      manifest.manifest.application[0].activity[0]["intent-filter"]
    ).toHaveLength(2);
  });

  it("is idempotent across repeated prebuilds", () => {
    const manifest = manifestWithMainActivity();
    addProcessTextIntentFilter(manifest);
    addProcessTextIntentFilter(manifest);
    expect(processTextFilters(manifest)).toHaveLength(1);
  });

  it("does nothing when the manifest has no application node", () => {
    const empty = { manifest: {} } as any;
    expect(() => addProcessTextIntentFilter(empty)).not.toThrow();
  });
});
