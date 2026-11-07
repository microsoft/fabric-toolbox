import type { AccessReviewRow } from "./governance";
import type { Grant } from "./model";

const EVIDENCE_VERSION = 1;

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function canonicalPrincipal(row: AccessReviewRow): string {
  return row.principalId
    ? `principal:${normalize(row.principalId)}`
    : row.principalKey;
}

function canonicalGrant(row: AccessReviewRow, grant: Grant): string {
  const principal = row.principalId
    ? canonicalPrincipal(row)
    : `reference:${normalize(grant.principalRef) || "(blank)"}`;
  return [
    grant.itemFabricId
      ? `item:${normalize(grant.itemFabricId)}`
      : "workspace",
    principal,
    grant.accessLevel,
    grant.source,
    normalize(grant.roleName),
    grant.flag ?? "",
  ].join("\u0000");
}

export function serializeAccessReviewEvidence(row: AccessReviewRow): string {
  const grants = [
    ...new Set(row.applicableGrants.map((grant) => canonicalGrant(row, grant))),
  ].sort();
  const candidateIds = [
    ...new Set(
      row.principalCandidates.map((principal) =>
        normalize(principal.principalId),
      ),
    ),
  ].sort();

  return JSON.stringify({
    version: EVIDENCE_VERSION,
    itemFabricId: normalize(row.itemId),
    principal: canonicalPrincipal(row),
    principalResolution: row.principalResolution,
    principalCandidateIds: candidateIds,
    effectiveAccess: row.effectiveAccess,
    origin: row.origin,
    grants,
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function accessReviewEvidenceKey(
  row: AccessReviewRow,
): Promise<string> {
  return `v${EVIDENCE_VERSION}:sha256:${await sha256(
    serializeAccessReviewEvidence(row),
  )}`;
}

export async function accessReviewEvidenceKeys(
  rows: AccessReviewRow[],
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    rows.map(
      async (row) =>
        [row.id, await accessReviewEvidenceKey(row)] as const,
    ),
  );
  return new Map(entries);
}
