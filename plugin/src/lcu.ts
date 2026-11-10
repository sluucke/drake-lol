export const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface Lcu {
  get<T = unknown>(route: string): Promise<T>;
  post(route: string, body?: unknown): Promise<Response>;
  put(route: string, body?: unknown): Promise<Response>;
  patch(route: string, body?: unknown): Promise<Response>;
  delete(route: string, body?: unknown): Promise<Response>;
}

export function makeLcu(fetchImpl: FetchLike = fetch): Lcu {
  const send =
    (method: string) =>
    (route: string, body?: unknown): Promise<Response> =>
      fetchImpl(route, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }),
      });

  return {
    get: <T = unknown>(route: string): Promise<T> => fetchImpl(route).then((r) => r.json() as Promise<T>),
    post: send('POST'),
    put: send('PUT'),
    patch: send('PATCH'),
    delete: send('DELETE'),
  };
}
