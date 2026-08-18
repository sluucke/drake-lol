










export const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export function makeLcu(fetchImpl = fetch) {
  const send = (method) => (route, body) =>
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
    get: (route) => fetchImpl(route).then((r) => r.json()),
    post: send('POST'),
    put: send('PUT'),
    patch: send('PATCH'),
    delete: send('DELETE'),
  };
}
