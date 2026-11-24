import type { RayfinContext } from '@microsoft/fabric-user-data-functions';
import type { AtlasSchema } from '../../../data/schema.js';
import { requireAtlasSynchronizer } from '../synchronizer-gate.js';
import { GraphOrchestrator } from './graph-orchestrator.js';
import {
  GraphError, safeGraphCall,
  type GraphStartInput, type GraphContinueInput, type GraphCancelInput, type GraphStatusInput,
  type GraphResponse,
} from './graph-protocol.js';

type Context = RayfinContext<AtlasSchema>;
async function authorized(ctx: Context): Promise<GraphOrchestrator> {
  try {
    await requireAtlasSynchronizer(ctx.getDataClient(), 'graph sync', 'Synchronization authorization failed.');
  } catch { throw new GraphError('NOT_AUTHORIZED'); }
  // SQL applocks protect only their transaction, not this GraphQL client's writes.
  // Do not adapt SqlTransactionBoundary into an ExternalSerializer.
  return new GraphOrchestrator(ctx.getDataClient());
}
export const graphStart = (ctx: Context, input: GraphStartInput): Promise<GraphResponse> =>
  safeGraphCall(async () => (await authorized(ctx)).start(input));
export const graphContinue = (ctx: Context, input: GraphContinueInput): Promise<GraphResponse> =>
  safeGraphCall(async () => (await authorized(ctx)).continue(input));
export const graphCancel = (ctx: Context, input: GraphCancelInput): Promise<GraphResponse> =>
  safeGraphCall(async () => (await authorized(ctx)).cancel(input));
export const graphStatus = (ctx: Context, input: GraphStatusInput): Promise<GraphResponse> =>
  safeGraphCall(() => new GraphOrchestrator(ctx.getDataClient()).status(input));
