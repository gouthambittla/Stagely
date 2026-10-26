# State Management and App Architecture

## Where state lives

Most "state management" problems come from putting state in the wrong place. Classify first:

| Kind of state | Lives in | Examples |
|---|---|---|
| Server state (owned by a backend) | TanStack Query cache | user profile, feed, orders |
| Navigation state | Route + params (Expo Router) | selected item id, active tab, search query you want deep-linkable |
| Form state | Form library or local state | draft fields, validation errors |
| Local UI state | `useState` in the component | open/closed, selected segment |
| Shared client state | A small store (Zustand) | cart before checkout, player state, feature flags |
| Session and secrets | SecureStore + one auth store/context | token, signed-in user id |
| Persistent preferences | Store with persistence | theme override, onboarding done |
| Animation state | Reanimated shared values | drag offset, scroll position |

Rules that follow:

- **Never copy server data into a client store.** It goes stale and you rebuild caching badly. Read it from Query; derive from it.
- **Derive, don't sync.** If a value can be computed from props, query data, or other state, compute it during render. `useEffect` that sets state from other state is a bug magnet.
- **Lift state only as far as needed.** Start local; move to a parent, then to a store, only when a second consumer appears.
- **Put deep-linkable state in the URL.** If reopening a link should restore it, it's a route param.

## Shared client state: Zustand

Use the existing library if the project has one (Redux Toolkit, Jotai, MobX); don't add a second. For a new project, Zustand is the default: small, no providers, selector-based re-renders.

```tsx
// src/features/cart/cart-store.ts
import { create } from "zustand";

type CartState = {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>()((set) => ({
  items: [],
  add: (item) => set((s) => ({ items: [...s.items, item] })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clear: () => set({ items: [] }),
}));
```

Select narrowly so components re-render only for what they use:

```tsx
const count = useCartStore((s) => s.items.length);       // good
const add = useCartStore((s) => s.add);                   // actions are stable
const { items } = useCartStore();                         // bad: re-renders on any change
```

For several values at once, use `useShallow` from `zustand/react/shallow`.

### Persistence

```tsx
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const usePrefsStore = create<Prefs>()(
  persist(
    (set) => ({ onboarded: false, setOnboarded: () => set({ onboarded: true }) }),
    { name: "prefs", storage: createJSONStorage(() => AsyncStorage) }
  )
);
```

- Gate UI that depends on persisted values on hydration (`usePrefsStore.persist.hasHydrated()` / `onFinishHydration`), and keep the splash screen up until then.
- `react-native-mmkv` is faster and synchronous but needs a dev build (not Expo Go).
- Never persist tokens this way. Tokens go in SecureStore.
- Version persisted state (`version` + `migrate`) once real users have it on device.

## React Context

Context is fine for low-frequency values (theme override, auth session, feature flags). Every consumer re-renders when the value changes, so don't put frequently changing data in it. Memoize the value object, and split contexts when consumers need different slices. Read with `React.use(MyContext)`.

## Forms

- Small forms: local state is fine.
- Real forms (validation, many fields, async submit): `react-hook-form` + `zod` via `@hookform/resolvers/zod`. Share the zod schema with API types where possible.
- Validate on blur or submit, not every keystroke. Show errors inline under the field, with `selectable` text.
- Drafts survive a failed submit (see `data-fetching.md`).

## Folder structure

Organize by feature. Routes stay thin and import from features.

```
app/                          routes only: layouts and screens that compose features
  _layout.tsx
  (tabs)/...
src/
  features/
    cart/
      cart-store.ts
      cart-api.ts             fetchers + query key factory
      use-cart-total.ts       hooks
      components/             components used only by this feature
      cart.test.ts
    auth/...
  components/                 shared primitives (Button, EmptyState), promoted per design-system.md
  theme/                      tokens
  lib/                        cross-cutting utilities: request(), formatting, storage wrappers
  types/                      truly shared types
```

- A route file reads params, calls feature hooks, and composes components. Business logic doesn't live in route files.
- Features may import from `components/`, `lib/`, `theme/`. Features importing from each other is a smell; move the shared piece down to `lib/` or `components/`.
- Colocate tests next to the code they test.
- If the project already has a structure, follow it.

## Errors

- Expo Router: export an `ErrorBoundary` from a route file to catch render errors for that route and below:

```tsx
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return <ErrorState message={error.message} onRetry={retry} />;
}
```

- Data errors are handled in the four-states UI, not boundaries.
- Report unexpected errors to a crash reporter (Sentry or similar) in production; don't swallow them with empty `catch` blocks.

## TypeScript

- `strict: true`. Type API responses at the boundary (zod parse for untrusted data).
- Use typed routes (Expo Router generates them) so `href` and params are checked.
- Avoid `any`; use `unknown` and narrow.
