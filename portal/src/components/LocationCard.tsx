import { Link } from 'react-router-dom';
import type { LocationSummary } from '../api/types';
import { bucketOf } from '../lib/stageBuckets';
import { StagePill } from './StagePill';

export function LocationCard({ loc }: { loc: LocationSummary }) {
  const cityState = [loc.city, loc.state].filter(Boolean).join(', ');
  const cityStateZip = [cityState, loc.zip].filter(Boolean).join(' ');
  const isOpen = bucketOf(loc.lifecycleStage) === 'open';
  return (
    <Link to={`/locations/${loc.id}`} className="loc-card">
      <div className="loc-card-top">
        {loc.brand && <span className={'loc-brand' + (isOpen ? ' loc-brand--open' : '')}>{loc.brand.toUpperCase()}</span>}
        <StagePill stage={loc.lifecycleStage} />
      </div>

      <div className="loc-shopid-row">{loc.shopId ? `#${loc.shopId}` : '—'}</div>
      <div className="loc-card-title">{loc.shopName || 'Unnamed shop'}</div>

      {(loc.address || cityStateZip) && (
        <div className="loc-addr-block">
          {loc.address && <div>{loc.address}</div>}
          {cityStateZip && <div>{cityStateZip}</div>}
        </div>
      )}

      <div className="loc-divider" />

      <div className="loc-meta-grid">
        <div>
          <div className="loc-meta-label">Franchisee</div>
          <div className="loc-meta-value">{loc.franchiseeName || '—'}</div>
        </div>
        <div>
          <div className="loc-meta-label">GM</div>
          <div className="loc-meta-value">{loc.generalManager || '—'}</div>
        </div>
        <div>
          <div className="loc-meta-label">DM</div>
          <div className="loc-meta-value">{loc.districtManager || '—'}</div>
        </div>
      </div>
    </Link>
  );
}
