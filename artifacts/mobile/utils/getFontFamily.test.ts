import { getFontFamily } from "./getFontFamily";

describe("getFontFamily", () => {
  it("returns the Inter family for English text at each weight", () => {
    expect(getFontFamily("Call mom", "400Regular")).toBe("Inter_400Regular");
    expect(getFontFamily("Call mom", "500Medium")).toBe("Inter_500Medium");
    expect(getFontFamily("Call mom", "600SemiBold")).toBe("Inter_600SemiBold");
    expect(getFontFamily("Call mom", "700Bold")).toBe("Inter_700Bold");
  });

  it("returns the Noto Sans Malayalam family for Malayalam text at each weight", () => {
    expect(getFontFamily("നാളെ മീറ്റിംഗ്", "400Regular")).toBe("NotoSansMalayalam_400Regular");
    expect(getFontFamily("നാളെ മീറ്റിംഗ്", "500Medium")).toBe("NotoSansMalayalam_500Medium");
    expect(getFontFamily("നാളെ മീറ്റിംഗ്", "600SemiBold")).toBe("NotoSansMalayalam_600SemiBold");
    expect(getFontFamily("നാളെ മീറ്റിംഗ്", "700Bold")).toBe("NotoSansMalayalam_700Bold");
  });

  it("returns the Malayalam family for mixed Malayalam+Latin text", () => {
    expect(getFontFamily("call John നാളെ", "400Regular")).toBe("NotoSansMalayalam_400Regular");
  });

  it("returns Inter for empty text", () => {
    expect(getFontFamily("", "400Regular")).toBe("Inter_400Regular");
  });
});
