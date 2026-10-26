# Native UI: Styling, Layout, Controls

Follow each platform's design language: Apple HIG on iOS, Material Design 3 on Android. Never dress one platform in the other's uniform.

## Controls: check `@expo/ui` first

`@expo/ui` renders real SwiftUI (iOS) and Jetpack Compose (Android) and works in Expo Go on SDK 56+. Use it for BottomSheet, Button, Picker, Slider, Menu, Section, Switch, SegmentedControl, and grouped settings rows (`List` + `ListItem`) before using RN built-ins or community libraries.

`@expo/ui`'s `List` is not virtualized. For feeds, search results, catalogs, or anything of unknown length, use `FlatList` or `FlashList`.

Don't wrap platform components that already carry the design language (`Switch`, `DateTimePicker`, stack headers, `@expo/ui` views) just to route them through your design system.

## Colors

Use the `Color` API from `expo-router`: type-safe semantic colors that resolve on-device and adapt to light/dark and accessibility settings. Wrap each in `Platform.select` with a web fallback and centralize in `theme/colors.ts`:

```tsx
// theme/colors.ts
import { Platform } from "react-native";
import { Color } from "expo-router";

export const colors = {
  label: Platform.select({ ios: Color.ios.label, android: Color.android.dynamic.onSurface, default: "#000000" })!,
  secondaryLabel: Platform.select({ ios: Color.ios.secondaryLabel, android: Color.android.dynamic.onSurfaceVariant, default: "#3c3c43" })!,
  separator: Platform.select({ ios: Color.ios.separator, android: Color.android.dynamic.outlineVariant, default: "#c6c6c8" })!,
  systemBackground: Platform.select({ ios: Color.ios.systemBackground, android: Color.android.dynamic.surface, default: "#ffffff" })!,
  secondarySystemBackground: Platform.select({ ios: Color.ios.secondarySystemBackground, android: Color.android.dynamic.surfaceVariant, default: "#f2f2f7" })!,
  systemBlue: Platform.select({ ios: Color.ios.systemBlue, android: Color.android.dynamic.primary, default: "#007aff" })!,
};
```

- `Color.android.dynamic.*` follows the wallpaper on Android 12+; `Color.android.material.*` is static.
- On Android, call `useColorScheme()` in components that render these colors so they re-render on theme change (needed under React Compiler memoization).
- Never pass `Color`/`PlatformColor` values into Reanimated styles; they're opaque native objects. Use static colors there.
- Some third-party props accept only `string` (e.g. `tintColor` on `expo-image`): cast with `as string`.

## Layout and safe areas

- Screens with scrollable content: a `ScrollView` with `contentInsetAdjustmentBehavior="automatic"` instead of `SafeAreaView`. Apply the same prop to FlatList and SectionList.
- A screen whose root is a FlatList/FlashList must not have an outer ScrollView. Full-bleed screens (camera, map, canvas) need neither.
- Account for top and bottom safe areas via headers, tabs, or the inset adjustment.
- Use flexbox; measure with `useWindowDimensions`, never `Dimensions.get()`.
- Pad ScrollView content with `contentContainerStyle` (padding + gap), not padding on the ScrollView itself.
- Prefer `gap` over margins, and padding over margin.
- Inline styles unless reuse is real. CSS and Tailwind classes are unsupported unless the project uses NativeWind.

## Styling details

- Rounded corners: `borderCurve: 'continuous'` (except capsules).
- Shadows: `boxShadow` strings only (`"0 1px 2px rgba(0,0,0,0.05)"`, inset supported). Never legacy `shadow*` or `elevation`.
- Counters and numeric columns: `fontVariant: ['tabular-nums']`.
- Format large numbers (1.4M, 38k).
- `selectable` on text showing data or error messages.
- Never intrinsic web elements (`div`, `img`) outside a WebView or DOM component.

## Icons

- iOS: SF Symbols via `expo-symbols` (`SymbolView`), not `@expo/vector-icons`.
- Android: every icon needs a Material source. SF Symbols don't exist there.
- Never emoji as UI icons.

## Keyboard and forms

- Scrollable forms and search results: `keyboardShouldPersistTaps="handled"` so controls get the first tap and unhandled taps dismiss the keyboard.
- The primary action must never sit under the keyboard. For UI that tracks the keyboard frame, use `react-native-keyboard-controller` (`KeyboardProvider` at root, `KeyboardAvoidingView` or `KeyboardStickyView` from that library). Never `Keyboard.addListener` plus a timing animation.
- Async saves: preserve drafts, show pending and failure states, dismiss only after success.

## Haptics

Use `expo-haptics` sparingly on iOS for meaningful moments (commit, detent, success/failure). Prefer components with built-in haptics (`Switch`, native date picker). Full rules in `animation.md`.

## Media and storage

- Images: `expo-image`. Audio: `expo-audio`. Video: `expo-video`. Never `expo-av`.
- Persistent data: `expo-sqlite` for structured data; `@react-native-async-storage/async-storage` or MMKV for small key-values; `expo-secure-store` for secrets.
- Never legacy `expo-permissions`; each module exposes its own permission hook.

## Visual effects

- Blur: `expo-blur`. Liquid glass: `expo-glass-effect`. Never animate blur intensity; crossfade a static blur instead.
- Gradients: `experimental_backgroundImage` CSS gradients (New Architecture) or `expo-linear-gradient`.
