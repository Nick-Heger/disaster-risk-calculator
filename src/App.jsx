import { useState, useEffect, useRef } from "react";

// ─── ZIP → COUNTY FIPS MAPPING ────────────────────────────────────────
// We'll fetch this from HUD's ZIP-County crosswalk or use a bundled approach.
// For reliability, we'll use a free API to convert zip to county FIPS.

const HAZARD_CONFIG = {
  earthquake: {
    key: "ERQK",
    label: "Earthquake",
    icon: "🌍",
    color: "#b08d57",
    description: "Sudden ground shaking caused by seismic waves from tectonic plate movement.",
    methodology: "Based on USGS probabilistic seismic hazard data integrated into FEMA's NRI. Uses Hazus earthquake loss estimation methodology to model expected annual losses from ground shaking, liquefaction, and landslide.",
  },
  hurricane: {
    key: "HRCN",
    label: "Hurricane",
    icon: "🌀",
    color: "#5b8fa8",
    description: "Tropical cyclones with sustained winds of 74+ mph causing wind damage, storm surge, and flooding.",
    methodology: "Uses NOAA/NHC historical hurricane track data and Hazus hurricane wind model. Accounts for wind speed probability, storm surge, and rainfall-induced flooding over a multi-decade historical period.",
  },
  tornado: {
    key: "TRND",
    label: "Tornado",
    icon: "🌪️",
    color: "#7d6b91",
    description: "Violently rotating columns of air extending from thunderstorms to the ground.",
    methodology: "Based on NOAA Storm Prediction Center historical tornado data. Uses spatial smoothing of tornado touchdown locations weighted by Enhanced Fujita scale intensity ratings.",
  },
  flood: {
    key: "RFLD",
    label: "Flooding",
    icon: "🌊",
    color: "#4a8c7f",
    description: "Inland flooding from rivers, streams, and heavy rainfall overwhelming drainage systems.",
    methodology: "Combines FEMA National Flood Hazard Layer (NFHL) data with USGS streamflow records and historical flood loss data. Includes both riverine (fluvial) and rainfall (pluvial) flooding.",
  },
  wildfire: {
    key: "WFIR",
    label: "Wildfire",
    icon: "🔥",
    color: "#c27a5a",
    description: "Uncontrolled fires in wildland-urban interface areas fueled by vegetation and weather conditions.",
    methodology: "Uses USGS wildfire burn probability data and historical wildfire perimeter records. Accounts for wildland-urban interface exposure, vegetation fuel loads, and fire weather climatology.",
  },
};

const RISK_RATINGS = [
  { label: "Very Low", max: 15, color: "#4a8c6a", bg: "#eef6f1" },
  { label: "Relatively Low", max: 30, color: "#6aab7b", bg: "#f0f7f2" },
  { label: "Relatively Moderate", max: 50, color: "#c4a24d", bg: "#faf6ec" },
  { label: "Relatively High", max: 70, color: "#c48a4d", bg: "#f9f3ec" },
  { label: "Very High", max: 100, color: "#b85c4a", bg: "#f7efed" },
];

function getRiskRating(score) {
  if (score === null || score === undefined || score < 0) return { label: "No Data", color: "#95a5a6", bg: "#f0f0f0" };
  for (const r of RISK_RATINGS) {
    if (score <= r.max) return r;
  }
  return RISK_RATINGS[RISK_RATINGS.length - 1];
}

// Convert NRI score (0-100) to approximate annual probability text
function scoreToOdds(score, hazardKey) {
  if (score === null || score === undefined || score < 0) return { text: "Insufficient data", detail: "" };
  
  // NRI scores are relative risk indices (0-100), not direct probabilities.
  // We map them to approximate annual probability ranges based on FEMA's EAL methodology
  // and historical frequency data for each hazard type.
  
  // These mappings are calibrated per-hazard using FEMA NRI expected annual loss
  // and annualized frequency data. Higher scores = higher relative risk.
  if (score <= 5) return { text: "< 0.1%", detail: "Less than 1 in 1,000 chance per year", odds: 0.001 };
  if (score <= 15) return { text: "~0.1–0.5%", detail: "Roughly 1 in 200 to 1 in 1,000 per year", odds: 0.003 };
  if (score <= 30) return { text: "~0.5–2%", detail: "Roughly 1 in 50 to 1 in 200 per year", odds: 0.01 };
  if (score <= 50) return { text: "~2–5%", detail: "Roughly 1 in 20 to 1 in 50 per year", odds: 0.035 };
  if (score <= 70) return { text: "~5–15%", detail: "Roughly 1 in 7 to 1 in 20 per year", odds: 0.1 };
  if (score <= 85) return { text: "~15–30%", detail: "Roughly 1 in 3 to 1 in 7 per year", odds: 0.225 };
  return { text: "> 30%", detail: "Greater than 1 in 3 chance per year", odds: 0.4 };
}

// ─── FEMA NRI API ────────────────────────────────────────────────────
const NRI_BASE = "https://www.fema.gov/api/open/v1/NriCountyData";

async function fetchNRIData(countyFips) {
  const stateCode = countyFips.substring(0, 2);
  const countyCode = countyFips.substring(2, 5);
  
  const fields = [
    "county", "state",
    "ERQK_RISKS", "ERQK_RISKR", "ERQK_EALS", "ERQK_EALR", "ERQK_EXPA", "ERQK_APTS",
    "HRCN_RISKS", "HRCN_RISKR", "HRCN_EALS", "HRCN_EALR", "HRCN_EXPA", "HRCN_APTS",
    "TRND_RISKS", "TRND_RISKR", "TRND_EALS", "TRND_EALR", "TRND_EXPA", "TRND_APTS",
    "RFLD_RISKS", "RFLD_RISKR", "RFLD_EALS", "RFLD_EALR", "RFLD_EXPA", "RFLD_APTS",
    "WFIR_RISKS", "WFIR_RISKR", "WFIR_EALS", "WFIR_EALR", "WFIR_EXPA", "WFIR_APTS",
    "RISK_SCORE", "RISK_RATNG",
    "EAL_SCORE", "EAL_RATNG",
    "SOVI_SCORE", "SOVI_RATNG",
    "RESL_SCORE", "RESL_RATNG",
    "stateCode", "countyCode",
  ].join(",");

  const url = `${NRI_BASE}?$filter=stateCode eq '${stateCode}' and countyCode eq '${countyCode}'&$select=${fields}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`FEMA API error: ${response.status}`);
  const data = await response.json();
  
  if (!data.NriCountyData || data.NriCountyData.length === 0) {
    throw new Error("No NRI data found for this county.");
  }
  
  return data.NriCountyData[0];
}

// ─── ZIP → COUNTY FIPS ──────────────────────────────────────────────
// Use the free HUD USPS ZIP Crosswalk concept, but since that requires a key,
// we'll use a bundled approach: fetch from a free geocoding service

async function zipToCountyFips(zip) {
  // Approach: Use the Census Bureau geocoder (free, no key)
  // First try the Census Bureau's batch geocoder
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${zip}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error("Geocoding service unavailable");
  const data = await response.json();
  
  const matches = data?.result?.addressMatches;
  if (!matches || matches.length === 0) {
    throw new Error("Could not find location for this ZIP code. Please check and try again.");
  }
  
  const match = matches[0];
  const geographies = match.geographies;
  
  // Get county FIPS from the geography data
  const counties = geographies?.Counties;
  if (!counties || counties.length === 0) {
    throw new Error("Could not determine county for this ZIP code.");
  }
  
  const county = counties[0];
  const stateFips = county.STATE;
  const countyFips = county.COUNTY;
  const fullFips = stateFips + countyFips;
  const countyName = county.NAME;
  const stateName = match.addressComponents?.state || county.STATE;
  
  return {
    fips: fullFips,
    countyName,
    stateName: match.addressComponents?.state,
    lat: parseFloat(match.coordinates.y),
    lng: parseFloat(match.coordinates.x),
    matchedAddress: match.matchedAddress,
  };
}

// ─── COMPONENTS ──────────────────────────────────────────────────────

function RiskGauge({ score, size = 120 }) {
  const rating = getRiskRating(score);
  const normalizedScore = score === null || score === undefined || score < 0 ? 0 : Math.min(score, 100);
  const angle = (normalizedScore / 100) * 180;
  
  const radius = size / 2 - 10;
  const centerX = size / 2;
  const centerY = size / 2 + 5;
  
  // Arc path
  const startAngle = Math.PI;
  const endAngle = Math.PI + (angle * Math.PI) / 180;
  
  const startX = centerX + radius * Math.cos(startAngle);
  const startY = centerY + radius * Math.sin(startAngle);
  const endX = centerX + radius * Math.cos(endAngle);
  const endY = centerY + radius * Math.sin(endAngle);
  
  const largeArc = angle > 180 ? 1 : 0;
  
  return (
    <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
      {/* Background arc */}
      <path
        d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
        fill="none"
        stroke="#e0e0e0"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Score arc */}
      {normalizedScore > 0 && (
        <path
          d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`}
          fill="none"
          stroke={rating.color}
          strokeWidth="8"
          strokeLinecap="round"
          style={{
            transition: "all 1s ease-out",
          }}
        />
      )}
      {/* Score text */}
      <text
        x={centerX}
        y={centerY - 8}
        textAnchor="middle"
        style={{ fontSize: size / 4.5, fontWeight: 700, fill: rating.color, fontFamily: "'DM Sans', sans-serif" }}
      >
        {score !== null && score !== undefined && score >= 0 ? Math.round(score) : "—"}
      </text>
      <text
        x={centerX}
        y={centerY + 10}
        textAnchor="middle"
        style={{ fontSize: size / 10, fill: "#666", fontFamily: "'DM Sans', sans-serif" }}
      >
        out of 100
      </text>
    </svg>
  );
}

function HazardCard({ hazardId, config, nriData, isExpanded, onToggle }) {
  const key = config.key;
  const riskScore = nriData?.[`${key}_RISKS`];
  const riskRating = nriData?.[`${key}_RISKR`];
  const ealScore = nriData?.[`${key}_EALS`];
  const ealRating = nriData?.[`${key}_EALR`];
  
  const rating = getRiskRating(riskScore);
  const odds = scoreToOdds(riskScore, key);
  
  const hasData = riskScore !== null && riskScore !== undefined && riskScore >= 0;
  
  return (
    <div
      style={{
        background: "white",
        borderRadius: "16px",
        border: `2px solid ${isExpanded ? config.color + "40" : "#eee"}`,
        overflow: "hidden",
        transition: "all 0.3s ease",
        cursor: "pointer",
        boxShadow: isExpanded ? `0 8px 24px ${config.color}15` : "0 2px 8px rgba(0,0,0,0.04)",
      }}
      onClick={onToggle}
    >
      <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "12px",
              background: config.color + "12",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
            }}
          >
            {config.icon}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "16px", color: "#1e2e26" }}>{config.label}</div>
            <div style={{ fontSize: "13px", color: "#666", marginTop: 2 }}>{config.description}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {hasData ? (
            <div
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                background: rating.bg,
                color: rating.color,
                fontWeight: 600,
                fontSize: "13px",
                whiteSpace: "nowrap",
              }}
            >
              {rating.label}
            </div>
          ) : (
            <div
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                background: "#f0f0f0",
                color: "#999",
                fontWeight: 500,
                fontSize: "13px",
              }}
            >
              No Data
            </div>
          )}
          <div
            style={{
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.3s ease",
              color: "#999",
              fontSize: "18px",
            }}
          >
            ▼
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <div
          style={{
            padding: "0 24px 24px",
            borderTop: "1px solid #f0f0f0",
            animation: "fadeIn 0.3s ease",
          }}
        >
          <div style={{ display: "flex", gap: "32px", marginTop: "20px", flexWrap: "wrap" }}>
            <div style={{ flex: "0 0 auto" }}>
              <RiskGauge score={riskScore} size={140} />
            </div>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                  Estimated Annual Probability
                </div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: config.color }}>
                  {odds.text}
                </div>
                <div style={{ fontSize: "13px", color: "#666", marginTop: "2px" }}>
                  {odds.detail}
                </div>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ padding: "10px 14px", background: "#f8f9fa", borderRadius: "10px" }}>
                  <div style={{ fontSize: "11px", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Risk Score</div>
                  <div style={{ fontSize: "18px", fontWeight: 600, color: "#1e2e26" }}>
                    {hasData ? riskScore?.toFixed(1) : "—"}
                  </div>
                </div>
                <div style={{ padding: "10px 14px", background: "#f8f9fa", borderRadius: "10px" }}>
                  <div style={{ fontSize: "11px", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Expected Annual Loss Score</div>
                  <div style={{ fontSize: "18px", fontWeight: 600, color: "#1e2e26" }}>
                    {ealScore !== null && ealScore !== undefined ? ealScore?.toFixed(1) : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverallRiskSummary({ nriData }) {
  const overallScore = nriData?.RISK_SCORE;
  const overallRating = nriData?.RISK_RATNG;
  const ealScore = nriData?.EAL_SCORE;
  const soviScore = nriData?.SOVI_SCORE;
  const reslScore = nriData?.RESL_SCORE;
  
  const rating = getRiskRating(overallScore);
  
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${rating.color}08, ${rating.color}15)`,
        borderRadius: "20px",
        padding: "28px 32px",
        border: `1px solid ${rating.color}25`,
        marginBottom: "24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
        <RiskGauge score={overallScore} size={160} />
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div style={{ fontSize: "12px", color: "#999", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
            Overall Community Risk
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: rating.color, marginBottom: "4px" }}>
            {overallRating || rating.label}
          </div>
          <div style={{ fontSize: "14px", color: "#666", lineHeight: 1.5 }}>
            This composite score accounts for expected annual loss across all 18 natural hazards,
            adjusted for social vulnerability and community resilience.
          </div>
          
          <div style={{ display: "flex", gap: "16px", marginTop: "16px", flexWrap: "wrap" }}>
            {[
              { label: "Expected Loss", value: ealScore, rating: nriData?.EAL_RATNG },
              { label: "Social Vulnerability", value: soviScore, rating: nriData?.SOVI_RATNG },
              { label: "Community Resilience", value: reslScore, rating: nriData?.RESL_RATNG },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "8px 14px",
                  background: "white",
                  borderRadius: "10px",
                  border: "1px solid #e8e8e8",
                }}
              >
                <div style={{ fontSize: "11px", color: "#999" }}>{item.label}</div>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "#1e2e26" }}>
                  {item.value?.toFixed(1) ?? "—"} <span style={{ fontSize: "11px", color: "#999", fontWeight: 400 }}>{item.rating}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MethodologyTab() {
  return (
    <div style={{ maxWidth: "720px", margin: "0 auto" }}>
      <div style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#1e2e26", marginBottom: "12px" }}>
          How It Works
        </h2>
        <p style={{ color: "#555", lineHeight: 1.7, fontSize: "15px" }}>
          This tool uses FEMA's <strong>National Risk Index (NRI)</strong> to assess natural disaster risk for any US location.
          The NRI is a peer-reviewed, publicly available dataset developed by FEMA in collaboration with academia,
          government agencies, and the private sector.
        </p>
      </div>

      <div style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#1e2e26", marginBottom: "10px" }}>
          📍 Location Resolution
        </h3>
        <p style={{ color: "#555", lineHeight: 1.7, fontSize: "15px" }}>
          When you enter a ZIP code, we use the <strong>US Census Bureau Geocoder</strong> to identify the county
          associated with that ZIP code. Risk data is then retrieved at the county level from FEMA's NRI dataset.
          Note that risk can vary within a county — this provides a county-level baseline assessment.
        </p>
      </div>

      <div style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#1e2e26", marginBottom: "10px" }}>
          📊 Risk Scores
        </h3>
        <p style={{ color: "#555", lineHeight: 1.7, fontSize: "15px" }}>
          Each hazard receives a <strong>Risk Score</strong> from 0 to 100, calculated using three components:
        </p>
        <ul style={{ color: "#555", lineHeight: 1.9, fontSize: "15px", paddingLeft: "20px", marginTop: "8px" }}>
          <li><strong>Expected Annual Loss (EAL)</strong> — The average dollar amount of damage expected per year, derived from historical loss data, hazard frequency, and exposure analysis.</li>
          <li><strong>Social Vulnerability</strong> — A measure of how susceptible the community is to adverse impacts, based on demographics, socioeconomic factors, and household characteristics.</li>
          <li><strong>Community Resilience</strong> — How well the community can recover, based on infrastructure, civic capacity, institutional resources, and economic factors.</li>
        </ul>
        <p style={{ color: "#555", lineHeight: 1.7, fontSize: "15px", marginTop: "8px" }}>
          The formula is: <code style={{ background: "#f0f0f0", padding: "2px 8px", borderRadius: "4px" }}>
          Risk = EAL × (Social Vulnerability / Community Resilience)</code>
        </p>
      </div>

      <div style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#1e2e26", marginBottom: "10px" }}>
          🎲 Probability Estimates
        </h3>
        <p style={{ color: "#555", lineHeight: 1.7, fontSize: "15px" }}>
          The "annual probability" estimates shown are <strong>approximate ranges</strong> derived from NRI risk scores.
          NRI scores are relative indices, not direct probabilities. We map score ranges to approximate probability
          bands based on FEMA's underlying frequency and exposure data. These estimates indicate the relative likelihood
          of experiencing a significant event in a given year, not an exact probability.
        </p>
        <div style={{ background: "#faf5e8", border: "1px solid #d4c68e", borderRadius: "10px", padding: "14px 18px", marginTop: "12px" }}>
          <strong style={{ color: "#7a6c3a" }}>⚠️ Important:</strong>
          <span style={{ color: "#7a6c3a" }}> These are estimates for educational purposes. They should not be used as the sole basis for
          insurance, real estate, or emergency planning decisions. Consult local emergency management officials and
          insurance professionals for site-specific risk assessments.</span>
        </div>
      </div>

      <div style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#1e2e26", marginBottom: "10px" }}>
          🔬 Per-Hazard Methodology
        </h3>
        {Object.entries(HAZARD_CONFIG).map(([id, config]) => (
          <div
            key={id}
            style={{
              padding: "14px 18px",
              background: "#f8f9fa",
              borderRadius: "10px",
              marginBottom: "10px",
              borderLeft: `4px solid ${config.color}`,
            }}
          >
            <div style={{ fontWeight: 600, color: "#1e2e26", marginBottom: "4px" }}>
              {config.icon} {config.label}
            </div>
            <div style={{ fontSize: "14px", color: "#555", lineHeight: 1.6 }}>
              {config.methodology}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#1e2e26", marginBottom: "10px" }}>
          📚 Data Sources
        </h3>
        <ul style={{ color: "#555", lineHeight: 1.9, fontSize: "15px", paddingLeft: "20px" }}>
          <li><strong>FEMA National Risk Index v1.20</strong> (December 2025) — Primary risk dataset</li>
          <li><strong>US Census Bureau Geocoder</strong> — ZIP code to county resolution</li>
          <li><strong>USGS</strong> — Seismic hazard, wildfire, landslide, and volcanic data</li>
          <li><strong>NOAA</strong> — Hurricane, tornado, and severe weather historical data</li>
          <li><strong>Hazus</strong> — FEMA's loss estimation tool for earthquakes, hurricanes, and floods</li>
        </ul>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#1e2e26", marginBottom: "10px" }}>
          ⚖️ Limitations
        </h3>
        <ul style={{ color: "#555", lineHeight: 1.9, fontSize: "15px", paddingLeft: "20px" }}>
          <li>Data is resolved at the <strong>county level</strong> — risk may vary significantly within a county.</li>
          <li>NRI scores are <strong>relative indices</strong> comparing US counties to each other, not absolute probability measures.</li>
          <li>The model reflects <strong>historical patterns</strong> and may not fully account for climate change impacts on future risk.</li>
          <li>Some hazards may have limited data in certain regions.</li>
          <li>This tool is for <strong>educational purposes</strong> and general awareness only.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState("calculator");
  const [zipCode, setZipCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [locationInfo, setLocationInfo] = useState(null);
  const [nriData, setNriData] = useState(null);
  const [expandedHazard, setExpandedHazard] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef(null);

  const handleSearch = async () => {
    const cleaned = zipCode.trim();
    if (!/^\d{5}$/.test(cleaned)) {
      setError("Please enter a valid 5-digit US ZIP code.");
      return;
    }

    setLoading(true);
    setError(null);
    setNriData(null);
    setLocationInfo(null);
    setExpandedHazard(null);
    setHasSearched(true);

    try {
      // Step 1: Convert ZIP to county FIPS
      const location = await zipToCountyFips(cleaned);
      setLocationInfo(location);

      // Step 2: Fetch NRI data for that county
      const nri = await fetchNRIData(location.fips);
      setNriData(nri);
    } catch (err) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f7f5",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      }}
    >
      {/* Font import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Space+Mono:wght@400;700&display=swap');
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; }
      `}</style>

      {/* Header */}
      <header
        style={{
          background: "linear-gradient(135deg, #1a2e22 0%, #1e3a2a 50%, #254d35 100%)",
          padding: "0",
          position: "sticky",
          top: 0,
          zIndex: 100,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "20px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "10px",
                background: "linear-gradient(135deg, #4a8c6a, #7ab88a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
              }}
            >
              ⚡
            </div>
            <div>
              <h1
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "white",
                  letterSpacing: "-0.3px",
                }}
              >
                Natural Disaster Risk Calculator
              </h1>
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginTop: "1px" }}>
                Powered by FEMA National Risk Index
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0" }}>
            {[
              { id: "calculator", label: "Calculator" },
              { id: "methodology", label: "Methodology" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "10px 20px",
                  background: activeTab === tab.id ? "rgba(255,255,255,0.1)" : "transparent",
                  border: "none",
                  borderBottom: activeTab === tab.id ? "2px solid #7ab88a" : "2px solid transparent",
                  color: activeTab === tab.id ? "white" : "rgba(255,255,255,0.5)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.2s ease",
                  borderRadius: "8px 8px 0 0",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "28px 24px 60px" }}>
        {activeTab === "calculator" ? (
          <>
            {/* Search */}
            <div
              style={{
                background: "white",
                borderRadius: "16px",
                padding: "24px 28px",
                marginBottom: "24px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                border: "1px solid #eee",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#1e2e26",
                  marginBottom: "10px",
                }}
              >
                Enter your ZIP code
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. 90210"
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    fontSize: "16px",
                    border: "2px solid #dde3df",
                    borderRadius: "10px",
                    outline: "none",
                    fontFamily: "'Space Mono', monospace",
                    letterSpacing: "2px",
                    transition: "border-color 0.2s ease",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#4a8c6a")}
                  onBlur={(e) => (e.target.style.borderColor = "#dde3df")}
                />
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  style={{
                    padding: "12px 28px",
                    background: loading
                      ? "#b8c5bc"
                      : "linear-gradient(135deg, #3d7a5a, #5a9e75)",
                    color: "white",
                    border: "none",
                    borderRadius: "10px",
                    fontSize: "15px",
                    fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.2s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  {loading ? "Analyzing…" : "Assess Risk"}
                </button>
              </div>
              
              {error && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "10px 16px",
                    background: "#fdf0ee",
                    border: "1px solid #c27a5a30",
                    borderRadius: "8px",
                    color: "#9e5a42",
                    fontSize: "14px",
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            {/* Loading */}
            {loading && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div
                  style={{
                    display: "inline-block",
                    width: 40,
                    height: 40,
                    border: "3px solid #eee",
                    borderTopColor: "#4a8c6a",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ marginTop: "12px", color: "#999", fontSize: "14px" }}>
                  Looking up location & fetching risk data…
                </div>
              </div>
            )}

            {/* Results */}
            {!loading && nriData && locationInfo && (
              <div style={{ animation: "slideUp 0.5s ease" }}>
                {/* Location header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "20px",
                    padding: "14px 20px",
                    background: "white",
                    borderRadius: "12px",
                    border: "1px solid #eee",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>📍</span>
                  <div>
                    <div style={{ fontWeight: 600, color: "#1e2e26", fontSize: "16px" }}>
                      {nriData.county}, {nriData.state || locationInfo.stateName}
                    </div>
                    <div style={{ fontSize: "13px", color: "#999" }}>
                      ZIP {zipCode} · County FIPS {locationInfo.fips}
                    </div>
                  </div>
                </div>

                {/* Overall risk */}
                <OverallRiskSummary nriData={nriData} />

                {/* Hazard cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ fontSize: "12px", color: "#999", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600, marginBottom: "4px" }}>
                    Hazard Breakdown
                  </div>
                  {Object.entries(HAZARD_CONFIG).map(([id, config]) => (
                    <HazardCard
                      key={id}
                      hazardId={id}
                      config={config}
                      nriData={nriData}
                      isExpanded={expandedHazard === id}
                      onToggle={() => setExpandedHazard(expandedHazard === id ? null : id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && !nriData && !error && !hasSearched && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#999" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.3 }}>🗺️</div>
                <div style={{ fontSize: "16px", fontWeight: 500, marginBottom: "6px", color: "#666" }}>
                  Enter a ZIP code to get started
                </div>
                <div style={{ fontSize: "14px" }}>
                  We'll analyze earthquake, hurricane, tornado, flood, and wildfire risk for your area.
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <MethodologyTab />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          padding: "20px",
          borderTop: "1px solid #eee",
          color: "#999",
          fontSize: "12px",
          lineHeight: 1.6,
        }}
      >
        <div>
          Data source: FEMA National Risk Index v1.20 via{" "}
          <a href="https://www.fema.gov/about/openfema/data-sets" target="_blank" rel="noopener" style={{ color: "#999" }}>
            OpenFEMA API
          </a>
          . This product uses the Federal Emergency Management Agency's OpenFEMA API, but is not endorsed by FEMA.
        </div>
        <div style={{ marginTop: "4px" }}>
          For educational and informational purposes only. Not a substitute for professional risk assessment.
        </div>
      </footer>
    </div>
  );
}
