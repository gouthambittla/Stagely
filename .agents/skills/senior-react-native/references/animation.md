# Animation, Gestures, Haptics

Mobile changes three things about animation:

1. **There is no hover.** Every affordance lives in press, position, or nowhere.
2. **There are two runtimes.** The RN runtime (React, app logic) and the UI runtime (worklets, every frame). Motion that touches the RN runtime stutters as soon as the app does anything else. The craft is keeping motion on the UI runtime.
3. **The finger is on the element.** Interruptibility and velocity handoff are the baseline, not polish.

Two failure modes, the first worse: animating something that shouldn't animate, and animating the right thing on the wrong thread.

## The build sequence (in order)

### 1. Should it animate at all?

| Frequency | Decision |
|---|---|
| 100+ times/day: tab switches, keyboard, scrolling, settings toggles | **No animation.** Platform default or nothing. |
| Tens of times/day: press feedback, list navigation, selection | Near-imperceptible: under 150ms, or nothing |
| Occasional: sheets, modals, toasts, onboarding | Standard animation |
| Rare: success states, empty-state illustrations, celebrations | The delight budget lives here |

Tabs never slide. If the request fails this gate, say so and don't write it.

### 2. Name the purpose

Feedback, spatial consistency, state indication, preventing a jarring change, explanation, or delight (rare tier only). If you can't name one, don't build it.

### 3. Pick the cheapest tool that works

| Need | Tool |
|---|---|
| State-driven change, no gesture (press, toggle, color) | Reanimated CSS transition (`transitionProperty`) |
| Loop, multi-stage, or on-mount with no state change | Reanimated CSS animation (`animationName` keyframes) |
| Mount/unmount, list reflow | Layout animations (`entering` / `exiting` / `itemLayoutAnimation`) |
| Anything a finger touches or derived from scroll | `useSharedValue` + `Gesture` + `useAnimatedStyle` |
| Screen to screen | Native stack `animation` option, never hand-rolled |
| Sheet that is its own screen | `presentation: 'formSheet'` |
| Tab bar | `NativeTabs` |
| Context menu, peek | `Link.Menu` / `Link.Preview` (iOS) |
| Collapsing large title | `headerLargeTitleEnabled` (iOS), not a scroll worklet |
| Pull to refresh | `RefreshControl` |
| UI tracking the keyboard | `react-native-keyboard-controller` |
| Illustration, celebration | Lottie (never for UI state) |
| Huge scenes, freeform drawing | `@shopify/react-native-skia` |

Use a shared value only when the value is continuous or interruptible. A two-state press scale is a CSS transition.

Install: `npx expo install react-native-reanimated react-native-worklets react-native-gesture-handler expo-haptics`.

### 4. Pick the properties

- **`transform` and `opacity` are free.** `width`, `height`, `margin`, `padding`, `flex`, `top`, `left`, `gap` re-run layout every frame for the node and its siblings.
- Exception: an absolutely positioned, childless element (tab pill, progress fill) can animate `width`.
- Never `scale(0)`. Start from `scale(0.95)` + `opacity: 0`.
- Transform order matters: `[{ translateY }, { scale }]`. Keep translate first.
- Never animate Android `elevation` or `BlurView` intensity. Crossfade a static layer.
- `translateY: '100%'` moves an element by its own height.

### 5. Spring or timing

**A finger was involved → spring.** Springs carry velocity through interruptions; timing restarts. Use Reanimated's duration/dampingRatio form:

| Interaction | Config |
|---|---|
| Default settle, no overshoot | `{ duration: 400, dampingRatio: 1 }` |
| Snap back after a drag | `{ duration: 400, dampingRatio: 0.8, velocity }` |
| Sheet, drawer | `{ duration: 300, dampingRatio: 0.8, velocity }` |
| Must not pass an edge | add `overshootClamping: true` |

Bounce only when the gesture carried momentum.

Everything else uses timing. Entering/exiting and the default: ease-out. Moving on screen: ease-in-out. Constant motion: linear. **Never ease-in on UI.**

```tsx
import { cubicBezier, Easing } from "react-native-reanimated";

const CSS_EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);          // CSS transitions/animations
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);            // withTiming
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);          // iOS sheet curve
```

Reanimated CSS styles reject raw `'cubic-bezier(...)'` strings. Use `cubicBezier(...)`.

Durations: press 100–150ms, small state change 150–200ms, sheets ~300ms perceived, screen transitions = platform default.

### 6. Keep it off the JS thread

- Never `setState` from a gesture or scroll handler. Shared value → `useAnimatedStyle`, no React render.
- Never call back to the RN runtime per frame. `scheduleOnRN(fn, ...args)` from `react-native-worklets` (replaces deprecated `runOnJS`) belongs in `onEnd` or a `useAnimatedReaction` threshold, not `onUpdate`.
- Never read or write shared values during render. Only in worklets, handlers, and effects.
- Use `.get()` / `.set()`, not `.value` (React Compiler-safe). `sv.set((v) => v + 1)` works.
- Functions called from a worklet need `'worklet'` as their first line.

### 7. Press, not hover

- Feedback on press-in, commit on press-out.
- Button-like pressables: `scale: 0.97` over 100–150ms. Full-width list rows highlight the background instead of scaling.
- 44×44pt (48dp) touch targets via `hitSlop`; `pressRetentionOffset` so slight drift doesn't cancel.
- Android ripple only in Material-styled apps.

```tsx
import Animated, { cubicBezier } from "react-native-reanimated";

export function PressableScale({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  const [pressed, setPressed] = useState(false); // one render per press, not per frame
  return (
    <Pressable onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onPress={onPress}>
      <Animated.View
        style={{
          transform: [{ scale: pressed ? 0.97 : 1 }],
          transitionProperty: "transform",
          transitionDuration: 120,
          transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
```

### Gesture pattern: drag with velocity handoff

```tsx
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const y = useSharedValue(0);

const pan = Gesture.Pan()
  .onChange((e) => y.set((v) => Math.max(0, v + e.changeY)))
  .onEnd((e) => {
    const dismiss = e.translationY > 120 || e.velocityY > 800; // distance OR flick
    if (dismiss) {
      scheduleOnRN(onDismiss);
    } else {
      y.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: e.velocityY }));
    }
  });

const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

<GestureDetector gesture={pan}>
  <Animated.View style={style}>{/* ... */}</Animated.View>
</GestureDetector>;
```

Past a boundary, use rubber-band resistance rather than a hard stop.

### 8. Haptics

| Moment | Call |
|---|---|
| Value ticks past a step (picker, slider detent) | `Haptics.selectionAsync()` |
| Snap home, detent catches, drag commits | `Haptics.impactAsync(ImpactFeedbackStyle.Light)` |
| Heavy landing, destructive action | `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` |
| Success or failure | `Haptics.notificationAsync(NotificationFeedbackType.Success / Error)` |

Same frame as the visual. One per user action. Never on scroll, never the only feedback. From a worklet: `scheduleOnRN(Haptics.selectionAsync)`.

### 9. Reduced motion and accessibility

```tsx
import { useReducedMotion, ReduceMotion, withSpring } from "react-native-reanimated";

const reduced = useReducedMotion();
withSpring(0, { duration: 300, dampingRatio: 0.8, reduceMotion: ReduceMotion.System });
```

Reduced motion means fewer and gentler, not zero. Keep opacity and color changes that explain state; drop translation, scale, parallax, and overshoot. Screen transitions become `animation: 'fade'`.

Text scales, so never animate to a hardcoded height. Measure with `onLayout` or animate a transform.

## Setup that silently breaks motion

- Expo projects: `babel-preset-expo` configures the worklets plugin automatically. Bare RN: add `react-native-worklets/plugin` last in the Babel plugins, or you get `Failed to create a worklet`.
- `GestureHandlerRootView` must wrap the app, or gestures do nothing with no error.
- Reanimated 4 requires the New Architecture.
- 120fps on ProMotion iPhones requires `CADisableMinimumFrameDurationOnPhone: true` in `ios.infoPlist` (recent SDKs set it; confirm). The frame budget is then 8ms.
- Expo Go and dev builds are not performance environments.

## Never ship

| Never | Instead |
|---|---|
| `PanResponder` | `Gesture.Pan()` |
| `setState` in gesture/scroll handlers | shared value + `useAnimatedStyle` |
| `runOnJS` | `scheduleOnRN` |
| `scheduleOnRN` per frame | `onEnd` or `useAnimatedReaction` |
| Core `Animated` for touch-driven motion | Reanimated |
| Animating height/width/margin/flex/top | transform + opacity |
| `entering` on virtualized list rows | animate the container, or `itemLayoutAnimation` |
| JS-rebuilt screen transitions | native stack `animation` |
| Sliding tabs | `animation: 'none'` |
| `Easing.in(...)` on UI | `Easing.bezier(0.23, 1, 0.32, 1)` |
| `scale(0)` entrance | `scale(0.95)` + `opacity: 0` |
| Distance-only dismissal | velocity or distance |
| Haptic per frame or as only feedback | one per commit, always with a visual |

## Output

Write the code, then in a few lines: the gate result (frequency tier and purpose, plus anything rejected), the ingredients (tool, properties, curve or spring, thread), and what to feel-check on a device (flick it, interrupt it mid-flight, reverse it, run it on the slowest Android available).
