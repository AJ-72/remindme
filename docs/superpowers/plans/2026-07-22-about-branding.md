# About Tab & CuriousMind Labs Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third "About" tab that shows CuriousMind Labs company branding (placeholder icon, name, tagline, app version).

**Architecture:** One new screen file (`app/(tabs)/about.tsx`) following the exact structural pattern of the existing `app/(tabs)/settings.tsx` (header + `useColors()`/`useSafeAreaInsets()`), registered as a third tab in both tab-layout paths of `app/(tabs)/_layout.tsx`. The version string is read via a direct `app.json` import (not `expo-constants`, which resolves to `undefined` under Jest with no manifest).

**Tech Stack:** React Native, Expo Router (file-based tabs), `@expo/vector-icons` Feather icons, `expo-symbols` SF Symbols (iOS), Jest + `@testing-library/react-native`.

## Global Constraints

- Company name displayed: **"CuriousMind Labs"** (exact spelling — not "CuriosMind").
- Tagline displayed: **"Be Curious"**.
- The app's own display name stays **"Reminders"** everywhere else — do not touch `app.json`'s `expo.name`, the Android `package` id, or any icon asset.
- Icon on the About screen is a **placeholder** generic icon (Feather `"compass"` in a circular badge) — not the real app icon (`assets/images/icon.png`), since no final company logo exists yet.
- Version string must come from `app.json`'s `expo.version` (currently `"1.0.0"`), not `package.json`'s (`"0.0.0"`).

---

### Task 1: About screen with branding content

**Files:**
- Create: `artifacts/mobile/app/(tabs)/about.tsx`
- Test: `artifacts/mobile/__tests__/screens/about.test.tsx`

**Interfaces:**
- Consumes: `useColors()` from `@/hooks/useColors` (returns `{ background, foreground, mutedForeground, card, border, primary, muted, ... }`, already used identically in `settings.tsx`), `useSafeAreaInsets()` from `react-native-safe-area-context`, `appConfig` default-imported from `@/app.json` (shape: `{ expo: { version: string, ... } }`).
- Produces: default-exported React component `AboutScreen`, referenced by `app/(tabs)/_layout.tsx` in Task 2 as the `about` route (file-based routing — no explicit import needed there, just the route name `"about"` matching this file's name).

- [ ] **Step 1: Write the failing test**

Create `artifacts/mobile/__tests__/screens/about.test.tsx`:

```tsx
import React from "react";
import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AboutScreen from "@/app/(tabs)/about";

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AboutScreen />
    </SafeAreaProvider>
  );
}

describe("AboutScreen", () => {
  it("shows the company name, tagline, and app version", () => {
    const { getByText } = renderScreen();
    expect(getByText("CuriousMind Labs")).toBeTruthy();
    expect(getByText("Be Curious")).toBeTruthy();
    expect(getByText("Version 1.0.0")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `artifacts/mobile/`, with pnpm on PATH):
```bash
export PATH="/private/tmp/pnpm-shim:$PATH"
pnpm test -- about.test
```
Expected: FAIL — `Cannot find module '@/app/(tabs)/about'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `artifacts/mobile/app/(tabs)/about.tsx`:

```tsx
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import appConfig from "@/app.json";

export default function AboutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    content: {
      flex: 1,
      alignItems: "center",
      paddingTop: 60,
      paddingHorizontal: 24,
    },
    icon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    name: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 6,
    },
    tagline: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 24,
    },
    version: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>About</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.icon}>
          <Feather name="compass" size={28} color={colors.primary} />
        </View>
        <Text style={styles.name}>CuriousMind Labs</Text>
        <Text style={styles.tagline}>Be Curious</Text>
        <Text style={styles.version}>Version {appConfig.expo.version}</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
export PATH="/private/tmp/pnpm-shim:$PATH"
pnpm test -- about.test
```
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/app/\(tabs\)/about.tsx artifacts/mobile/__tests__/screens/about.test.tsx
git commit -m "feat(mobile): add About screen with CuriousMind Labs branding"
```

---

### Task 2: Register About as the third tab

**Files:**
- Modify: `artifacts/mobile/app/(tabs)/_layout.tsx:16-29` (NativeTabLayout), `artifacts/mobile/app/(tabs)/_layout.tsx:69-93` (ClassicTabLayout)

**Interfaces:**
- Consumes: the `about` route created in Task 1 (file-based routing — `NativeTabs.Trigger name="about"` / `Tabs.Screen name="about"` both resolve to `app/(tabs)/about.tsx` by filename convention, same as the existing `"index"` and `"settings"` entries).
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Write the failing test**

There's no existing test file for `_layout.tsx` (it's a routing config with two conditional branches gated on `isLiquidGlassAvailable()`, which isn't mockable/toggleable in the current Jest setup — the existing codebase has no test coverage for either tab-layout branch). Skip test-writing for this config-only task; verify via the existing test suite staying green (Step 2) and a manual code read (Step 3) instead. This matches the plan's Task Right-Sizing guidance: a routing-registration task has no independently testable behavior beyond "the file still renders and typechecks," which the existing suite plus `tsc` already cover.

- [ ] **Step 2: Confirm current test suite is green before changing shared layout**

Run:
```bash
export PATH="/private/tmp/pnpm-shim:$PATH"
pnpm test
```
Expected: all existing suites pass (e.g. `Test Suites: 9 passed, 9 total` — exact count may have grown since Task 1 added `about.test.tsx`).

- [ ] **Step 3: Add the `about` tab to both layout paths**

In `artifacts/mobile/app/(tabs)/_layout.tsx`, modify `NativeTabLayout`:

```tsx
function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: "bell", selected: "bell.fill" }} />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="about">
        <Icon sf={{ default: "info.circle", selected: "info.circle.fill" }} />
        <Label>About</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
```

And modify `ClassicTabLayout`'s `<Tabs>` children:

```tsx
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bell" tintColor={color} size={24} />
            ) : (
              <Feather name="bell" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: "About",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="info.circle" tintColor={color} size={24} />
            ) : (
              <Feather name="info" size={22} color={color} />
            ),
        }}
      />
```

(Only the new `NativeTabs.Trigger`/`Tabs.Screen` blocks are additions — the existing `index`/`settings` blocks are shown for exact placement and must remain unchanged, with the new `about` block inserted directly after `settings` in both.)

- [ ] **Step 4: Run the full test suite and typecheck**

Run:
```bash
export PATH="/private/tmp/pnpm-shim:$PATH"
pnpm test
pnpm run typecheck
```
Expected: all test suites pass, typecheck produces no output (zero errors).

- [ ] **Step 5: Commit**

```bash
git add "artifacts/mobile/app/(tabs)/_layout.tsx"
git commit -m "feat(mobile): register About as the third tab"
```

---

## Self-Review Notes

- **Spec coverage:** placeholder icon ✅ (Task 1, Feather `"compass"`), "CuriousMind Labs" name ✅, "Be Curious" tagline ✅, version from `app.json` ✅, third tab position ✅ (Task 2, inserted after `settings` in both layout paths), app rename explicitly out of scope ✅ (Global Constraints — no `app.json` `name`/package/icon changes made in either task).
- **Type consistency:** `AboutScreen` default export name matches between Task 1's creation and the route's implicit filename-based resolution in Task 2 (no explicit import needed, per Expo Router's file-based convention — consistent with how `index`/`settings` are already wired).
- Confirmed via direct experiment (not assumption) that `Constants.expoConfig?.version` from `expo-constants` returns `undefined` under this project's Jest setup (no mock exists for it), so the plan uses a direct `app.json` import instead, which was verified to both import correctly and typecheck cleanly under the existing `tsconfig.json`.
