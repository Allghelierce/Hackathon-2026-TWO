import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import L from 'leaflet';
import { CircleAlert, MapPinned, Sparkles, TrendingUp, Waves } from 'lucide-react';
import { featureImportances, predict, trainModel, type PredictionInput } from './lib/prediction';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
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

const PERMIT_TYPE_OPTIONS: Array<{ label: string; rawType: string }> = [
  { label: 'Solar Panels / PV', rawType: 'Solar panels' },
  { label: 'Building / Construction', rawType: 'Building' },
  { label: 'Electrical', rawType: 'Electrical' },
  { label: 'Mechanical / HVAC', rawType: 'Mechanical' },
  { label: 'Alternate Energy', rawType: 'Alternate energy' },
  { label: 'Photovoltaic', rawType: 'Photovoltaic' },
  { label: 'Multi-trade (MEP)', rawType: 'Mep' },
  { label: 'Miscellaneous', rawType: 'Miscellaneous' },
];

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
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PermitFilters>({
    search: '',
    status: 'all',
    county: 'all',
    type: 'all',
  });
  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null);
  const [predInput, setPredInput] = useState<PredictionInput>({
    county: '',
    type: '',
    propertyType: '',
    jobValue: null,
    fees: null,
  });
  const predInitialized = useRef(false);

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
        // load complete
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

  const model = useMemo(() => trainModel(records), [records]);
  const propertyTypes = useMemo(() => uniqueValues(records, 'propertyType'), [records]);
  const predResult = useMemo(() => {
    if (!model || !predInput.county || !predInput.type) return null;
    return predict(model, predInput);
  }, [model, predInput]);
  const importances = useMemo(() => (model ? featureImportances(model) : []), [model]);

  useEffect(() => {
    if (!predInitialized.current && filterOptions.counties.length) {
      predInitialized.current = true;
      setPredInput({
        county: filterOptions.counties[0] ?? '',
        type: PERMIT_TYPE_OPTIONS[0].rawType,
        propertyType: propertyTypes[0] ?? '',
        jobValue: null,
        fees: null,
      });
    }
  }, [filterOptions.counties, filterOptions.types, propertyTypes]);

  const coordinates = filteredRecords.filter((record) => record.lat != null && record.lng != null);

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
          <div className="county-legend">
            <span className="county-legend-item county-legend-duration">Avg duration (days)</span>
            <span className="county-legend-item county-legend-pass-rate">Inspection pass rate</span>
          </div>
          <div className="county-list">
            {countyData.map((county) => (
              <div key={county.county} className="county-row">
                <div className="county-meta">
                  <strong>{county.county}</strong>
                  <span>{formatNumber.format(county.permits)} permits</span>
                </div>
                <div className="county-bars">
                  <div className="county-bar-row">
                    <div className="county-bar duration" style={{ width: `${Math.min(100, county.averageDuration * 1.2)}%` }} />
                    <span className="county-bar-label">{Math.round(county.averageDuration)} days</span>
                  </div>
                  <div className="county-bar-row">
                    <div className="county-bar pass-rate" style={{ width: `${Math.min(100, county.passRate * 100)}%` }} />
                    <span className="county-bar-label">{Math.round(county.passRate * 100)}% pass</span>
                  </div>
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
      {model && (
        <section className="glass-panel prediction-section">
          <div className="section-heading">
            <div>
              <h3 className="pred-heading">
                <TrendingUp size={18} className="pred-heading-icon" />
                Approval Time Predictor
              </h3>
              <p>
                Linear regression trained on {model.trainingSamples.toLocaleString()} historical permits — select
                inputs to estimate total duration.
              </p>
            </div>
            <div className="pred-badge-row">
              <span className="pred-badge">R² {model.r2.toFixed(2)}</span>
              <span className="pred-badge">±{Math.round(model.rmse)} day RMSE</span>
              <span className="pred-badge">{model.trainingSamples.toLocaleString()} train samples</span>
            </div>
          </div>

          <div className="prediction-grid">
            <div className="pred-form">
              <label className="pred-label">
                County
                <select value={predInput.county} onChange={(e) => setPredInput((p) => ({ ...p, county: e.target.value }))}>
                  <option value="">Select county…</option>
                  {filterOptions.counties.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="pred-label">
                Permit type
                <select value={predInput.type} onChange={(e) => setPredInput((p) => ({ ...p, type: e.target.value }))}>
                  <option value="">Select type…</option>
                  {PERMIT_TYPE_OPTIONS.map(({ label, rawType }) => (
                    <option key={rawType} value={rawType}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="pred-label">
                Property type
                <select value={predInput.propertyType} onChange={(e) => setPredInput((p) => ({ ...p, propertyType: e.target.value }))}>
                  <option value="">Select property type…</option>
                  {propertyTypes.map((pt) => (
                    <option key={pt} value={pt}>{pt}</option>
                  ))}
                </select>
              </label>
              <label className="pred-label">
                Job value — optional
                <input
                  type="number"
                  placeholder="e.g. 25000"
                  value={predInput.jobValue ?? ''}
                  onChange={(e) => setPredInput((p) => ({ ...p, jobValue: e.target.value ? Number(e.target.value) : null }))}
                />
              </label>
              <label className="pred-label">
                Permit fees — optional
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={predInput.fees ?? ''}
                  onChange={(e) => setPredInput((p) => ({ ...p, fees: e.target.value ? Number(e.target.value) : null }))}
                />
              </label>
            </div>

            <div className="pred-result">
              {predResult ? (
                <>
                  <div className="pred-output">
                    <div className="pred-label-sm">Estimated approval duration</div>
                    <div
                      className="pred-days"
                      style={{
                        color:
                          predResult.predictedDays < 30
                            ? 'var(--good)'
                            : predResult.predictedDays < 60
                              ? 'var(--warn)'
                              : 'var(--bad)',
                      }}
                    >
                      {predResult.predictedDays}
                      <span className="pred-unit">days</span>
                    </div>
                    <div className="pred-range">
                      {predResult.lowerBound}–{predResult.upperBound} day confidence range
                    </div>
                  </div>

                  <div className="pred-importance">
                    <div className="pred-label-sm pred-importance-heading">Feature influence</div>
                    {importances.map((imp) => (
                      <div key={imp.name} className="imp-row">
                        <div className="imp-name">{imp.name}</div>
                        <div className="imp-bar-bg">
                          <div className="imp-bar-fill" style={{ width: `${Math.round(imp.pct * 100)}%` }} />
                        </div>
                        <div className="imp-pct">{Math.round(imp.pct * 100)}%</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="pred-empty">Select county and permit type to generate a prediction.</div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
