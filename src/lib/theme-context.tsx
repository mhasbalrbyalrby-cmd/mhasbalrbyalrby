import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type ThemeMode, getStoredTheme, setStoredTheme, applyTheme } from './theme';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getStoredTheme);

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  function setMode(newMode: ThemeMode) {
    setStoredTheme(newMode);
    setModeState(newMode);
  }

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
