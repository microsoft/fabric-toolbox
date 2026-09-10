const configuredSyncWriter =
  process.env.RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_SUBJECT ??
  process.env.VITE_RAYFIN_ATLAS_SYNC_ADMIN_SUBJECT ??
  "";
const configuredSyncWriterEmail =
  process.env.RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_EMAIL ??
  process.env.VITE_RAYFIN_ATLAS_SYNC_ADMIN_EMAIL ??
  "";

export const SYNC_WRITER_SUBJECT = configuredSyncWriter.trim();
export const SYNC_WRITER_EMAIL =
  configuredSyncWriterEmail.trim().toLowerCase();

if (!SYNC_WRITER_SUBJECT || !SYNC_WRITER_EMAIL) {
  throw new Error(
    "RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_SUBJECT and RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_EMAIL are required to compile Atlas snapshot policies.",
  );
}
