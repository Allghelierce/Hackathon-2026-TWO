# Solar City Permit Pulse

A geospatial BI dashboard for solar permitting intelligence. The app turns the raw permit export into a stakeholder-ready experience with a map, KPI tiles, trends, and drilldowns.

## What it does

- Loads the bundled `data/solar-city-permits.csv` into a map-first dashboard.
- Lets you filter by status, county, project type, and text search.
- Shows permit velocity, status mix, county performance, and selected permit details.
- Accepts uploaded CSV files so the app stays useful for future permit extracts.

## Run locally

```bash
npm install
npm run dev
```

The app will copy the CSV from `data/solar-city-permits.csv` into `public/data/solar-city-permits.csv` before starting.

## Build

```bash
npm run build
```

## Stack

- Vite + React + TypeScript
- Leaflet + react-leaflet for geospatial rendering
- Recharts for dashboard charts
- Papa Parse for CSV ingestion
- Framer Motion for motion and polish
- Fontsource for non-system typography
