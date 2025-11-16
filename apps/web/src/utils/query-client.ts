import {
  QueryCache,
  QueryClient,
  type UseMutationOptions,
  useMutation,
} from "@tanstack/react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      toast.error(message, {
        action: {
          label: "retry",
          onClick: () => {
            queryClient.invalidateQueries();
          },
        },
      });
    },
  }),
});

type CreateMutationOptions<TData = unknown> = {
  key: string;
  path: string;
  method?: "post" | "put" | "patch" | "delete";
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
};

type MutationVariables = {
  body?: Record<string, unknown>;
  form?: Record<string, File | string | number | boolean>;
  params?: Record<string, string>;
};

export function createMutation<
  TData = unknown,
  TVariables extends MutationVariables = MutationVariables,
>(
  options: CreateMutationOptions<TData> &
    Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn">
) {
  const {
    key,
    path,
    method = "post",
    onSuccess,
    onError,
    ...mutationOptions
  } = options;

  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const url = `${import.meta.env.VITE_SERVER_URL}/api/${key}/${path}`;

      let body: BodyInit | undefined;
      const headers: HeadersInit = {};

      if (variables.form) {
        const formData = new FormData();
        for (const [fieldKey, fieldValue] of Object.entries(variables.form)) {
          if (fieldValue instanceof File) {
            formData.append(fieldKey, fieldValue);
          } else {
            formData.append(fieldKey, String(fieldValue));
          }
        }
        body = formData;
      } else if (variables.body) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(variables.body);
      }

      const response = await fetch(url, {
        method: method.toUpperCase(),
        headers,
        body,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `Failed to ${method} ${key}`);
      }

      return response.json() as Promise<TData>;
    },
    onSuccess,
    onError,
    ...mutationOptions,
  });
}
