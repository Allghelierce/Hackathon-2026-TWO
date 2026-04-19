import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import L from 'leaflet';
import { CircleAlert, MapPinned, Sparkles, TrendingUp, Waves } from 'lucide-react';
import { CircleMarker, GeoJSON as GeoJSONLayer, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  applyPermitFilters,
  buildMetrics,
  countyPerformance,
  formatCurrency,
  formatNumber,
  getStatusTone,
  loadRowsFromUrl,
  parseExternalRecords,
  statusBreakdown,
  topInsight,
  toPermitRecords,
  trendByMonth,
  typeBreakdown,
  uniqueValues,
  type PermitFilters,
  type PermitRecord,
} from './lib/permits';

const DEFAULT_DATA_URL = '/data/solar-city-permits.csv';
const RECORDS_DATA_URL = '/data/records.csv';


const statusColors: Record<string, string> = {
  final: '#58d68d',
  inactive: '#ff7b7b',
  pending: '#f5c242',
  unknown: '#6b7280',
};

const viewTransition = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

function FitBounds({ points }: { points: PermitRecord[] }) {
  const map = useMap();

  useEffect(() => {
    const coordinates = points.filter((point) => point.lat != null && point.lng != null);
    if (!coordinates.length) {
      return;
    }

    const bounds = L.latLngBounds(coordinates.map((point) => [point.lat as number, point.lng as number]));
    map.fitBounds(bounds.pad(0.45), { animate: true });
  }, [map, points]);

  return null;
}

function statusLabel(status: string) {
  return status
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <motion.article className="metric-card glass-panel" variants={viewTransition}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </motion.article>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel chart-card">
      <div className="section-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="chart-shell">{children}</div>
    </section>
  );
}

function App() {
  const [records, setRecords] = useState<PermitRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PermitFilters>({
    search: '',
    status: 'all',
    county: 'all',
    type: 'all',
  });
  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null);
  const [estimInput, setEstimInput] = useState({ county: '', type: '' });

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const [permitRows, externalRows] = await Promise.all([
          loadRowsFromUrl(DEFAULT_DATA_URL),
          loadRowsFromUrl(RECORDS_DATA_URL).catch(() => []),
        ]);
        const mainRecords = toPermitRecords(permitRows);
        const externalRecords = parseExternalRecords(externalRows);
        if (!active) {
          return;
        }
        const allRecords = [...mainRecords, ...externalRecords];
        setRecords(allRecords);
        setError(null);
      } catch (failure) {
        if (!active) {
          return;
        }
        setError(failure instanceof Error ? failure.message : 'Unable to load the default permit data.');
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const [countiesGeoJson, setCountiesGeoJson] = useState<any>(null);
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json')
      .then(r => r.json())
      .then(setCountiesGeoJson)
      .catch(() => {});
  }, []);

  const filterOptions = useMemo(() => {
    return {
      statuses: uniqueValues(records, 'status'),
      counties: uniqueValues(records, 'county'),
      types: uniqueValues(records, 'type'),
    };
  }, [records]);

  const filteredRecords = useMemo(() => applyPermitFilters(records, filters), [filters, records]);

  useEffect(() => {
    if (!filteredRecords.length) {
      setSelectedPermitId(null);
      return;
    }

    if (!filteredRecords.some((record) => record.id === selectedPermitId)) {
      setSelectedPermitId(filteredRecords[0].id);
    }
  }, [filteredRecords, selectedPermitId]);

  const selectedPermit = useMemo(
    () => filteredRecords.find((record) => record.id === selectedPermitId) ?? null,
    [filteredRecords, selectedPermitId],
  );

  const metrics = useMemo(() => {
    const base = buildMetrics(filteredRecords);
    const activeCounty = filters.county !== 'all' ? filters.county : null;
    if (activeCounty) {
      base[0] = { ...base[0], label: `Permits in ${activeCounty}` };
    }
    return base;
  }, [filteredRecords, filters.county]);
  const trend = useMemo(() => trendByMonth(filteredRecords), [filteredRecords]);
  const statusData = useMemo(
    () => statusBreakdown(filteredRecords).map((entry) => ({
      ...entry,
      fill: statusColors[entry.status] ?? statusColors.unknown,
    })),
    [filteredRecords],
  );
  const typeData = useMemo(() => typeBreakdown(filteredRecords), [filteredRecords]);
  const countyData = useMemo(() => countyPerformance(filteredRecords), [filteredRecords]);
  const insight = useMemo(() => topInsight(filteredRecords), [filteredRecords]);

  const estimResult = useMemo(() => {
    let pool = records.filter(r => r.totalDuration !== null && (r.totalDuration as number) > 0 && Number.isFinite(r.totalDuration as number));
    if (estimInput.county) pool = pool.filter(r => r.county.toLowerCase() === estimInput.county.toLowerCase());
    if (estimInput.type) pool = pool.filter(r => r.type === estimInput.type);
    if (pool.length < 3) return null;
    const durations = pool.map(r => r.totalDuration as number).sort((a, b) => a - b);
    const n = durations.length;
    const median = n % 2 === 0 ? (durations[n / 2 - 1] + durations[n / 2]) / 2 : durations[Math.floor(n / 2)];
    const mean = durations.reduce((s, v) => s + v, 0) / n;
    const p25 = durations[Math.floor(n * 0.25)];
    const p75 = durations[Math.floor(n * 0.75)];
    const fast = pool.filter(r => (r.totalDuration as number) < 30).length;
    const moderate = pool.filter(r => (r.totalDuration as number) >= 30 && (r.totalDuration as number) < 90).length;
    const slow = pool.filter(r => (r.totalDuration as number) >= 90).length;
    return { count: n, median: Math.round(median), mean: Math.round(mean), p25: Math.round(p25), p75: Math.round(p75), fast, moderate, slow };
  }, [records, estimInput]);


  const coordinates = filteredRecords.filter((record) => record.lat != null && record.lng != null).slice(0, 1500);

  const countyFeature = useMemo(() => {
    const county = estimInput.county || (filters.county !== 'all' ? filters.county : '');
    if (!county || !countiesGeoJson) return null;
    const match = countiesGeoJson.features.find(
      (f: any) => f.properties?.NAME?.toUpperCase() === county.toUpperCase()
    );
    return match ?? null;
  }, [estimInput.county, filters.county, countiesGeoJson]);

  const kpiCopy = [
    {
      icon: <Sparkles size={18} />,
      title: 'Story',
      text: 'A stakeholder dashboard focused on solar permit velocity, compliance, and geographic patterns.',
    },
    {
      icon: <MapPinned size={18} />,
      title: 'Map',
      text: 'See where permits cluster, which counties accelerate, and where work stalls.',
    },
    {
      icon: <Waves size={18} />,
      title: 'Decision use',
      text: 'Filter by jurisdiction, project type, and status to spot operational bottlenecks fast.',
    },
  ];

  return (
    <div className="app-shell">
      <div className="background-orbit orbit-one" />
      <div className="background-orbit orbit-two" />
      <div className="background-grid" />

      <motion.header className="hero glass-panel" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="hero-copy">
          <div className="eyebrow">Solar permit intelligence</div>
          <h1>Solar City Permit Pulse</h1>
          <p className="hero-text">
            A geospatial BI dashboard in California for understanding where solar permits are moving quickly, where they are getting stuck,
            and how the citywide rollout is changing over time.
          </p>
        </div>

        <div className="hero-panel">
          <div className="hero-callout">
            <CircleAlert size={18} />
            <span>{insight}</span>
          </div>
          <div className="copy-grid">
            {kpiCopy.map((item) => (
              <div className="copy-card" key={item.title}>
                <div className="copy-icon">{item.icon}</div>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.header>

      <section className="controls-row glass-panel controls-row--top">
        <div className="filter-group filter-group--3">
          <label>
            County
            <input
              list="dashboard-county-options"
              placeholder="County"
              value={filters.county === 'all' ? '' : filters.county}
              onChange={(e) => setFilters((current) => ({ ...current, county: e.target.value || 'all' }))}
            />
            <datalist id="dashboard-county-options">
              {filterOptions.counties.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label>
            Status
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="all">All statuses</option>
              {filterOptions.statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project type
            <select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}>
              <option value="all">All types</option>
              {filterOptions.types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="controls-meta">
          <span>{formatNumber.format(filteredRecords.length)} permits in the current view</span>
          <span>{formatNumber.format(coordinates.length)} geocoded points on the map</span>
        </div>
      </section>

      <section className="dashboard-grid">
        <motion.section className="glass-panel map-panel" initial="hidden" animate="visible" variants={viewTransition} transition={{ duration: 0.35 }}>
          <div className="section-heading">
            <div>
              <h3>Geographic overview</h3>
              <p>Point intensity scales with total duration. Colors reflect current permit status.</p>
            </div>
            <div className="legend-row">
              {Object.entries(statusColors).map(([status, color]) => (
                <span key={status} className="legend-chip">
                  <span className="legend-dot" style={{ backgroundColor: color }} />
                  {statusLabel(status)}
                </span>
              ))}
            </div>
          </div>

          <div className="map-shell">
            <MapContainer
              center={[37.7, -121.9]}
              zoom={8}
              minZoom={6}
              maxBounds={[[32.5, -124.5], [42.1, -114.0]]}
              maxBoundsViscosity={1.0}
              scrollWheelZoom
              className="permit-map"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds points={coordinates} />
              {countyFeature && (
                <GeoJSONLayer
                  key={countyFeature.properties?.NAME}
                  data={countyFeature}
                  style={{ color: '#0a1f6e', fillOpacity: 0.08, weight: 3, dashArray: '6 4' }}
                />
              )}
              {coordinates.map((permit) => {
                const tone = getStatusTone(permit.status);
                const opacity = selectedPermit?.id === permit.id ? 0.95 : 0.7;
                const radius = Math.max(5, Math.min(permit.totalDuration ?? 18, 36) / 2);
                const color = statusColors[permit.status] ?? statusColors.unknown;
                const detail = `${permit.city}, ${permit.county}`;

                return (
                  <CircleMarker
                    key={permit.id}
                    center={[permit.lat as number, permit.lng as number]}
                    radius={radius}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: opacity,
                      weight: tone === 'good' ? 1.5 : 1,
                    }}
                    eventHandlers={{ click: () => setSelectedPermitId(permit.id) }}
                  >
                    <Popup>
                      <div className="popup-card">
                        <strong>{permit.permitNumber || permit.id}</strong>
                        <p>{permit.businessName || permit.description}</p>
                        <span>{detail}</span>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        </motion.section>

        <aside className="glass-panel detail-panel">
          <div className="section-heading compact">
            <div>
              <h3>Explore permit <span style={{ color: 'var(--accent)' }}>{selectedPermit ? (selectedPermit.permitNumber || selectedPermit.id) : formatNumber.format(filteredRecords.length)}</span></h3>
              <p>{selectedPermit ? 'Viewing selected permit details.' : 'Click any point on the map to drill into a permit.'}</p>
            </div>
          </div>
          {selectedPermit ? (
            <div className="selected-card">
              <div className={`status-pill ${getStatusTone(selectedPermit.status)}`}>
                {statusLabel(selectedPermit.status)}
              </div>
              <h4>{selectedPermit.permitNumber || selectedPermit.id}</h4>
              <p className="selected-title">{selectedPermit.description}</p>
              <dl className="detail-list">
                <div>
                  <dt>Location</dt>
                  <dd>
                    {selectedPermit.city}, {selectedPermit.county}
                  </dd>
                </div>
                <div>
                  <dt>Project type</dt>
                  <dd>
                    {selectedPermit.type} / {selectedPermit.subtype}
                  </dd>
                </div>
                <div>
                  <dt>Total duration</dt>
                  <dd>{selectedPermit.totalDuration == null ? 'n/a' : `${Math.round(selectedPermit.totalDuration)} days`}</dd>
                </div>
                <div>
                  <dt>Job value</dt>
                  <dd>{selectedPermit.jobValue == null ? 'n/a' : formatCurrency.format(selectedPermit.jobValue)}</dd>
                </div>
                <div>
                  <dt>Inspection pass rate</dt>
                  <dd>{selectedPermit.inspectionPassRate == null ? 'n/a' : `${Math.round(selectedPermit.inspectionPassRate * 100)}%`}</dd>
                </div>
                <div>
                  <dt>Property</dt>
                  <dd>{selectedPermit.propertyTypeDetail}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="empty-state">No permit selected.</div>
          )}
        </aside>
      </section>

      {error ? (
        <div className="glass-panel error-panel">
          <strong>Data load issue</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="metrics-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="chart-grid">
        <ChartCard title="Permit velocity" subtitle="Monthly issue-date trend for the current filters.">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#87f0ff" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="#87f0ff" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: '#c6d1ff', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#c6d1ff', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <RechartsTooltip
                contentStyle={{
                  background: 'rgba(6, 15, 31, 0.96)',
                  border: '1px solid rgba(132, 160, 255, 0.24)',
                  borderRadius: '16px',
                  color: '#f5f7ff',
                }}
              />
              <Area type="monotone" dataKey="permits" stroke="#87f0ff" strokeWidth={3} fill="url(#trendFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status mix" subtitle="How the filtered permits distribute across lifecycle states.">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statusData} dataKey="permits" nameKey="status" cx="50%" cy="50%" outerRadius={86} innerRadius={56} />
              <RechartsTooltip
                contentStyle={{
                  background: 'rgba(6, 15, 31, 0.96)',
                  border: '1px solid rgba(132, 160, 255, 0.24)',
                  borderRadius: '16px',
                  color: '#f5f7ff',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Permit type throughput" subtitle="Most common permit categories and their average cycle times.">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={typeData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <XAxis dataKey="type" tick={{ fill: '#c6d1ff', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={58} />
              <YAxis tick={{ fill: '#c6d1ff', fontSize: 12 }} axisLine={false} tickLine={false} />
              <RechartsTooltip
                contentStyle={{
                  background: 'rgba(6, 15, 31, 0.96)',
                  border: '1px solid rgba(132, 160, 255, 0.24)',
                  borderRadius: '16px',
                  color: '#f5f7ff',
                }}
              />
              <Bar dataKey="permits" fill="#87f0ff" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="chart-grid lower-grid">
        <ChartCard title="County benchmark" subtitle="Where the workload is concentrated and how quickly counties are moving.">
          <div className="county-list">
            {countyData.map((county) => (
              <div key={county.county} className="county-row">
                <div className="county-meta">
                  <strong>{county.county}</strong>
                  <span>{formatNumber.format(county.permits)} permits</span>
                </div>
                <div className="county-measure">
                  <span className="county-measure-label blue">Cycle time</span>
                  <div className="county-measure-line blue">
                    <div className="county-measure-fill" style={{ width: `${Math.min(100, county.averageDuration * 1.2)}%` }} />
                  </div>
                  <span className="county-measure-value">{Math.round(county.averageDuration)}d</span>
                </div>
                <div className="county-measure">
                  <span className="county-measure-label green">Pass rate</span>
                  <div className="county-measure-line green">
                    <div className="county-measure-fill" style={{ width: `${Math.min(100, county.passRate * 100)}%` }} />
                  </div>
                  <span className="county-measure-value">{Math.round(county.passRate * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

      </section>
      <section className="glass-panel prediction-section">
          <div className="section-heading">
            <div>
              <h3 className="pred-heading">
                <TrendingUp size={18} className="pred-heading-icon" />
                Approval Time Estimator
              </h3>
              <p>Historical permit data — filter by county and type to see how long approvals typically take.</p>
            </div>
            {estimResult && (
              <div className="pred-badge-row">
                <span className="pred-badge">{estimResult.count.toLocaleString()} permits</span>
                <span className="pred-badge">median {estimResult.median}d</span>
                <span className="pred-badge">avg {estimResult.mean}d</span>
              </div>
            )}
          </div>

          <div className="prediction-grid">
            <div className="pred-form">
              <label className="pred-label">
                County — optional
                <input
                  list="estim-county-options"
                  placeholder="All counties"
                  value={estimInput.county}
                  onChange={(e) => setEstimInput((p) => ({ ...p, county: e.target.value }))}
                />
                <datalist id="estim-county-options">
                  {filterOptions.counties.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>
              <label className="pred-label">
                Permit type — optional
                <select value={estimInput.type} onChange={(e) => setEstimInput((p) => ({ ...p, type: e.target.value }))}>
                  <option value="">All types</option>
                  {filterOptions.types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>

            <div className="pred-result">
              {estimResult ? (
                <>
                  <div className="pred-output">
                    <div className="pred-label-sm">Median approval duration</div>
                    <div
                      className="pred-days"
                      style={{
                        color: estimResult.median < 30 ? 'var(--good)' : estimResult.median < 90 ? 'var(--warn)' : 'var(--bad)',
                      }}
                    >
                      {estimResult.median}
                      <span className="pred-unit">days</span>
                    </div>
                    <div className="pred-range">Middle 50% range: {estimResult.p25}–{estimResult.p75} days</div>
                  </div>

                  <div className="pred-importance">
                    <div className="pred-label-sm pred-importance-heading">Speed breakdown</div>
                    {[
                      { label: 'Fast  (< 30 days)', count: estimResult.fast, color: 'var(--good)' },
                      { label: 'Moderate  (30–90 days)', count: estimResult.moderate, color: 'var(--warn)' },
                      { label: 'Slow  (> 90 days)', count: estimResult.slow, color: 'var(--bad)' },
                    ].map(({ label, count, color }) => (
                      <div key={label} className="imp-row">
                        <div className="imp-name">{label}</div>
                        <div className="imp-bar-bg">
                          <div className="imp-bar-fill" style={{ width: `${Math.round((count / estimResult.count) * 100)}%`, background: color }} />
                        </div>
                        <div className="imp-pct">{Math.round((count / estimResult.count) * 100)}%</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="pred-empty">Not enough data for this combination. Try broadening your filters.</div>
              )}
            </div>
          </div>
        </section>
    </div>
  );
}

export default App;
