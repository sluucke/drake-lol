// The client API surface, in one place.
//
// Same-origin inside the client: no lockfile, no port, no password. Measured
// in the viability spike.
//
// This exists as its own module because it is a CONTRACT: every feature that
// takes an `lcu` calls methods on it, and each of those features is tested
// against a mock. A mock cannot notice that the real object is missing a
// method -- which is exactly how `patch` shipped absent while every test for
// champ select passed. See test/lcu.test.js.

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
