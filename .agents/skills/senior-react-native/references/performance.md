# Performance and Profiling

## Measure first

Don't optimize from intuition. Find the slow thing, fix it, measure again.

1. **Reproduce in a release build.** Dev mode is many times slower and hides or invents problems.
   - `npx expo start --no-dev --minify` for a quick JS check.
   - `npx expo run:ios --configuration Release` / `npx expo run:android --variant release` for real numbers.
2. **Use the slowest device you support**, ideally a mid-range Android a few years old.
3. **Identify which thread is struggling.** The dev menu's Perf Monitor shows the JS and UI frame rates separately:
   - JS FPS drops → too much JavaScript work (renders, logic, parsing).
   - UI FPS drops → too much native work (layout, overdraw, image decoding, animated layout props).
4. **Profile:**
   - React renders: React Native DevTools (press `j` in the Expo CLI) → Profiler tab. Enable "highlight updates" to see what re-renders.
   - Native: Xcode Instruments (Time Profiler, Allocations) and the Android Studio profiler.
   - Bundle: Expo Atlas (`EXPO_ATLAS=true npx expo start`; older SDKs use `EXPO_UNSTABLE_ATLAS`).

State what you measured and the before/after numbers in your reply.

## Re-renders

- **React Compiler** handles most memoization automatically in recent Expo SDKs. Check whether it's enabled (`experiments.reactCompiler` in app config) before hand-adding `memo`/`useMemo`/`useCallback`.
- Without the compiler, memoize where profiling shows it matters: list row components (`memo`), callbacks passed to memoized children, expensive derivations.
- Common causes of excess renders:
  - Context values recreated every render, or one context holding fast- and slow-changing data.
  - Store hooks without selectors (`useStore()` instead of `useStore(s => s.x)`).
  - Inline objects/arrays as props to memoized children.
  - `setState` in scroll or gesture handlers. Use shared values (see `animation.md`).
  - `useEffect` chains that set state from other state. Derive instead.

## Lists

Lists are where most RN performance problems live.

- **Use FlashList** (`@shopify/flash-list`) for long or complex lists. FlashList v2 requires the New Architecture and doesn't need `estimatedItemSize`; v1 does.
- Provide `getItemType` when rows differ in shape, so recycling reuses matching views.
- **Stable keys** via `keyExtractor`, from data ids, never array index for mutable lists.
- **Row components:** memoized, cheap, no data fetching inside, no inline heavy computation. Precompute display values outside the row.
- Never put a FlatList/FlashList inside a ScrollView. Use `ListHeaderComponent`/`ListFooterComponent`, or `SectionList`.
- FlatList only: `getItemLayout` for fixed-height rows; tune `windowSize`, `initialNumToRender`, `maxToRenderPerBatch` only after measuring.
- No `entering` layout animations on virtualized rows.
- Paginate with `onEndReached` + `useInfiniteQuery`; show a footer spinner, not a full-screen one.

## Images

- `expo-image` with appropriate `contentFit`; it caches to memory and disk.
- Request images at display size from the server/CDN. Decoding a 4000px image into an 80px avatar burns memory and UI time.
- In recycled lists, set `recyclingKey` so a recycled cell doesn't flash the previous image.
- Use `placeholder` (blurhash/thumbhash) for perceived speed, and `transition` for a short fade.
- `priority="high"` for above-the-fold hero images only.

## Animation

All motion on the UI thread with transform/opacity. See `animation.md`. Animating layout properties or calling back to JS per frame is the most common cause of UI-thread jank.

## Startup time

- Hermes is the default engine; keep it on.
- Keep the splash screen (`expo-splash-screen` `preventAutoHideAsync`) up only while loading what the first screen truly needs: fonts, hydrated auth/prefs. Hide it as soon as those are ready.
- Avoid heavy work at module top level (large JSON parsing, synchronous storage reads of big blobs, SDK inits that can wait).
- Defer non-critical SDKs (analytics, crash reporting extras) until after first render.
- Large dependencies: check Atlas. Replace heavy libs (moment → date-fns or `Intl`, full lodash → individual functions).
- Expo Router lazy-loads routes on native in production; avoid importing every screen into a shared module.

## Memory and leaks

- Every subscription has a cleanup: NetInfo, AppState, event emitters, timers, websocket handlers.
- Abort in-flight fetches on unmount (TanStack Query does this with `signal`).
- Long sessions growing in memory usually mean an unbounded cache (images, query cache with `gcTime: Infinity`), or listeners added on every render.

## JS thread offloading

- Heavy computation (parsing large payloads, crypto, image processing): move it to the server, a native module, or a worklet runtime, rather than blocking the JS thread.
- `InteractionManager.runAfterInteractions` or `requestIdleCallback` to defer non-urgent work until transitions finish.

## Checklist for "this screen is slow"

1. Release build, slow device: is it actually slow?
2. Perf Monitor: JS or UI thread?
3. JS: profile renders → fix the top offender (selectors, context split, memoized rows, derived state).
4. UI: look for animated layout props, oversized images, deep view nesting, overdraw from stacked opaque backgrounds.
5. Lists: FlashList, stable keys, cheap rows, item types.
6. Re-measure and report numbers.
