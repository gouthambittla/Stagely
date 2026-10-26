# Routing and Navigation (Expo Router)

## Route structure

- Routes live in `app/`. Never co-locate components, hooks, types, or utilities there.
- The app must always have a route matching `/` (it may sit inside a group like `(tabs)/index.tsx`).
- Every stack is defined in a `_layout.tsx` with `Stack` from `expo-router/stack`.
- Groups `(name)/` organize without adding a URL segment. Dynamic routes are `[id].tsx`; catch-all is `[...rest].tsx`.
- When moving or restructuring routes, delete the old files so stale routes don't linger.

### Standard layout: native tabs with a stack per tab

```
app/
  _layout.tsx            <NativeTabs />
  (index,search)/
    _layout.tsx          <Stack /> shared by both tabs
    index.tsx            main list
    search.tsx           search
    i/[id].tsx           detail screen, pushable from either tab
```

```tsx
// app/_layout.tsx
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { ThemeProvider, DarkTheme, DefaultTheme } from "expo-router/react-navigation";
import { useColorScheme } from "react-native";

export default function Layout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <NativeTabs>
        <NativeTabs.Trigger name="(index)">
          <NativeTabs.Trigger.Icon sf="list.dash" md="list" />
          <NativeTabs.Trigger.Label>Items</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(search)" role="search" />
      </NativeTabs>
    </ThemeProvider>
  );
}
```

```tsx
// app/(index,search)/_layout.tsx
import { Stack } from "expo-router/stack";
import { colors } from "@/theme/colors";

export default function Layout({ segment }: { segment: string }) {
  const screen = segment.match(/\((.*)\)/)?.[1]!;
  const titles: Record<string, string> = { index: "Items", search: "Search" };

  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerLargeStyle: { backgroundColor: "transparent" },
        headerTitleStyle: { color: colors.label },
        headerLargeTitleEnabled: true,
        headerBlurEffect: "none",
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name={screen} options={{ title: titles[screen] }} />
      <Stack.Screen name="i/[id]" options={{ headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
```

`headerLargeTitleEnabled` is the SDK 56+ name; older SDKs use `headerLargeTitle`.

Every tab icon needs an Android Material source (`md`) alongside the SF Symbol (`sf`).

## Imports

In SDK 56+, never import from `@react-navigation/*` directly. Use `expo-router/react-navigation` (covers `native`, `core`, `elements`, `routers`).

## Links

```tsx
import { Link } from "expo-router";

<Link href="/path" />

<Link href="/path" asChild>
  <Pressable>...</Pressable>
</Link>
```

On iOS, add previews and context menus to links that open content (cards, rows). They follow platform conventions at no cost:

```tsx
<Link href="/settings">
  <Link.Trigger>
    <Pressable><Card /></Pressable>
  </Link.Trigger>
  <Link.Preview />
  <Link.Menu>
    <Link.MenuAction title="Share" icon="square.and.arrow.up" onPress={handleShare} />
    <Link.MenuAction title="Block" icon="nosign" destructive onPress={handleBlock} />
    <Link.Menu title="More" icon="ellipsis">
      <Link.MenuAction title="Copy" icon="doc.on.doc" onPress={handleCopy} />
      <Link.MenuAction title="Delete" icon="trash" destructive onPress={handleDelete} />
    </Link.Menu>
  </Link.Menu>
</Link>
```

Never rebuild context menus or peek previews in JS.

## Titles and headers

- Set the title from the stack, never with a `<Text>` heading on the page:

```tsx
<Stack.Title>Home</Stack.Title>
// or
<Stack.Screen options={{ title: "Home" }} />
```

- Large collapsing titles come from `headerLargeTitleEnabled` (iOS), not a scroll worklet.
- For a scrollable stack screen, the ScrollView/FlatList is the first child, with `contentInsetAdjustmentBehavior="automatic"`.

## Search

Prefer `Stack.SearchBar` for a header search bar. The search must actually filter results, and the empty-results state should offer to clear or change the query.

## Modals and sheets

Present screens with the stack instead of building custom modal components.

```tsx
<Stack.Screen name="modal" options={{ presentation: "modal" }} />

<Stack.Screen
  name="sheet"
  options={{
    presentation: "formSheet",
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.5, 1.0],
    contentStyle: { backgroundColor: "transparent" }, // liquid glass on iOS 26+
  }}
/>
```

A `formSheet` is a real `UISheetPresentationController`: detents, grabber, interactive dismissal, and correct animation all come free. Use `@expo/ui` BottomSheet for a sheet that is part of a screen rather than its own route.

## Transitions

- Screen-to-screen motion uses native stack `animation` options. Never hand-roll it in JS.
- Tab switches don't slide.
- Under reduced motion, use `animation: 'fade'`.

## Hydration gate

When the initial route depends on persisted state (auth token, onboarding flag), the root layout renders nothing (or keeps the splash screen) until that state has loaded. Deciding on unhydrated state flashes the wrong screen on every cold start and misroutes deep links.
