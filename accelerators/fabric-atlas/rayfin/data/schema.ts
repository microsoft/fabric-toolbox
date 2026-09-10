import { Workspace } from './Workspace.js';
import { FabricItem } from './FabricItem.js';
import { LineageEdge } from './LineageEdge.js';
import { Principal } from './Principal.js';
import { AccessGrant } from './AccessGrant.js';
import { JobRun } from './JobRun.js';
import { ConfigEntry } from './ConfigEntry.js';
import { Comment } from './Comment.js';
import { SyncRun } from './SyncRun.js';
import { SavedView } from './SavedView.js';
import { AccessReview } from './AccessReview.js';
import { AccessReviewEvent } from './AccessReviewEvent.js';
import { FindingAck } from './FindingAck.js';
import { GovernancePolicy } from './GovernancePolicy.js';
import { GovernanceException } from './GovernanceException.js';

/**
 * Schema type map — enables full type-safety through RayfinClient
 * (`client.data.FabricItem.select()...`).
 */
export type AtlasSchema = {
  Workspace: Workspace;
  FabricItem: FabricItem;
  LineageEdge: LineageEdge;
  Principal: Principal;
  AccessGrant: AccessGrant;
  JobRun: JobRun;
  ConfigEntry: ConfigEntry;
  Comment: Comment;
  SyncRun: SyncRun;
  SavedView: SavedView;
  AccessReview: AccessReview;
  AccessReviewEvent: AccessReviewEvent;
  FindingAck: FindingAck;
  GovernancePolicy: GovernancePolicy;
  GovernanceException: GovernanceException;
};

export const schema = [
  Workspace,
  FabricItem,
  LineageEdge,
  Principal,
  AccessGrant,
  JobRun,
  ConfigEntry,
  Comment,
  SyncRun,
  SavedView,
  AccessReview,
  AccessReviewEvent,
  FindingAck,
  GovernancePolicy,
  GovernanceException,
];
