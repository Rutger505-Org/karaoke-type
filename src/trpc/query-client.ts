import { reportClientError } from "@/server/report-client-error";
import {
  defaultShouldDehydrateQuery,
  MutationCache,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        void reportClientError(
          "query",
          `Key: ${JSON.stringify(query.queryKey)}\nError: ${error.message}`,
        );
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, variables, _context, mutation) => {
        void reportClientError(
          "mutation",
          `Key: ${JSON.stringify(mutation.options.mutationKey)}\n` +
            `Variables: ${JSON.stringify(variables)}\nError: ${error.message}`,
        );
      },
    }),
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
