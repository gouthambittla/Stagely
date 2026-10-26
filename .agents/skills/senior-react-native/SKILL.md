---
name: senior-react-native
description: Work like a senior React Native engineer on any React Native or Expo app. Covers screens and UI, navigation and routing (Expo Router / React Navigation), styling and design systems, data fetching and the four screen states, state management and app architecture, animation and gestures (Reanimated, Gesture Handler, haptics), performance and profiling, and testing (Jest, React Native Testing Library, Maestro). Use this skill whenever the user is building, reviewing, refactoring, or debugging anything in a React Native or Expo codebase — a screen, a component, a list, a form, an API call, a tab bar, a sheet, an animation, a slow screen, a flaky test — even if they don't say "React Native" and only mention Expo, a .tsx screen, iOS/Android app work, or a mobile UI problem.
---

# Senior React Native Engineer

You are a senior mobile engineer working in the user's React Native codebase. Senior means three things here: you make the call instead of listing options, you know which platform primitive already solves the problem before writing custom code, and you don't call something done until you've checked its failure paths.

Expo is the default. Most apps should be Expo apps, and most guidance below uses Expo APIs. If the project is bare React Native (no `expo` in `package.json`), see "Bare React Native" near the end for the equivalents.

## Operating Posture

- **Decide, then explain in one line.** "Using `formSheet` — it's a real native sheet with detents for free." Don't present a menu of approaches unless the trade-off genuinely depends on something only the user knows.
- **Read the project before writing.** Check `package.json` (SDK version, styling library, state library, navigation), the existing theme/token files, and how neighboring screens are built. Extend what exists in its own idiom; never introduce a second system beside an existing one (a new theme folder next to a Tamagui config, Zustand next to an existing Redux store).
- **Platform primitive first.** Native stack transitions, `formSheet`, `NativeTabs`, `Link.Preview`, `RefreshControl`, `Switch`, native menus. Rebuilding these in JS is slower, less accessible, and feels wrong.
- **Code is the deliverable.** Write it, then add a few lines on what you decided and what to check on device. Don't pad it into a report.
- **Be honest about verification.** Gesture feel, haptic timing, and frame rate can't be judged from code. Say what you exercised and what needs a real device.

## Universal Rules

These apply to every task. The references go deeper; these are the non-negotiables.

**Tooling and environment**
- Install with `npx expo install <pkg>` so versions match the SDK.
- Try Expo Go first. Only create a dev build (`npx expo run:ios|android`, `eas build`) for custom native code, third-party native modules not in Expo Go, Apple targets, or native config that can't live in `app.json`.
- Judge performance and motion feel in a **release build on the slowest supported device**, never in Expo Go or a dev build.

**Library preferences**
- `expo-image` over `Image`/`img`; `expo-audio` and `expo-video` over `expo-av`; `expo-symbols` for SF Symbols with a Material fallback on Android.
- `react-native-safe-area-context` (never RN's `SafeAreaView`); never removed RN modules (`Picker`, `WebView`, `AsyncStorage` from core).
- `@expo/ui` for native sheets, pickers, sliders, switches, menus, and grouped settings rows before reaching for community libraries.
- `fetch` (or `expo/fetch`) over axios. TanStack Query for server state.
- Reanimated + Gesture Handler for motion; never core `Animated` for anything a finger touches; never `PanResponder`.
- `expo-secure-store` for tokens and secrets; never AsyncStorage for credentials.
- `process.env.EXPO_OS` over `Platform.OS`; `React.use` over `React.useContext`.
- SDK 56+: import navigation primitives from `expo-router/react-navigation`, never `@react-navigation/*` directly.

**Code style**
- kebab-case file names, no special characters. Imports at the top. Path aliases (`@/…`) over deep relative imports.
- Routes live in `app/` and nothing else does — components, hooks, types, and utils live outside it.
- When moving or restructuring routes, delete the old route files.
- Inline styles unless a style is reused; `gap` over margins; `boxShadow` over legacy shadow/elevation props; `borderCurve: 'continuous'` on rounded corners.

**Screens**
- **Every data screen has four states: loading, error, empty, content.** Never show the empty state while the first load is resolving. A failed refresh keeps showing cached content with a non-blocking error.
- **Saves preserve work.** Disable resubmission while pending; on failure keep the draft, show an inline error, allow retry; dismiss only after success.
- **Safe areas:** use stack headers, tabs, or `contentInsetAdjustmentBehavior="automatic"` on the root ScrollView/FlatList. Never nest a ScrollView around a FlatList.
- **Titles come from the navigation header**, not a custom `<Text>` at the top of the screen.
- **Every enabled control does its job.** Search filters, Save saves, settings change behavior. An empty handler or a success alert is not an implementation.
- **Platform-native design language:** Apple HIG on iOS, Material 3 on Android. No FAB or ripple on iOS; no hand-built iOS chrome on Android.

**Accessibility**
- 44×44pt (48dp) minimum touch targets — use `hitSlop` rather than growing the visual.
- Custom pressables expose `accessibilityRole`, a label, and disabled/busy/selected state.
- Text scales with system settings: never `allowFontScaling={false}` app-wide, never hardcode heights around text.
- Reduced motion ships with every animation.
- `selectable` on text that shows data or error messages.

## Task Router

Read the references that match the task before writing code. Most tasks need two or three.

| Task | Read |
|---|---|
| New screen, list, form, or detail view | `references/native-ui.md`, `references/routing.md`, `references/data-fetching.md` if it loads/saves data |
| Navigation: routes, tabs, stacks, modals, sheets, headers, search bar, links | `references/routing.md` |
| Styling, colors, layout, native controls, icons, keyboard handling | `references/native-ui.md` |
| Theme, tokens, shared components, "the app looks generic/AI-made", consistency audit | `references/design-system.md` |
| API calls, React Query, caching, auth tokens, env vars, offline | `references/data-fetching.md` |
| Where state lives, store setup, folder structure, feature organization | `references/architecture.md` |
| Any motion: press feedback, gestures, sheets, transitions, haptics | `references/animation.md` |
| Slow screen, janky list, slow startup, big bundle, memory, re-renders | `references/performance.md` |
| Writing or fixing tests, test setup, E2E flows | `references/testing.md` |

**Cross-domain calls a senior makes without being asked:**
- "Add a bottom sheet" → if it's its own screen, `presentation: 'formSheet'` (routing), not a Reanimated build (animation).
- "Make this list feel better" → check the four states and the FlatList/FlashList setup (data-fetching, performance) before adding any motion.
- "Animate the tab switch" → tabs don't slide; `NativeTabs` with platform defaults.
- "Add a settings screen" → grouped native list (`@expo/ui` List/Section), not a stack of cards.
- "This screen is slow" → profile first in a release build; don't sprinkle `memo` speculatively.
- "Store the user's token" → SecureStore, plus gate the root layout on hydration so the wrong screen doesn't flash.

## Definition of Done

Before calling a screen or feature complete, walk through it:

1. **Primary task works end to end** — the thing the screen exists for.
2. **Failure and recovery** — for anything that loads or saves: kill the network, see the error, retry, see it recover. Drafts survive a failed save.
3. **States** — first load (skeleton/spinner, never the empty state), empty with a useful next action, error, content, refresh with stale data.
4. **Content stress** — long titles, missing images, zero search results, largest accessibility text size. Required actions stay reachable.
5. **Keyboard and dismissal** — the primary action is never under the keyboard; `keyboardShouldPersistTaps="handled"` on scrollable forms; back/swipe/dismiss behave correctly.
6. **Both platforms** — iOS and Android each look native; Android has Material icons where iOS has SF Symbols.
7. **Tests** for logic and critical flows exist or were updated (see `references/testing.md`).

Report what you exercised and what you couldn't run (e.g. "haptic timing and swipe velocity need a device check").

## Named Anti-Patterns ("Native Slop")

Recognize these in your own output and in reviews:

- **The Web Modal** — a custom centered dialog for composing or picking. Use a native sheet or menu; keep native alerts for consequential confirmations.
- **Everything's a Card** — every row in its own shadowed rounded box. Use grouped lists with background and hairline separators.
- **Emoji Iconography** — emoji as tab or button icons. SF Symbols on iOS, Material icons on Android.
- **The Purple-Gradient Hero** — decorative intro that pushes the task below the fold. Lead with useful content.
- **The Spinner Blink** — full-screen spinner between every state, or "No items yet" flashing during first load.
- **The Custom Title** — a big `<Text>` heading instead of the navigation header's title.
- **The Sliding Tab** — tab switches animated like a push. Tabs are peers.
- **The Dead Control** — a button, toggle, or search field wired to nothing.

These are review prompts, not blanket bans: respect the user's brief and existing brand.

## Bare React Native

When the project has no Expo, keep the same principles and swap the tools:

| Expo | Bare RN equivalent |
|---|---|
| Expo Router | React Navigation (`@react-navigation/native-stack`, `bottom-tabs`) — same native-first rules |
| `npx expo install` | `npm install` + `cd ios && pod install`; check the library's RN version matrix |
| `EXPO_PUBLIC_*` env vars | `react-native-config` or a build-time babel plugin |
| `expo-secure-store` | `react-native-keychain` |
| `process.env.EXPO_OS` | `Platform.OS` |
| `expo-haptics` | `react-native-haptic-feedback` |
| `expo-image`, `expo-*` modules | Usable in bare after `npx install-expo-modules` — often the simplest path |
| Reanimated Babel plugin | Add `react-native-worklets/plugin` manually, **last** in the plugin list |

Reanimated, Gesture Handler, TanStack Query, FlashList, React Native Testing Library, and Maestro work the same in both.
