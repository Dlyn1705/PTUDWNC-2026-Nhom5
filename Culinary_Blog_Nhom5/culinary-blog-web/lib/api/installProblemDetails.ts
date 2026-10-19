import type { AxiosInstance } from "axios";
import { toApiProblemError } from "./problemDetails";

/** Install after session auth and HTTP logging so a raw 401 can refresh first. */
export function installProblemDetails(client: AxiosInstance): () => void {
  const interceptor = client.interceptors.response.use(
    (response) => response,
    (error: unknown) => Promise.reject(toApiProblemError(error)),
  );
  return () => client.interceptors.response.eject(interceptor);
}
