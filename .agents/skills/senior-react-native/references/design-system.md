# Design System: Tokens and Reusable Components

Every screen should draw from one visual source of truth: a token theme plus a small set of reusable components. `native-ui.md` says which values look native; this file says where values live and how they're reused.

## Adopt before you build

In an app that already has screens, start by detecting what exists:

1. Check `package.json` for a styling library: NativeWind/Tailwind, Tamagui, Restyle, Unistyles, styled-components. Then look for a token file: `theme.ts`, `src/theme/`, `constants/theme.ts`, `constants/Colors.ts`.
2. If one exists, it is the source of truth. Extend it in its own idiom: its names, its scale, its storage format.
3. If there are only repeated literals (the same greys and paddings across screens), derive tokens from the most frequent values, snapped to a 4-point grid.
4. Never add a second system beside an existing one.

For Tailwind/NativeWind projects, keep tokens as CSS variables in `global.css`. The scales below still apply.

## The theme

One entry point. Start with `src/theme.ts` (or `theme/` at the root if there's no `src/`) and split by token class as it grows:

```
src/theme/
  colors.ts   spacing.ts   typography.ts   radius.ts   shadows.ts   motion.ts
  index.ts    # import { spacing, type } from "@/theme"
```

Rules:
- A visual literal used twice belongs in the theme.
- Components import tokens; screens import components.
- No hardcoded hex, font sizes, or spacing outside the theme. Genuine one-offs (an icon's optical nudge) stay inline with a comment explaining why.

### Colors

Semantic platform colors from `native-ui.md` cover backgrounds, labels, and separators. Add brand colors only where the platform has no equivalent, as light/dark pairs, and keep the set tiny:

```tsx
const brandPalette = {
  light: { accent: "#5B21B6", accentContrast: "#FFFFFF" },
  dark: { accent: "#A78BFA", accentContrast: "#1E1B4B" },
} as const;

export function useBrandColors() {
  const scheme = useColorScheme();
  return brandPalette[scheme === "dark" ? "dark" : "light"];
}
```

Semantic colors are static-safe: plain token files can import them. Brand pairs from a hook are render-time only. Don't mix them in static style objects; apply brand colors in the component, or use `DynamicColorIOS` to make them static-safe on iOS.

### Spacing (4-point grid, named by size)

```tsx
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
```

Use with `gap`. Pick one screen edge padding (usually `md`) and keep it. If an in-between value (12, 20) keeps recurring, add it as a named step rather than scattering literals.

### Typography (mirror the platform ramp)

```tsx
import { TextStyle } from "react-native";
import { colors } from "./colors";

export const type = {
  largeTitle: { fontSize: 34, fontWeight: "700", color: colors.label },
  title: { fontSize: 22, fontWeight: "600", color: colors.label },
  headline: { fontSize: 17, fontWeight: "600", color: colors.label },
  body: { fontSize: 17, fontWeight: "400", color: colors.label },
  subhead: { fontSize: 15, fontWeight: "400", color: colors.secondaryLabel },
  caption: { fontSize: 12, fontWeight: "400", color: colors.secondaryLabel },
} as const satisfies Record<string, TextStyle>;
```

With custom static font files (one per weight), set weight through `fontFamily` and omit `fontWeight`, or iOS synthesizes or falls back.

Expose the ramp through one component so screens never touch `fontSize`:

```tsx
export function ThemedText({ variant = "body", style, ...props }: TextProps & { variant?: keyof typeof type }) {
  return <Text style={[type[variant], style]} {...props} />;
}
```

Dynamic Type: let rows grow with `minHeight`/padding, test the largest accessibility sizes, prefer wrapping over `maxFontSizeMultiplier`, never disable scaling app-wide.

### Radius, shadows, motion

```tsx
export const radius = { sm: 8, md: 12, lg: 16, full: 9999 } as const; // pair non-capsules with borderCurve: "continuous"
export const shadows = {
  card: "0 1px 2px rgba(0, 0, 0, 0.05)",
  raised: "0 4px 12px rgba(0, 0, 0, 0.10)",
  overlay: "0 8px 24px rgba(0, 0, 0, 0.18)",
} as const;
export const motion = { fast: 150, base: 250, slow: 400 } as const; // press / enter-exit / sheets
```

## The component contract

Every shared primitive defines explicitly:

- **Variants**: visual intent (`primary`, `secondary`, `ghost`, `destructive`). Add one only when a real screen needs it.
- **Sizes**: `sm`, `md`, `lg`, mapped to tokens; default `md`.
- **States**: default, pressed (touch has no hover), disabled, loading. Every tappable element has pressed feedback.
- **Style override**: accept `style` and merge it last, for layout only. A caller changing a button's colors means a variant is missing.
- **Accessibility**: role, label, and disabled/busy/selected state. Icon-only buttons and buttons that swap text for a spinner need an explicit label.

```tsx
const variants = {
  primary: { backgroundColor: colors.systemBlue, color: "#ffffff" },
  secondary: { backgroundColor: colors.separator, color: colors.label },
} as const;
const sizes = {
  sm: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  md: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
} as const;

export function Button({ variant = "primary", size = "md", title, loading, disabled, style, onPress }: {
  variant?: keyof typeof variants; size?: keyof typeof sizes; title: string;
  loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; onPress?: () => void;
}) {
  const isDisabled = !!(disabled || loading);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: variants[variant].backgroundColor,
          borderRadius: radius.md,
          borderCurve: "continuous",
          alignItems: "center",
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          ...sizes[size],
        },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={variants[variant].color as string} />
        : <ThemedText variant="headline" style={{ color: variants[variant].color }}>{title}</ThemedText>}
    </Pressable>
  );
}
```

### Composition over configuration

When props start describing content (`leftIcon`, `subtitle`, `footerText`, `badgeCount`), stop adding props and accept `children`. Reserve props for variant, size, state, and style.

### When to extract

Promote a view into `src/components/` only when all three hold:

1. It appears, or is about to appear, in two or more screens.
2. It has a nameable role (Card, EmptyState, Badge).
3. Its API is smaller than its implementation.

Path: inline JSX → component next to the screen → `src/components/`. One step at a time, never speculatively. A duplicated view is cheaper than a primitive with a bad API.

## Self-critique pass

After building a screen, screenshot it and check:

- **Hierarchy**: is the most important element obviously first? Fix with type ramp steps.
- **Proximity**: do related items sit closer than unrelated ones? Fix with gap and spacing tokens.
- **Repetition**: do corners, shadows, and accents match? If not, a value escaped the theme.
- **Alignment**: do edges share axes? Fix with consistent edge padding.

If the same defect appears on several screens, fix the shared token or component, not each screen.

## Drift audit (quick)

To check an existing app for drift, grep outside the theme folder:

```bash
grep -rnE "#[0-9a-fA-F]{3,8}\b" src app --include=*.tsx | grep -v theme/     # hardcoded colors
grep -rnE "fontSize: ?[0-9]+" src app --include=*.tsx | grep -v theme/        # raw font sizes
grep -rnE "(margin|padding)\w*: ?[0-9]+" src app --include=*.tsx | grep -v theme/  # raw spacing
grep -rnE "shadow(Color|Offset|Opacity|Radius)|elevation:" src app --include=*.tsx # legacy shadows
```

Fix in this order: colors → typography → spacing → shared components. Ship each step separately.
