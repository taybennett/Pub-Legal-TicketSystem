import type { LifecycleStage } from '../api/types';

const CLASS_MAP: Record<LifecycleStage, string> = {
  'Prospect':           'pill--gray',
  'LOI':                'pill--yellow',
  'At Lease':           'pill--orange',
  'Lease Executed':     'pill--blue',
  'FA Signed':          'pill--purple',
  'Permitting':         'pill--lime',
  'Under Construction': 'pill--cyan',
  'Open':               'pill--green',
  'Operating':          'pill--green-soft',
  'Remodel':            'pill--cyan-soft',
  'Renewal Due':        'pill--yellow-soft',
  'Transferred':        'pill--gray',
  'Closed':             'pill--red',
};

export function StagePill({ stage }: { stage: LifecycleStage | null }) {
  if (!stage) return <span className="pill pill--gray">—</span>;
  return <span className={`pill ${CLASS_MAP[stage] ?? 'pill--gray'}`}>{stage}</span>;
}
