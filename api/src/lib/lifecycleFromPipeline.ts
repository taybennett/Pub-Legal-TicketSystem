import type { LifecycleStage } from '../airtable/tables.js';

/**
 * Map PUB Development Pipeline's Development Status onto a Lifecycle
 * Stage value the franchisee portal can use. Pipeline is the source of
 * truth for construction-side state — Lynn's team owns it, Taylor's
 * legal team should not have to maintain a parallel field.
 *
 * Returns null when there is no confident mapping (e.g. Hold, Remodel),
 * so callers fall back to the stored Locations.LIFECYCLE_STAGE value.
 */
export function lifecycleStageFromPipelineStatus(status: string | null | undefined): LifecycleStage | null {
  if (!status) return null;
  switch (status) {
    case 'Test Fit':     return 'FA Signed';          // pre-construction bucket
    case 'CD Set':       return 'Lease Executed';     // pre-construction bucket
    case 'Permitting':   return 'Permitting';         // dedicated bucket
    case 'Construction': return 'Under Construction';
    case 'Open':         return 'Operating';
    case 'Dead':         return 'Closed';
    case 'Remodel':      return 'Remodel';            // dedicated bucket — operating but under remodel
    case 'Hold':         return null;                 // ambiguous — fall back to stored
    default:             return null;                 // unknown status — fall back
  }
}
