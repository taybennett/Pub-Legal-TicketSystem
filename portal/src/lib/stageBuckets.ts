import type { LifecycleStage } from '../api/types';

export type StageBucket = 'pre' | 'permitting' | 'under' | 'open' | 'remodel';

export const STAGE_BUCKETS: Record<StageBucket, LifecycleStage[]> = {
  pre:        ['Prospect', 'LOI', 'At Lease', 'Lease Executed', 'FA Signed'],
  permitting: ['Permitting'],
  under:      ['Under Construction'],
  open:       ['Open', 'Operating', 'Renewal Due'],
  remodel:    ['Remodel'],
};

export const BUCKET_LABELS: Record<StageBucket, string> = {
  pre:        'Pre-Construction',
  permitting: 'Permitting',
  under:      'Under Construction',
  open:       'Open',
  remodel:    'Remodel',
};

export function bucketOf(stage: LifecycleStage | null): StageBucket | null {
  if (!stage) return null;
  for (const key of Object.keys(STAGE_BUCKETS) as StageBucket[]) {
    if (STAGE_BUCKETS[key].includes(stage)) return key;
  }
  return null;
}
