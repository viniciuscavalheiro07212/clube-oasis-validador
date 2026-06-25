// ============================================================
// SISTEMA DE DESIGN - "Grafite premium" (escuro padrao + claro)
// Tokens espelham o visual: fundo grafite, acento dourado e
// cards elevados. Tema escuro e o padrao.
// ============================================================

import { createElement, createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface ThemeTokens {
  isDark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  green: string;
  greenBg: string;
  blue: string;
  blueBg: string;
  amber: string;
  amberBg: string;
  teal: string;
  tealBg: string;
  red: string;
  redBg: string;
  radius: number;
  cardShadow: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
  shadowStyle: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
}

export type ThemeContextValue = ThemeTokens & {
  theme: ThemeTokens;
  tokens: ThemeTokens;
  toggle: () => void;
  toggleTheme: () => void;
};

const darkShadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.5,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 2 },
  elevation: 6,
};

const lightShadow = {
  shadowColor: "#191B1F",
  shadowOpacity: 0.08,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
};

const dark: ThemeTokens = {
  isDark: true,
  bg: "#0D0F13",
  surface: "#171A20",
  surface2: "#121419",
  border: "#272B33",
  text: "#F2F0E8",
  text2: "#A6A498",
  text3: "#6D6B62",
  accent: "#D7B24E",
  accentSoft: "rgba(215,178,78,0.16)",
  onAccent: "#15161A",
  green: "#4FB37B",
  greenBg: "rgba(79,179,123,0.14)",
  blue: "#7FA7D8",
  blueBg: "rgba(127,167,216,0.16)",
  amber: "#E2B458",
  amberBg: "rgba(226,180,88,0.15)",
  teal: "#56C3C9",
  tealBg: "rgba(86,195,201,0.14)",
  red: "#EF6B6B",
  redBg: "rgba(239,107,107,0.15)",
  radius: 14,
  cardShadow: darkShadow,
  shadowStyle: darkShadow,
};

const light: ThemeTokens = {
  isDark: false,
  bg: "#F2F1EC",
  surface: "#FFFFFF",
  surface2: "#F6F4EE",
  border: "#E7E3D9",
  text: "#191B1F",
  text2: "#6A695F",
  text3: "#9C9A8E",
  accent: "#A07C16",
  accentSoft: "#F2E9CF",
  onAccent: "#FFFFFF",
  green: "#2E8C58",
  greenBg: "#E3F1E8",
  blue: "#3F6E9C",
  blueBg: "#E7EEF5",
  amber: "#B5832A",
  amberBg: "#F4ECD6",
  teal: "#2D8A8F",
  tealBg: "#E0F0F0",
  red: "#C0392B",
  redBg: "#F7E0DC",
  radius: 14,
  cardShadow: lightShadow,
  shadowStyle: lightShadow,
};

export const fonts = {
  medium: "Sora_500Medium",
  semibold: "Sora_600SemiBold",
  bold: "Sora_700Bold",
  extrabold: "Sora_800ExtraBold",
} as const;

export const colors = {
  sky: "#0ea5e9",
  skyDark: "#0369a1",
  cyan: "#06b6d4",
  emerald: "#10b981",
  emeraldDark: "#047857",
  amber: "#f59e0b",
  amberLight: "#fbbf24",
  red: "#ef4444",
  redDark: "#b91c1c",
  bg: "#f1f5f9",
  card: "#ffffff",
  text: "#0f172a",
  textMuted: "#64748b",
  border: "#e2e8f0",
  white: "#ffffff",
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  const value = useMemo<ThemeContextValue>(() => {
    const tokens = isDark ? dark : light;
    const toggle = () => setIsDark((v) => !v);
    return {
      ...tokens,
      isDark,
      theme: tokens,
      tokens,
      toggle,
      toggleTheme: toggle,
    };
  }, [isDark]);

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve ser usado dentro de <ThemeProvider>");
  return ctx;
}

export function useThemeControls(): { isDark: boolean; toggle: () => void } {
  const ctx = useTheme();
  return { isDark: ctx.isDark, toggle: ctx.toggle };
}

export function formatBRL(value: number): string {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
