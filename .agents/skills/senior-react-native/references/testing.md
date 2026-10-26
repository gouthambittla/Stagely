# Testing

## What to test, at which level

| Level | Tool | Test |
|---|---|---|
| Unit | Jest | Pure logic: formatters, reducers, store actions, validation schemas, query key factories |
| Component / integration | Jest + React Native Testing Library | A screen or component as the user sees it: renders the right state, responds to taps and input, calls the API layer correctly |
| End to end | Maestro | A handful of critical flows on a real build: sign in, core create/edit, purchase, onboarding |

Most value is in the middle layer. Keep E2E to the flows whose breakage would be an incident; they're slow and flakier.

Test behavior through what the user sees and does, not implementation details. Avoid broad snapshot tests: they break on every style change and catch little.

## Setup (Expo)

```bash
npx expo install jest-expo jest @types/jest --dev
npx expo install @testing-library/react-native --dev
```

```json
// package.json
{
  "scripts": { "test": "jest --watchAll" },
  "jest": {
    "preset": "jest-expo",
    "setupFilesAfterEnv": ["<rootDir>/jest.setup.ts"]
  }
}
```

`jest.setup.ts` is where global mocks go (Reanimated test setup, native modules without JS fallbacks, `expo-secure-store`). Depending on your RNTL version, you may also need to import its built-in matchers there (`@testing-library/react-native/extend-expect`).

Bare RN: use the `react-native` Jest preset instead of `jest-expo`.

## Component tests with RNTL

```tsx
import { render, screen, userEvent } from "@testing-library/react-native";

test("shows an error and recovers on retry", async () => {
  const user = userEvent.setup();
  mockFetchUser.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce(testUser);

  renderWithProviders(<UserProfile userId="1" />);

  expect(await screen.findByText(/network error/i)).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: /retry/i }));
  expect(await screen.findByText(testUser.name)).toBeOnTheScreen();
});
```

- Query by what the user perceives: `getByRole` (with `name`), `getByText`, `getByLabelText`. Use `testID` only when nothing user-visible identifies the element. Role queries also check that accessibility props are set.
- `findBy*` for anything that appears asynchronously; `queryBy*` to assert absence.
- `userEvent` (press, type) over `fireEvent`: it simulates the full press/typing sequence.
- Test the four states (loading, empty, error, content) and the failed-save-then-retry path. These are the cases that regress.

### Providers wrapper

```tsx
export function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
```

New `QueryClient` per test so caches don't leak; `retry: false` so error tests don't wait on backoff.

### Mocking the network

Mock at the API-module boundary, not `fetch` internals:

```tsx
jest.mock("@/features/users/users-api");
const mockFetchUser = jest.mocked(fetchUser);
```

For full request/response realism across many tests, MSW works in React Native with some polyfill setup; use it if the project already has it.

### Routing tests

Expo Router ships an in-memory router for tests:

```tsx
import { renderRouter, screen } from "expo-router/testing-library";

test("tapping a row opens the detail", async () => {
  renderRouter({
    index: () => <ItemList />,
    "i/[id]": () => <ItemDetail />,
  }, { initialUrl: "/" });

  await userEvent.setup().press(await screen.findByText("First item"));
  expect(screen).toHavePathname("/i/1");
});
```

### Stores and hooks

- Zustand: reset store state in `beforeEach` (`useStore.setState(initialState)`) so tests are independent.
- Hooks: `renderHook` from RNTL, wrapped in providers when needed.

## End to end with Maestro

Maestro drives a real build with YAML flows, no test IDs in code required (though `testID` helps for ambiguous elements).

```yaml
# .maestro/sign-in.yaml
appId: com.example.app
---
- launchApp:
    clearState: true
- tapOn: "Email"
- inputText: "test@example.com"
- tapOn: "Password"
- inputText: "test-password"
- tapOn: "Sign in"
- assertVisible: "Welcome"
```

```bash
maestro test .maestro/
```

- Run against a release-like build pointed at a test backend, with test accounts.
- Keep flows short and independent; each starts from `launchApp` with cleared state.
- Wait on visible outcomes (`assertVisible`, `extendedWaitUntil`) rather than fixed sleeps.
- Run in CI on EAS Workflows or Maestro Cloud for the critical flows.

## When fixing a bug

Write a failing test that reproduces it first, then fix. If it's not practically testable (gesture feel, native rendering), say so and describe the manual check instead.
