import type {
  ClaimsDsl,
  FieldRef,
  PolicyExpression,
} from "@microsoft/rayfin-core";

const configuredSyncWriter =
  process.env.RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_SUBJECT ??
  process.env.VITE_RAYFIN_ATLAS_SYNC_ADMIN_SUBJECT ??
  "";
const configuredSyncWriterEmail =
  process.env.RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_EMAIL ??
  process.env.VITE_RAYFIN_ATLAS_SYNC_ADMIN_EMAIL ??
  "";
const configuredBreakGlassSyncWriter =
  process.env.RAYFIN_PUBLIC_ATLAS_BREAK_GLASS_SYNC_ADMIN_SUBJECT ??
  process.env.VITE_RAYFIN_ATLAS_BREAK_GLASS_SYNC_ADMIN_SUBJECT ??
  "";
const configuredBreakGlassSyncWriterEmail =
  process.env.RAYFIN_PUBLIC_ATLAS_BREAK_GLASS_SYNC_ADMIN_EMAIL ??
  process.env.VITE_RAYFIN_ATLAS_BREAK_GLASS_SYNC_ADMIN_EMAIL ??
  "";

export const SYNC_WRITER_SUBJECT = configuredSyncWriter.trim();
export const SYNC_WRITER_EMAIL =
  configuredSyncWriterEmail.trim().toLowerCase();
export const BREAK_GLASS_SYNC_WRITER_SUBJECT =
  configuredBreakGlassSyncWriter.trim();
export const BREAK_GLASS_SYNC_WRITER_EMAIL =
  configuredBreakGlassSyncWriterEmail.trim().toLowerCase();

if (!SYNC_WRITER_SUBJECT || !SYNC_WRITER_EMAIL) {
  throw new Error(
    "RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_SUBJECT and RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_EMAIL are required to compile Atlas snapshot policies.",
  );
}

if (
  Boolean(BREAK_GLASS_SYNC_WRITER_SUBJECT) !==
  Boolean(BREAK_GLASS_SYNC_WRITER_EMAIL)
) {
  throw new Error(
    "Break-glass synchronizer subject and email must be configured together.",
  );
}

export function syncWriterPolicy(
  claims: Pick<ClaimsDsl, "sub">,
): PolicyExpression {
  const primary = claims.sub.eq(SYNC_WRITER_SUBJECT);
  return BREAK_GLASS_SYNC_WRITER_SUBJECT
    ? primary.or(claims.sub.eq(BREAK_GLASS_SYNC_WRITER_SUBJECT))
    : primary;
}

export function syncWriterEmailPolicy(
  claims: Pick<ClaimsDsl, "sub" | "email">,
  writerEmail: FieldRef,
): PolicyExpression {
  return syncWriterPolicy(claims).and(claims.email.eq(writerEmail));
}
