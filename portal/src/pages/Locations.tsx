import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { LocationCard } from '../components/LocationCard';
import { BUCKET_LABELS, bucketOf, type StageBucket } from '../lib/stageBuckets';
import type { LocationSummary } from '../api/types';

type FilterValue = 'all' | StageBucket;

export function Locations() {
  const [locs, setLocs] = useState<LocationSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState<FilterValue>('all');

  useEffect(() => {
    api.get<{ locations: LocationSummary[] }>('/locations')
      .then(r => setLocs(r.locations))
      .catch(e => setErr(e.message));
  }, []);

  const counts = useMemo(() => {
    const c = { pre: 0, permitting: 0, under: 0, open: 0, remodel: 0 };
    for (const l of locs ?? []) {
      const b = bucketOf(l.lifecycleStage);
      if (b) c[b]++;
    }
    return c;
  }, [locs]);

  const filtered = useMemo(() => {
    if (!locs) return null;
    const needle = q.trim().toLowerCase();
    return locs.filter(l => {
      if (bucket !== 'all' && bucketOf(l.lifecycleStage) !== bucket) return false;
      if (needle) {
        const hit =
          (l.shopName ?? '').toLowerCase().includes(needle) ||
          (l.city ?? '').toLowerCase().includes(needle) ||
          (l.shopId ?? '').toLowerCase().includes(needle) ||
          (l.franchiseeName ?? '').toLowerCase().includes(needle);
        if (!hit) return false;
      }
      return true;
    });
  }, [locs, q, bucket]);

  if (err) return <div className="state state--error">{err}</div>;
  if (!locs) return <div className="state state--loading">Loading your shops…</div>;
  if (locs.length === 0) {
    return (
      <div className="state state--empty">
        <p>No shops associated with your account yet.</p>
        <p>Contact your PUB Legal rep to get set up.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">My shops</h1>
        <input
          className="search-input"
          type="search"
          placeholder="Search by name, city, shop #, or franchisee"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className="filter-bar">
        <FilterButton label="All shops"  count={locs.length}  active={bucket === 'all'}   onClick={() => setBucket('all')} />
        <FilterButton label={BUCKET_LABELS.pre}        count={counts.pre}        active={bucket === 'pre'}        onClick={() => setBucket('pre')} />
        <FilterButton label={BUCKET_LABELS.permitting} count={counts.permitting} active={bucket === 'permitting'} onClick={() => setBucket('permitting')} />
        <FilterButton label={BUCKET_LABELS.under}      count={counts.under}      active={bucket === 'under'}      onClick={() => setBucket('under')} />
        <FilterButton label={BUCKET_LABELS.open}       count={counts.open}       active={bucket === 'open'}       onClick={() => setBucket('open')} />
        <FilterButton label={BUCKET_LABELS.remodel}    count={counts.remodel}    active={bucket === 'remodel'}    onClick={() => setBucket('remodel')} />
      </div>

      <div className="card-grid">
        {filtered!.map(loc => <LocationCard key={loc.id} loc={loc} />)}
      </div>
      {filtered!.length === 0 && (
        <div className="state state--empty">
          {q ? `No shops match "${q}".` : `No shops in ${BUCKET_LABELS[bucket as StageBucket] ?? 'this filter'}.`}
        </div>
      )}
    </div>
  );
}

function FilterButton(props: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={'filter-btn' + (props.active ? ' filter-btn--active' : '')}
      onClick={props.onClick}
    >
      {props.label}<span className="filter-btn-count">{props.count}</span>
    </button>
  );
}
