import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { getSetting, setSetting } from '@/lib/db/settings';
import { themes, type ThemeColors, type ThemeName } from '@/lib/theme';

/** What the user chose. 'system' follows the OS and is the default. */
export type ThemePreference = 'system' | ThemeName;

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

// The stored value is a string from the database, which is a boundary like any
// other: a hand-edited row or a value written by an older build must not put the
// app into an unrenderable state. Anything unrecognised falls back to 'system'.
function toPreference(stored: string | null): ThemePreference {
  return PREFERENCES.includes(stored as ThemePreference)
    ? (stored as ThemePreference)
    : 'system';
}

interface ThemeContextValue {
  /** The resolved palette to render with. */
  theme: ThemeColors;
  /** Which palette that is, after resolving 'system'. */
  name: ThemeName;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // Load the saved preference once. Until it arrives the app renders with
  // 'system', which is both the default and the least surprising thing to show
  // for the frame or two before the read completes.
  useEffect(() => {
    let active = true;
    getSetting('themePreference')
      .then((stored) => {
        if (active) setPreferenceState(toPreference(stored));
      })
      .catch((error: unknown) => {
        // A failed read is not worth blocking the UI over — the default is fine.
        console.warn('Could not load theme preference:', error);
      });
    return () => {
      active = false;
    };
  }, []);

  // Optimistic: update the UI immediately, persist in the background. A theme
  // toggle that waits for a disk write feels broken.
  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setSetting('themePreference', next).catch((error: unknown) => {
      console.warn('Could not save theme preference:', error);
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const name: ThemeName =
      preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
    return { theme: themes[name], name, preference, setPreference };
  }, [preference, systemScheme, setPreference]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

/** The active theme. Throws outside the provider, which is a wiring bug, not a runtime state. */
export function useTheme(): ThemeContextValue {
  const value = use(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
