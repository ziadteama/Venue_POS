export async function proxyToCoordinator(coordinatorLanHost, path, options = {}) {
  const url = `http://${coordinatorLanHost}:3456${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Coordinator proxy ${path} failed (${res.status}): ${text}`);
    err.statusCode = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}
