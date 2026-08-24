/**
 * pg 9 will reinterpret `sslmode=require` with weaker libpq semantics. We want
 * full verification against Neon's publicly trusted certificate either way, so
 * normalise the URL up front — this also silences the deprecation warning.
 */
export function normalizeConnectionString(url: string): string {
  return url.replace(/([?&])sslmode=require\b/, "$1sslmode=verify-full");
}

export function sslOptionFor(url: string) {
  return url.includes("localhost") ? false : { rejectUnauthorized: true };
}
