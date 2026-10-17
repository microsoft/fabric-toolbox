/**
 * Version of the Fabric Atlas Functions contract. Increment it whenever a
 * function input or output changes incompatibly so the frontend can detect a
 * mismatched Functions deployment.
 */
export const FUNCTIONS_CONTRACT_VERSION = 1;

export const FUNCTIONS_SERVICE_NAME = 'fabric-atlas';

/** Fixed-shape response returned by the `ping` function. */
export interface PingResult {
  status: 'ok';
  service: typeof FUNCTIONS_SERVICE_NAME;
  contractVersion: typeof FUNCTIONS_CONTRACT_VERSION;
}

export function createPingResult(): PingResult {
  return {
    status: 'ok',
    service: FUNCTIONS_SERVICE_NAME,
    contractVersion: FUNCTIONS_CONTRACT_VERSION,
  };
}
