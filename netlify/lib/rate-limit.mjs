// Límite simple por persona, en memoria. En un entorno sin servidor cada instancia
// lleva su propia cuenta: frena abusos básicos junto con el campo trampa y los
// topes de tamaño, pero no es una defensa completa.
const hits = new Map();

export function isRateLimited(key, max, windowMs, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return recent.length > max;
}

export const clientIp = (request) =>
  request.headers.get('x-nf-client-connection-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'desconocida';
