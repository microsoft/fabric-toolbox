export const SYNCHRONIZER_AUTHORITY_ID =
  "6f3e0c48-a302-4e37-83c8-e6ef1829124b";

interface SynchronizerAuthorityRow {
  id: string;
  createdAt: Date;
}

/** Fluent-client surface needed for the synchronizer-only caller gate. */
export interface SynchronizerGuardData {
  SynchronizerAuthority: {
    findById: (id: string) => Promise<SynchronizerAuthorityRow | null>;
    create: (
      values: SynchronizerAuthorityRow,
    ) => Promise<SynchronizerAuthorityRow>;
  };
}

/**
 * Fails closed unless the caller can read or create the policy-protected
 * authority sentinel. Call it before any application-identity Fabric request.
 */
export async function requireAtlasSynchronizer(
  data: SynchronizerGuardData,
  operation: string,
  deniedMessage: string,
): Promise<void> {
  try {
    let authority = await data.SynchronizerAuthority.findById(
      SYNCHRONIZER_AUTHORITY_ID,
    );
    if (!authority) {
      try {
        authority = await data.SynchronizerAuthority.create({
          id: SYNCHRONIZER_AUTHORITY_ID,
          createdAt: new Date(),
        });
      } catch {
        authority = await data.SynchronizerAuthority.findById(
          SYNCHRONIZER_AUTHORITY_ID,
        );
      }
    }
    if (
      !authority ||
      authority.id.toLowerCase() !== SYNCHRONIZER_AUTHORITY_ID
    ) {
      throw new Error("authority unavailable");
    }
  } catch {
    console.warn(`[atlas] ${operation} authorization failed`);
    throw new Error(deniedMessage);
  }
}
