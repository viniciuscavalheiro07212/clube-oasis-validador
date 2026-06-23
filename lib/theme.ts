// Paleta alinhada à identidade visual do site clube-oasis
// (azul piscina/turquesa, verde emerald, amarelo/âmbar nos CTAs).

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

/** Formata número como moeda BRL (igual ao formatBRL do site). */
export function formatBRL(value: number): string {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
