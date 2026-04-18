import Papa from 'papaparse';

export type CsvRow = Record<string, string | undefined>;

export interface PermitRecord {
  raw: CsvRow;
  id: string;
  businessName: string;
  permitNumber: string;
  status: string;
  type: string;
  subtype: string;
  description: string;
  county: string;
  city: string;
  jurisdiction: string;
  state: string;
  lat: number | null;
  lng: number | null;
  issueDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  finalDate: Date | null;
  totalDuration: number | null;
  approvalDuration: number | null;
  constructionDuration: number | null;
  fees: number | null;
  jobValue: number | null;
  inspectionPassRate: number | null;
  inspectionPassed: boolean | null;
  propertyType: string;
  propertyTypeDetail: string;
  yearBuilt: number | null;
  lotSize: number | null;
  buildingArea: number | null;
}

export interface PermitFilters {
  search: string;
  status: string;
  county: string;
  type: string;
}

export interface DashboardMetric {
  label: string;
  value: string;
  detail: string;
}

export const parseCsvText = (text: string): Promise<CsvRow[]> =>
  new Promise((resolve, reject) => {
    Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => resolve(results.data),
      error: (error: Error) => reject(error),
    });
  });

export const loadRowsFromUrl = async (url: string): Promise<CsvRow[]> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load data from ${url}`);
  }

  return parseCsvText(await response.text());
};

export const loadRowsFromFile = async (file: File): Promise<CsvRow[]> =>
  parseCsvText(await file.text());

export const toPermitRecords = (rows: CsvRow[]): PermitRecord[] =>
  rows.map((row, index) => {
    const permitNumber = text(row, 'PERMIT_NUMBER');
    const id = text(row, 'ID') || permitNumber || `permit-${index + 1}`;
    return {
      raw: row,
      id,
      businessName: text(row, 'BIZ_NAME'),
      permitNumber,
      status: text(row, 'STATUS').toLowerCase() || 'unknown',
      type: text(row, 'TYPE') || 'Unspecified',
      subtype: text(row, 'SUBTYPE') || 'Unspecified',
      description: text(row, 'DESCRIPTION') || 'No description available',
      county: text(row, 'COUNTY') || 'Unknown county',
      city: text(row, 'CITY') || 'Unknown city',
      jurisdiction: text(row, 'JURISDICTION') || 'Unknown jurisdiction',
      state: text(row, 'STATE') || 'CA',
      lat: number(row, 'LAT'),
      lng: number(row, 'LONG'),
      issueDate: date(row, 'ISSUE_DATE'),
      startDate: date(row, 'START_DATE'),
      endDate: date(row, 'END_DATE'),
      finalDate: date(row, 'FINAL_DATE'),
      totalDuration: number(row, 'TOTAL_DURATION'),
      approvalDuration: number(row, 'APPROVAL_DURATION'),
      constructionDuration: number(row, 'CONSTRUCTION_DURATION'),
      fees: number(row, 'FEES'),
      jobValue: number(row, 'JOB_VALUE'),
      inspectionPassRate: number(row, 'INSPECTION_PASS_RATE'),
      inspectionPassed: boolean(row, 'INSPECTION_PASSED'),
      propertyType: text(row, 'PROPERTY_TYPE') || 'Unknown',
      propertyTypeDetail: text(row, 'PROPERTY_TYPE_DETAIL') || 'Unknown',
      yearBuilt: number(row, 'PROPERTY_YEAR_BUILT'),
      lotSize: number(row, 'PROPERTY_LOT_SIZE'),
      buildingArea: number(row, 'PROPERTY_BUILDING_AREA'),
    };
  });

export const text = (row: CsvRow, key: string): string => (row[key] ?? '').trim();

export const number = (row: CsvRow, key: string): number | null => {
  const value = text(row, key).replace(/[$,]/g, '');
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const boolean = (row: CsvRow, key: string): boolean | null => {
  const value = text(row, key).toLowerCase();
  if (!value) {
    return null;
  }

  if (['true', 't', 'yes', '1'].includes(value)) {
    return true;
  }

  if (['false', 'f', 'no', '0'].includes(value)) {
    return false;
  }

  return null;
};

export const date = (row: CsvRow, key: string): Date | null => {
  const value = text(row, key);
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatNumber = new Intl.NumberFormat('en-US');
export const formatCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
export const formatPercent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});

export const formatCompactNumber = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return formatNumber.format(value);
};

export const monthKey = (dateValue: Date): string =>
  `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}`;

export const monthLabel = (key: string): string => {
  const [year, month] = key.split('-').map(Number);
  const dateValue = new Date(year, month - 1, 1);
  return dateValue.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

export const average = (values: Array<number | null>): number | null => {
  const compact = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!compact.length) {
    return null;
  }
  return compact.reduce((sum, value) => sum + value, 0) / compact.length;
};

export const median = (values: Array<number | null>): number | null => {
  const compact = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (!compact.length) {
    return null;
  }
  const middle = Math.floor(compact.length / 2);
  return compact.length % 2 === 0 ? (compact[middle - 1] + compact[middle]) / 2 : compact[middle];
};

export const uniqueValues = (records: PermitRecord[], key: keyof PermitRecord): string[] =>
  Array.from(new Set(records.map((record) => String(record[key] ?? '').trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );

export const applyPermitFilters = (records: PermitRecord[], filters: PermitFilters): PermitRecord[] => {
  const query = filters.search.trim().toLowerCase();
  return records.filter((record) => {
    if (filters.status !== 'all' && record.status !== filters.status) {
      return false;
    }

    if (filters.county !== 'all' && record.county !== filters.county) {
      return false;
    }

    if (filters.type !== 'all' && record.type !== filters.type) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      record.businessName,
      record.permitNumber,
      record.description,
      record.city,
      record.county,
      record.jurisdiction,
      record.propertyTypeDetail,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
};

export const getStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'neutral' => {
  switch (status.toLowerCase()) {
    case 'final':
    case 'complete':
      return 'good';
    case 'inactive':
    case 'expired':
      return 'bad';
    case 'pending':
    case 'in review':
      return 'warn';
    default:
      return 'neutral';
  }
};

export const trendByMonth = (records: PermitRecord[]) => {
  const counts = new Map<string, number>();

  for (const record of records) {
    if (!record.issueDate) {
      continue;
    }
    const key = monthKey(record.issueDate);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, permits]) => ({
      month,
      label: monthLabel(month),
      permits,
    }));
};

export const statusBreakdown = (records: PermitRecord[]) => {
  const counts = new Map<string, number>();

  for (const record of records) {
    counts.set(record.status || 'unknown', (counts.get(record.status || 'unknown') ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([status, permits]) => ({ status, permits }));
};

export const typeBreakdown = (records: PermitRecord[]) => {
  const buckets = new Map<string, { permits: number; totalDuration: number }>();

  for (const record of records) {
    const bucket = buckets.get(record.type) ?? { permits: 0, totalDuration: 0 };
    bucket.permits += 1;
    bucket.totalDuration += record.totalDuration ?? 0;
    buckets.set(record.type, bucket);
  }

  return Array.from(buckets.entries())
    .map(([type, bucket]) => ({
      type,
      permits: bucket.permits,
      averageDuration: bucket.permits ? bucket.totalDuration / bucket.permits : 0,
    }))
    .sort((left, right) => right.permits - left.permits)
    .slice(0, 8);
};

export const countyPerformance = (records: PermitRecord[]) => {
  const buckets = new Map<string, { permits: number; totalDuration: number; passed: number; passRates: number[] }>();

  for (const record of records) {
    const bucket = buckets.get(record.county) ?? { permits: 0, totalDuration: 0, passed: 0, passRates: [] };
    bucket.permits += 1;
    bucket.totalDuration += record.totalDuration ?? 0;
    bucket.passRates.push(record.inspectionPassRate ?? NaN);
    if (record.inspectionPassed === true) {
      bucket.passed += 1;
    }
    buckets.set(record.county, bucket);
  }

  return Array.from(buckets.entries())
    .map(([county, bucket]) => {
      const passRates = bucket.passRates.filter((value) => Number.isFinite(value));
      return {
        county,
        permits: bucket.permits,
        averageDuration: bucket.permits ? bucket.totalDuration / bucket.permits : 0,
        passRate:
          passRates.length > 0 ? passRates.reduce((sum, value) => sum + value, 0) / passRates.length : bucket.permits ? bucket.passed / bucket.permits : 0,
      };
    })
    .sort((left, right) => right.permits - left.permits)
    .slice(0, 8);
};

export const buildMetrics = (records: PermitRecord[]): DashboardMetric[] => {
  const total = records.length;
  const averageDuration = average(records.map((record) => record.totalDuration));
  const medianDuration = median(records.map((record) => record.totalDuration));
  const passRate = average(records.map((record) => record.inspectionPassRate));
  const activeCounties = new Set(records.map((record) => record.county)).size;

  return [
    {
      label: 'Permits in view',
      value: formatNumber.format(total),
      detail: 'Filtered records currently loaded',
    },
    {
      label: 'Median duration',
      value: medianDuration == null ? 'n/a' : `${Math.round(medianDuration)} days`,
      detail: 'Issue to final for the current selection',
    },
    {
      label: 'Inspection pass rate',
      value: passRate == null ? 'n/a' : formatPercent.format(passRate),
      detail: 'Average reported pass rate across permits',
    },
    {
      label: 'Counties represented',
      value: formatNumber.format(activeCounties),
      detail: 'Geographies active in the filtered slice',
    },
  ];
};

export const topInsight = (records: PermitRecord[]): string => {
  if (!records.length) {
    return 'No permits match the current filters yet.';
  }

  const fastestCounty = countyPerformance(records)
    .filter((item) => item.permits >= 3)
    .sort((left, right) => left.averageDuration - right.averageDuration)[0];
  const strongestType = typeBreakdown(records)[0];
  const latestMonth = trendByMonth(records).slice(-1)[0];

  const fragments = [] as string[];
  if (fastestCounty) {
    fragments.push(`${fastestCounty.county} is moving fastest at about ${Math.round(fastestCounty.averageDuration)} days.`);
  }
  if (strongestType) {
    fragments.push(`${strongestType.type} leads the workload with ${formatNumber.format(strongestType.permits)} permits.`);
  }
  if (latestMonth) {
    fragments.push(`The latest month in view is ${latestMonth.label} with ${formatNumber.format(latestMonth.permits)} permits.`);
  }

  return fragments.join(' ');
};
