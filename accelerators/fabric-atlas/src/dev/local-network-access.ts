// Dev-only Local Network Access (LNA) boundary for the Vite server. The Fabric
// portal embeds http://localhost in an iframe; Chromium then requires the
// private-network opt-in header and a preflight answer. Only the Fabric and
// Power BI portal origins (plus optional extras) get credentialed CORS headers.

const APPROVED_ORIGIN_PATTERNS: readonly RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*fabric\.microsoft\.com$/,
  /^https:\/\/([a-z0-9-]+\.)*powerbi\.com$/,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

/** Comma-separated extra origins from ATLAS_DEV_ALLOWED_ORIGINS. */
export function parseExtraOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean);
}

export function isApprovedDevOrigin(
  origin: string | undefined,
  extra: readonly string[] = [],
): boolean {
  if (!origin) return false;
  const normalized = origin.trim().toLowerCase();
  return (
    extra.includes(normalized) ||
    APPROVED_ORIGIN_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

interface DevRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface DevResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(): unknown;
}

const header = (req: DevRequest, name: string): string | undefined => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Applies the LNA boundary. Returns true when the request was answered
 * (preflight) and must not reach the next middleware.
 */
export function applyLocalNetworkAccess(
  req: DevRequest,
  res: DevResponse,
  extra: readonly string[] = [],
): boolean {
  const origin = header(req, "origin");
  const approved = isApprovedDevOrigin(origin, extra);
  // Top-level iframe navigations carry no Origin header and still need the opt-in.
  if (!origin || approved) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  const isPreflight =
    req.method === "OPTIONS" &&
    Boolean(header(req, "access-control-request-private-network"));
  if (!isPreflight) return false;
  if (!approved || !origin) {
    res.statusCode = 403;
    res.end();
    return true;
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    header(req, "access-control-request-headers") || "*",
  );
  res.statusCode = 204;
  res.end();
  return true;
}
