import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import L from 'leaflet';
import { CircleAlert, MapPinned, Sparkles, Upload, Waves } from 'lucide-react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
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
  formatCompactNumber,
  formatCurrency,
  formatNumber,
  getStatusTone,
  loadRowsFromFile,
  loadRowsFromUrl,
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
    map.fitBounds(bounds.pad(0.15), { animate: true });
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
  const [sourceName, setSourceName] = useState('Solar City permit extract');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PermitFilters>({
    search: '',
    status: 'all',
    county: 'all',
    type: 'all',
  });
  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const rows = await loadRowsFromUrl(DEFAULT_DATA_URL);
        const nextRecords = toPermitRecords(rows);
        if (!active) {
          return;
        }
        setRecords(nextRecords);
        setSelectedPermitId(nextRecords[0]?.id ?? null);
        setError(null);
      } catch (failure) {
        if (!active) {
          return;
        }
        setError(failure instanceof Error ? failure.message : 'Unable to load the default permit data.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
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
    () => filteredRecords.find((record) => record.id === selectedPermitId) ?? filteredRecords[0] ?? null,
    [filteredRecords, selectedPermitId],
  );

  const metrics = useMemo(() => buildMetrics(filteredRecords), [filteredRecords]);
  const trend = useMemo(() => trendByMonth(filteredRecords), [filteredRecords]);
  const statusData = useMemo(() => statusBreakdown(filteredRecords), [filteredRecords]);
  const typeData = useMemo(() => typeBreakdown(filteredRecords), [filteredRecords]);
  const countyData = useMemo(() => countyPerformance(filteredRecords), [filteredRecords]);
  const insight = useMemo(() => topInsight(filteredRecords), [filteredRecords]);

  const coordinates = filteredRecords.filter((record) => record.lat != null && record.lng != null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setLoading(true);
    setError(null);
    setSourceName(file.name);

    try {
      const rows = await loadRowsFromFile(file);
      const nextRecords = toPermitRecords(rows);
      setRecords(nextRecords);
      setSelectedPermitId(nextRecords[0]?.id ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to parse the uploaded CSV file.');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

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
            A geospatial BI dashboard for understanding where solar permits are moving quickly, where they are getting stuck,
            and how the citywide rollout is changing over time.
          </p>
          <div className="hero-actions">
            <label className="upload-button">
              <Upload size={16} />
              Upload CSV
              <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} />
            </label>
            <div className="source-pill">{sourceName}</div>
          </div>
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

      <section className="controls-row glass-panel">
        <div className="filter-group">
          <label>
            Search
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Permit, address, county, contractor..."
            />
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
            County
            <select value={filters.county} onChange={(event) => setFilters((current) => ({ ...current, county: event.target.value }))}>
              <option value="all">All counties</option>
              {filterOptions.counties.map((county) => (
                <option key={county} value={county}>
                  {county}
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
              <h3>Geospatial overview</h3>
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
            <MapContainer center={[37.7, -121.9]} zoom={8} scrollWheelZoom className="permit-map">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds points={coordinates} />
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
              <h3>Selected permit</h3>
              <p>Drill into one permit without leaving the dashboard.</p>
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
            <div className="empty-state">No permit matches the current filters.</div>
          )}
          <div className="mini-table">
            <div className="mini-table-header">
              <span>Top permits by duration</span>
              <span>{formatNumber.format(filteredRecords.length)} rows</span>
            </div>
            <div className="mini-table-body">
              {filteredRecords
                .slice()
                .sort((left, right) => (right.totalDuration ?? 0) - (left.totalDuration ?? 0))
                .slice(0, 5)
                .map((permit) => (
                  <button key={permit.id} className="table-row" onClick={() => setSelectedPermitId(permit.id)} type="button">
                    <span>
                      <strong>{permit.permitNumber || permit.id}</strong>
                      <small>
                        {permit.city}, {permit.county}
                      </small>
                    </span>
                    <span>{permit.totalDuration == null ? 'n/a' : `${Math.round(permit.totalDuration)}d`}</span>
                  </button>
                ))}
            </div>
          </div>
        </aside>
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
              <Pie data={statusData} dataKey="permits" nameKey="status" cx="50%" cy="50%" outerRadius={86} innerRadius={56}>
                {statusData.map((entry) => (
                  <Cell key={entry.status} fill={statusColors[entry.status] ?? statusColors.unknown} />
                ))}
              </Pie>
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
                <div className="county-bars">
                  <div className="county-bar duration" style={{ width: `${Math.min(100, county.averageDuration * 1.2)}%` }} />
                  <div className="county-bar passrate" style={{ width: `${Math.min(100, county.passRate * 100)}%` }} />
                </div>
                <div className="county-kpis">
                  <span>{Math.round(county.averageDuration)}d</span>
                  <span>{Math.round(county.passRate * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Project brief" subtitle="Why stakeholders will use this beyond a CSV review.">
          <div className="brief-grid">
            <div className="brief-card">
              <h4>Operational lens</h4>
              <p>Filter by geography, status, and permit type to see where backlog, velocity, and execution diverge.</p>
            </div>
            <div className="brief-card">
              <h4>Stakeholder-ready</h4>
              <p>A map-first interface with digestible KPIs and drilldown cards for executive review or field ops.</p>
            </div>
            <div className="brief-card">
              <h4>Data flexible</h4>
              <p>Upload alternate permit extracts without changing the app, which keeps the workflow useful for demos and future data drops.</p>
            </div>
          </div>
        </ChartCard>
      </section>
    </div>
  );
}

export default App;
