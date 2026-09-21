// The prototype's design tokens, mapped onto Tailwind theme variables (A-9).
//
// Source: prototype/src/styles/tokens.css — harvested (architecture §7), values
// copied verbatim into app/theme.css. Only the NAME changes: every token takes
// Tailwind v4's namespace for its kind and a `ww-` segment, because shadcn/ui's
// own theme already owns `--color-border`, `--color-accent`, `--font-sans`,
// `--font-mono` and `--radius-*`. Utilities read `bg-ww-bg`, `text-ww-ink`,
// `border-ww-border`, `text-ww-sm`, `p-ww-4`, `rounded-ww`, `font-ww-narrow`.
//
// Pointing shadcn's semantic variables (--background, --primary, --border …) at
// these tokens is a screen-level decision for the first U order, not this file's.
// tests/design-tokens.test.ts holds this map against both stylesheets.
export const tokenMap: Record<string, string> = {
  "--c-bg": "--color-ww-bg",
  "--c-surface": "--color-ww-surface",
  "--c-surface-2": "--color-ww-surface-2",
  "--c-ink": "--color-ww-ink",
  "--c-ink-soft": "--color-ww-ink-soft",
  "--c-ink-faint": "--color-ww-ink-faint",
  "--c-border": "--color-ww-border",
  "--c-border-strong": "--color-ww-border-strong",
  "--c-accent": "--color-ww-accent",
  "--c-accent-ink": "--color-ww-accent-ink",
  "--c-accent-soft": "--color-ww-accent-soft",
  "--c-accent-dark": "--color-ww-accent-dark",
  "--c-ok": "--color-ww-ok",
  "--c-ok-soft": "--color-ww-ok-soft",
  "--c-warn": "--color-ww-warn",
  "--c-warn-soft": "--color-ww-warn-soft",
  "--c-danger": "--color-ww-danger",
  "--c-danger-soft": "--color-ww-danger-soft",
  "--c-stock-here": "--color-ww-stock-here",
  "--c-stock-here-soft": "--color-ww-stock-here-soft",
  "--c-stock-coming": "--color-ww-stock-coming",
  "--c-stock-coming-soft": "--color-ww-stock-coming-soft",
  "--c-stock-before": "--color-ww-stock-before",
  "--c-stock-before-soft": "--color-ww-stock-before-soft",
  "--c-stock-never": "--color-ww-stock-never",
  "--c-stock-never-soft": "--color-ww-stock-never-soft",
  "--font-sans": "--font-ww-sans",
  "--font-narrow": "--font-ww-narrow",
  "--font-mono": "--font-ww-mono",
  "--fs-xs": "--text-ww-xs",
  "--fs-sm": "--text-ww-sm",
  "--fs-base": "--text-ww-base",
  "--fs-md": "--text-ww-md",
  "--fs-lg": "--text-ww-lg",
  "--fs-xl": "--text-ww-xl",
  "--lh": "--leading-ww",
  "--sp-1": "--spacing-ww-1",
  "--sp-2": "--spacing-ww-2",
  "--sp-3": "--spacing-ww-3",
  "--sp-4": "--spacing-ww-4",
  "--sp-5": "--spacing-ww-5",
  "--sp-6": "--spacing-ww-6",
  "--sp-7": "--spacing-ww-7",
  "--radius": "--radius-ww",
  "--radius-sm": "--radius-ww-sm",
  "--radius-lg": "--radius-ww-lg",
  "--shadow-1": "--shadow-ww-1",
  "--shadow-2": "--shadow-ww-2",
  "--measure": "--container-ww-measure",
};
