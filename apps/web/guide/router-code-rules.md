# React + TanStack Router Code Rules

These rules standardize how we use React and TanStack Router to keep code type-safe, predictable, and easy to refactor.

## 1. Router Setup & Type Safety

- **Single router instance**: Define one `createRouter` instance in `router.ts` and reuse it everywhere.
- **Register router types**: Always register the router for global type-safety:

  ```ts
  declare module "@tanstack/react-router" {
    interface Register {
      router: typeof router;
    }
  }
  ```

- **Use file-based routing**: Prefer generated `routeTree.gen.ts` over manual route trees unless you have a strong reason not to.
- **Root route**: Use `createRootRoute` or `createRootRouteWithContext` and define:
  - `component`
  - `notFoundComponent` for 404s (mandatory in our apps).

## 2. Route Definitions

- **One file, one route**: Each route lives in its own file under `src/routes`.
- **Export `Route` only**: Every route file must export a single `Route` constant created with `createFileRoute`.
- **Component placement**: Keep main route component defined in the same file and referenced via `component`, not inline JSX in the route config.
- **Parent-child typing** (for code-based routes): Always pass `getParentRoute` so children see parent types.

## 3. Data Loading & Caching

- **Use route `loader` for route data**:

  - Prefer loaders for data required to render the route.
  - Do not fetch route-critical data directly in components.

- **Use `Route.useLoaderData` or `getRouteApi`**:

  - Inside the route component: `const data = Route.useLoaderData()`.
  - In deep children: use `getRouteApi('/path').useLoaderData()` instead of importing the `Route` directly to avoid circular deps.

- **Model URL dependencies explicitly**:

  - Validate search params with `validateSearch`.
  - Derive loader dependencies via `loaderDeps` and read them from `loader` via `deps`.
  - Never read search params directly in `loader` – always go through `loaderDeps`.

- **Caching rules**:

  - Use `staleTime` for "how long is data fresh?".
  - Use `loaderDeps` for "what makes this result unique?".
  - Use `gcTime` and `shouldReload` to opt out of caching when needed.
  - If preload-only: combine `gcTime: 0` with `shouldReload: false` patterns as recommended in the guide.

- **External caches**:
  - If using TanStack Query or similar, prefer loaders that trigger cache priming and return `Promise<void>` to avoid huge inferred loader types.
  - Set `defaultPreloadStaleTime: 0` on the router when routing all events into an external cache.

## 4. Router Context & Dependency Injection

- **Use router context for cross-cutting services**:

  - Define the context type via `createRootRouteWithContext<Context>()`.
  - Provide the context in `createRouter({ context: { ... } })`.
  - Access in loader/component via `{ context }`.

- **Use `beforeLoad` for route-local context**:
  - Inject values that only children of a certain route need (e.g. scoped services).
  - Don’t overuse context for simple props; prefer props drilling where local.

## 5. Navigation & Links

- **Prefer `<Link>` over imperative navigation**:

  - Use `<Link>` for user-initiated navigation.
  - Use `useNavigate` or `Router.navigate` only in side-effects (form submissions, redirects, etc.).

- **Never interpolate into `to`**:

  - `to` is always a route path template, never a fully built URL string with params/search/hash.
  - Always use `params`, `search`, and `hash` props:

    ```tsx
    <Link
      to="/posts/$postId"
      params={{ postId }}
      search={{ page: 1 }}
      hash="comments"
    >
      Post
    </Link>
    ```

- **Use `Route.to` when possible**:

  - Prefer `to={Route.to}` to avoid hard-coded strings.
  - If you must use strings, keep them consistent with the route file path.

- **Relative navigation**:

  - Use `from={Route.fullPath}` (or equivalent) for relative routes; avoid bare `"."` / `".."` without `from` in complex trees.
  - Use `"."` to reload the current route and `".."` to go one parent up.

- **Search param updates**:

  - Use functional `search` to update incrementally:

    ```tsx
    <Link to="." search={(prev) => ({ ...prev, page: prev.page + 1 })} />
    ```

- **Optional parameters**:
  - Use `{-$param}` syntax and:
    - Inherit existing params with `params: {}`.
    - Remove params with `params={{ foo: undefined }}`.

## 6. Search Params & Type Safety

- **Every route with search must use `validateSearch`**:

  - Use a schema (e.g. Zod) or manual validation to parse.
  - Normalize types (e.g. `number`, booleans) at the edge.

- **Never consume untyped search**:

  - Access search via `Route.useSearch()` (or `getRouteApi().useSearch()`).
  - Do not use `useSearch` without validation on routes that expect typed values.

- **Keep search ≈ state**:
  - Only put URL-worthy state (filters, paging, view mode) into search params.
  - Avoid large objects or non-serializable values.

## 7. Hooks & Context Hints

- **Prefer route-local hooks**:

  - Inside a route’s main component, use route-scoped hooks: `Route.useParams`, `Route.useSearch`, `Route.useLoaderData`.

- **Use `from` when using global hooks**:

  - When using `useNavigate`, `useSearch`, `useParams` etc. directly:
    - Provide `from: Route.fullPath` wherever possible.
    - If the component is shared, consider `strict: false` and accept unioned types only when necessary.

- **Shared components**:
  - For shared components that depend on routing state:
    - Accept `from` (or a route API) from the parent, or
    - Use `strict: false` and handle unions carefully.

## 8. Render & Performance Optimizations

- **Use structural sharing-aware patterns**:

  - When using `Route.useSearch`, prefer fine-grained selectors:

    ```tsx
    const foo = Route.useSearch({ select: ({ foo }) => foo });
    ```

  - If returning objects from selectors, enable structural sharing (`structuralSharing: true`)
    and ensure the result is JSON-compatible.

- **Router-level structural sharing**:

  - For apps with heavy search usage, enable `defaultStructuralSharing: true` on the router, unless you rely on non-JSON types.

- **Avoid wide unions in navigation**:

  - Avoid bare `to="."` / `".."` with `search` and `params` if it implies “all routes”.
  - Narrow using `from` or a specific `to` so TS doesn’t have to widen over the entire route tree.

- **Avoid huge generic types in props**:
  - Don’t type props directly as `LinkProps` without narrowing.
  - Use `as const satisfies LinkProps<..., ..., '/some/route'>` when you need reusable nav configs.

## 9. Error, Pending, and Not-Found States

- **Per-route error and pending components**:

  - Prefer route-level `errorComponent` and `pendingComponent` over ad-hoc spinners and catch blocks.
  - Keep these components co-located with the route.

- **Global defaults**:

  - Configure `router.defaultErrorComponent` and global fallbacks, but override per-route when UX requires.

- **404 handling**:
  - Define `notFoundComponent` on the root route.
  - Avoid custom “fallback routes” that overlap with the router’s built-in not-found behavior.

## 10. SSR, Preloading & Code Splitting

- **Code-split route components**:

  - Use TanStack Router’s recommended patterns for lazy route components and `component.preload`.
  - When accessing route APIs from split bundles, use `getRouteApi` instead of importing `Route`.

- **Preload thoughtfully**:

  - Use link `preload="intent"` for high-value navigations only.
  - Configure `preloadDelay` to avoid eager preloads on quick hovers.
  - Set route-level `preload` or router `defaultPreload` intentionally—never enable globally without considering cost.

- **SSR alignment**:
  - Ensure loaders are written to work both on the server and client (no direct `window`/`document` usage without guards).
