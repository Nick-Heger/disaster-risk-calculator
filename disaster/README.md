# Natural Disaster Risk Calculator

A web app that calculates the odds of natural disasters impacting a given US location, powered by FEMA's National Risk Index.

## Features

- **5 hazard types**: Earthquakes, Hurricanes, Tornadoes, Floods, Wildfires
- **ZIP code input**: Enter any US ZIP code for instant risk assessment
- **Real data**: Uses FEMA's National Risk Index (NRI) v1.20 via the free OpenFEMA API
- **Methodology tab**: Transparent explanation of data sources and calculations

## How It Works

1. User enters a 5-digit US ZIP code
2. The app geocodes the ZIP to a county using the US Census Bureau Geocoder (free, no API key)
3. County FIPS code is used to query FEMA's NRI dataset via OpenFEMA API (free, no API key)
4. Risk scores are displayed with approximate annual probability estimates

## Deploy to Netlify

### Option A: Drag & Drop
1. Run `npm install && npm run build`
2. Drag the `dist/` folder to [Netlify Drop](https://app.netlify.com/drop)

### Option B: Git Deploy
1. Push this repo to GitHub
2. Connect it to Netlify
3. Build settings are auto-configured via `netlify.toml`

### Option C: Netlify CLI
```bash
npm install -g netlify-cli
npm install
npm run build
netlify deploy --prod --dir=dist
```

## Tech Stack

- React 18 + Vite
- No CSS framework (custom inline styles)
- Free APIs: US Census Bureau Geocoder + OpenFEMA

## Data Sources

- **FEMA National Risk Index v1.20** (December 2025)
- **US Census Bureau Geocoder** (ZIP → county resolution)
- **USGS** (seismic, wildfire, volcanic data)
- **NOAA** (hurricane, tornado, severe weather data)

## Disclaimer

This tool is for educational and informational purposes only. It is not endorsed by FEMA. Risk data is at the county level and may not reflect site-specific conditions. Not a substitute for professional risk assessment.
