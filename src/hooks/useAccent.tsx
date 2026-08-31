import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';
import { getSetting, setSetting } from '@/lib/db/settings';
import { ACCENTS, DEFAULT_ACCENT, toAccentKey, type Accent, type AccentKey } from '@/lib/theme';

// The highlight colour, and the only part of the palette that changes while the
// app is running.
//
// Everything else is baked into `StyleSheet.create` at import time, which is
// the right trade for a theme that never moves. The accent does move, so it
// cannot live there: a stylesheet is built once and would keep whatever colour
// was current when the module first loaded. So it travels through context and
// is layered over the static style at each of the places that draw it.

const SETTING_KEY = 'accent';

interface AccentValue {
  accent: Accent;
  choose: (key: AccentKey) => void;
}

const AccentContext = createContext<AccentValue>({
  accent: ACCENTS[DEFAULT_ACCENT],
  choose: () => undefined,
});

/**
 * Provides the chosen accent to the tree.
 *
 * Starts on the default and swaps once the stored choice has been read. That
 * flash is deliberate: blocking the first paint on a database round-trip to
 * avoid one frame of the wrong orange would be a worse trade, and the default
 * is what most installs are on anyway.
 */
export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<AccentKey>(DEFAULT_ACCENT);

  useEffect(() => {
    let active = true;
    getSetting(SETTING_KEY)
      .then((stored) => {
        if (active) setKey(toAccentKey(stored));
      })
      .catch((error: unknown) => console.warn('Could not read the accent:', error));
    return () => {
      active = false;
    };
  }, []);

  const choose = useCallback((next: AccentKey): void => {
    // Applied first and written after. The write is a preference, not data —
    // if it fails the app is still the colour that was asked for, and the
    // choice can simply be made again.
    setKey(next);
    setSetting(SETTING_KEY, next).catch((error: unknown) =>
      console.warn('Could not save the accent:', error)
    );
  }, []);

  const value = useMemo(() => ({ accent: ACCENTS[key], choose }), [key, choose]);

  return <AccentContext value={value}>{children}</AccentContext>;
}

/** The accent in force. Safe outside a provider: it falls back to the default. */
export function useAccent(): Accent {
  return use(AccentContext).accent;
}

/** The accent plus the setter, for the Settings picker. */
export function useAccentChoice(): AccentValue {
  return use(AccentContext);
}
