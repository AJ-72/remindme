import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const THEME_PREFERENCE_KEY = "@theme_preference_v1";

export type ThemePreference = "light" | "dark" | "system";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

interface ThemeContextType {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

// Deliberately defaults to null rather than throwing from the hook, because
// ErrorFallback renders inside ErrorBoundary — which wraps the providers — so
// it can legitimately render with no ThemeProvider above it. useColors()
// treats a null context as "follow the system", which keeps a crash screen
// readable instead of throwing while already handling a crash.
const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    DEFAULT_THEME_PREFERENCE
  );

  useEffect(() => {
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((stored) => {
        // A corrupt or outdated stored value must not be able to wedge the
        // whole app's colours — fall back to following the system.
        if (isThemePreference(stored)) setPreferenceState(stored);
      })
      .catch(() => {});
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    // State first so the UI repaints immediately; persistence follows.
    setPreferenceState(next);
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, next);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * The user's theme choice. Returns the "system" default when no provider is
 * present rather than throwing — see the note on ThemeContext above.
 */
export function useThemePreference(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context) return context;
  return {
    preference: DEFAULT_THEME_PREFERENCE,
    setPreference: async () => {},
  };
}
