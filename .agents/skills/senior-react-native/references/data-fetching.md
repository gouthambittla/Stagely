# Data Fetching

Prefer `fetch` (or `expo/fetch`) over axios. Use TanStack Query for anything cached, shared, or refetched.

## The four states

Every screen that loads data designs **loading**, **error**, **empty**, and **content**. They can overlap: a refresh error coexists with cached content.

- **Loading ≠ empty.** Empty means "resolved with zero items". Handle first load, failure, and hydration before checking list length. In TanStack Query v5, `isLoading` means the first fetch is running. A disabled or offline-paused query has no data without loading; show the prerequisite or offline state there.
- **Empty is designed.** Use `ListEmptyComponent`: explain why it's empty and offer the next action ("No items yet" → Create; "No results" → clear the search or filter).
- **Refetches keep stale content.** Render cached data even if a refresh fails, with a non-blocking error and retry. `isLoading` for first-load UI, `isFetching` for background activity. Skeletons for slow first loads with a known layout; `RefreshControl` for pull-to-refresh.
- **Gate on hydration** when initial UI depends on persisted state (see `routing.md`).

## Saves preserve work

While a mutation is pending, disable resubmission. On failure, keep the draft, show an inline error, allow retry; dismiss only on success. With optimistic updates, roll back or mark as unsynced on failure. Test by failing a save, then retrying.

## Fetch basics

```tsx
const fetchUser = async (userId: string, signal?: AbortSignal) => {
  const response = await fetch(`${API_URL}/users/${userId}`, { signal });
  if (!response.ok) throw new ApiError(`HTTP ${response.status}`, response.status);
  return response.json() as Promise<User>;
};
```

Always check `response.ok`; `fetch` doesn't reject on 4xx/5xx.

### Typed errors

```tsx
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Network error", 0, "NETWORK_ERROR");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.message || "Request failed", response.status, body.code);
  }
  return response.json();
}
```

Don't retry 4xx errors (except 408/429); they won't succeed on retry. Retry network errors and 5xx with exponential backoff, which TanStack Query does for you.

## TanStack Query

```tsx
// app/_layout.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: (count, error) =>
        error instanceof ApiError && error.status >= 400 && error.status < 500 ? false : count < 2,
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack />
    </QueryClientProvider>
  );
}
```

### Query with all four states

```tsx
function UserProfile({ userId }: { userId: string }) {
  const { data, fetchStatus, error, refetch } = useQuery({
    queryKey: ["user", userId],
    queryFn: ({ signal }) => fetchUser(userId, signal), // signal = automatic cancellation
  });

  if (data === undefined) {
    if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;
    if (fetchStatus === "paused") return <OfflineState />;
    return <Loading />;
  }

  return (
    <>
      {error && <InlineError message="Couldn't refresh. Showing saved data." onRetry={() => refetch()} />}
      {data === null ? <EmptyState message="User not found" /> : <Profile user={data} />}
    </>
  );
}
```

### Query keys

Keep keys in one factory per feature so invalidation is reliable:

```tsx
export const userKeys = {
  all: ["users"] as const,
  list: (filters: Filters) => [...userKeys.all, "list", filters] as const,
  detail: (id: string) => [...userKeys.all, "detail", id] as const,
};
```

### Mutations

```tsx
const mutation = useMutation({
  mutationFn: createUser,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
});

const handleSubmit = (data: UserData) => {
  if (mutation.isPending) return;
  mutation.mutate(data, { onSuccess: () => router.back() }); // dismiss only on success
};
// The form keeps its draft on error and disables Submit while pending.
```

### Refetch on focus and reconnect

React Native has no window focus. Wire both managers once at the root:

```tsx
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import { focusManager, onlineManager } from "@tanstack/react-query";

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected))
);

AppState.addEventListener("change", (status) => {
  if (process.env.EXPO_OS !== "web") focusManager.setFocused(status === "active");
});
```

For persistent offline cache, use `@tanstack/query-async-storage-persister` with `PersistQueryClientProvider`.

## Authentication

```tsx
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "auth_token";
export const auth = {
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  setToken: (t: string) => SecureStore.setItemAsync(TOKEN_KEY, t),
  removeToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};
```

Never store tokens in AsyncStorage.

**Refresh once, share the promise.** When several requests hit an expired token at once, they must await one refresh:

```tsx
let refreshPromise: Promise<string> | null = null;

export async function getValidToken(): Promise<string> {
  const token = await auth.getToken();
  if (token && !isTokenExpired(token)) return token;
  refreshPromise ??= refreshToken().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
```

On a 401 after refresh, clear the token and route to sign-in. Don't loop.

## Environment variables

- `EXPO_PUBLIC_*` variables are inlined into the client bundle at build time. Anyone can read them from the app.
- Never put secrets (write-access API keys, DB credentials) in `EXPO_PUBLIC_*`. Secrets belong on a server or in Expo Router API routes using unprefixed variables.
- Use `.env.development` / `.env.production`; restart the dev server after changes.
- Fail fast if a required variable is missing:

```tsx
const API_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_URL) throw new Error("EXPO_PUBLIC_API_URL is not defined");
```

## Cancellation

TanStack Query passes `signal` to `queryFn` and cancels on unmount or key change. Pass it to `fetch`. For manual fetches in effects, create an `AbortController` and abort in the cleanup.

## Choosing a tool

| Need | Use |
|---|---|
| One-off request, no caching | `fetch` + `request()` helper |
| Cached, shared, refetched server data | TanStack Query |
| Simple app already using SWR | Keep SWR |
| Route-level loaders on web (SDK 55+) | Expo Router `useLoaderData`; on native, TanStack Query |
| Realtime | Websocket/SSE updating the Query cache via `setQueryData` |
