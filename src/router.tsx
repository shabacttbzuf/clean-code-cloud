import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Reuse cached page data during in-app navigation instead of showing
        // a loading state and issuing the same request on every visit.
        staleTime: 60_000,
        gcTime: 15 * 60_000,
        retry: 1,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Load route code/data when a user intends to open a link, not after
    // the current page has already been left.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 60_000,
  });

  return router;
};
