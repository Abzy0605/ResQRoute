import { useEffect, useState } from "react";
import useAuth from "../../context/useAuth";
import { API_BASE_URL } from "../../config";


const FEATURE_GROUPS = [
  {
    title: "Rain / precipitation",
    features: ["T1d", "T2d", "T3d", "T4d", "T5d", "T6d", "T7d", "T8d", "T9d", "T10d"],
  },
  {
    title: "Catchment / physical characteristics",
    features: [
      "Stream Order", "Drainage Area", "Catchment Relief", "Catchment Length",
      "Catchment Perimeter", "Sinuosity Index", "Form Factor", "Relief Ratio",
      "Elongation Ratio", "Circularity Ratio", "Drainage Density", "Basin Magnitude",
      "Channel Frequency", "Drainage Intensity", "Infiltration Number", "Ruggedness Number",
      "Annual Mean Temperature", "Annual Precipitation", "Precipitation of Wettest Month",
      "Precipitation Seasonality",
    ],
  },
  {
    title: "Population / vulnerability",
    features: ["Road Density", "Urban percentage", "Population Count", "Population Density"],
  },
];

const ML_FEATURES = FEATURE_GROUPS.flatMap((group) => group.features);
const OPERATIONAL_FIELDS = [
  { name: "disaster_severity", label: "Disaster severity (1–10)", min: 1, max: 10, step: "any" },
  { name: "hazard_distance_km", label: "Hazard proximity / distance (km)", min: 0, step: "any" },
  { name: "population_exposure", label: "Population exposure ratio (0–1)", min: 0, max: 1, step: "any" },
  { name: "road_accessibility", label: "Road accessibility ratio (0–1)", min: 0, max: 1, step: "any" },
  { name: "shelter_available_capacity", label: "Available shelter capacity", min: 0, step: "any" },
  { name: "shelter_required_capacity", label: "Required shelter capacity", min: 0, step: "any" },
];

const EMPTY_FORM = Object.fromEntries([
  ...ML_FEATURES,
  ...OPERATIONAL_FIELDS.map((field) => field.name),
].map((name) => [name, ""]));

const FACTORS = [
  ["ml_severe_flood_score", "AI severity", "35%"],
  ["disaster_severity", "Disaster severity", "20%"],
  ["hazard_proximity", "Hazard proximity", "15%"],
  ["population_exposure", "Population exposure", "10%"],
  ["road_accessibility", "Road accessibility", "10%"],
  ["shelter_availability", "Shelter availability", "10%"],
];

const isFiniteNumber = (value) => Number.isFinite(Number(value));

const validateForm = (form) => {
  for (const feature of ML_FEATURES) {
    if (!form[feature].trim() || !isFiniteNumber(form[feature])) {
      return `${feature} must be a finite number.`;
    }
  }

  for (const field of OPERATIONAL_FIELDS) {
    if (!form[field.name].trim() || !isFiniteNumber(form[field.name])) {
      return `${field.label} must be a finite number.`;
    }
  }

  const severity = Number(form.disaster_severity);
  if (severity < 1 || severity > 10) return "Disaster severity must be between 1 and 10.";
  if (Number(form.hazard_distance_km) < 0) return "Hazard distance must not be negative.";

  for (const field of ["population_exposure", "road_accessibility"]) {
    if (Number(form[field]) < 0 || Number(form[field]) > 1) {
      return `${field === "population_exposure" ? "Population exposure" : "Road accessibility"} must be between 0 and 1.`;
    }
  }

  if (Number(form.shelter_available_capacity) < 0) return "Available shelter capacity must not be negative.";
  if (Number(form.shelter_required_capacity) <= 0) return "Required shelter capacity must be greater than 0.";
  return null;
};

const formatScore = (value, digits = 2) => (
  Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "Not available"
);

const responseError = (status, body) => {
  if (status === 401) return "Please sign in again.";
  if (status === 403) return "You are not authorized to run an assessment.";
  if (status === 400) return body.message || "Please check the assessment inputs.";
  if (status === 502) return body.message || "The ML service is unavailable. Please try again later.";
  return "Risk assessment could not be completed. Please try again.";
};

function RiskAssessment() {
  const { token, currentUser } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedDisasterId, setSelectedDisasterId] = useState("");
  const [disasters, setDisasters] = useState([]);
  const [disastersLoading, setDisastersLoading] = useState(true);
  const [disastersError, setDisastersError] = useState("");
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (currentUser?.role !== "ADMIN") return undefined;
    const controller = new AbortController();

    const loadDisasters = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/disasters`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok) throw new Error("Available disasters could not be loaded.");
        const data = await response.json();
        if (!controller.signal.aborted) {
          setDisasters(Array.isArray(data) ? data : []);
          setDisastersError("");
        }
      } catch (requestError) {
        if (requestError.name !== "AbortError" && !controller.signal.aborted) {
          setDisasters([]);
          setDisastersError(requestError.message || "Available disasters could not be loaded.");
        }
      } finally {
        if (!controller.signal.aborted) setDisastersLoading(false);
      }
    };

    Promise.resolve().then(loadDisasters);
    return () => controller.abort();
  }, [currentUser?.role, token]);

  const updateForm = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const selectDisaster = (event) => {
    const disasterId = event.target.value;
    setSelectedDisasterId(disasterId);

    const disaster = disasters.find((item) => String(item.id) === disasterId);
    if (disaster?.severity !== undefined && disaster?.severity !== null) {
      setForm((current) => ({ ...current, disaster_severity: String(disaster.severity) }));
    }
  };

  const runAssessment = async (event) => {
    event.preventDefault();
    setError("");
    setAssessment(null);

    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = Object.fromEntries(
      Object.entries(form).map(([name, value]) => [name, Number(value)])
    );

    setRunning(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/risk/calculate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        // Use the safe fallback below when the backend response is malformed.
      }

      if (!response.ok) throw new Error(responseError(response.status, result));
      if (!Number.isFinite(Number(result.risk_score)) || !result.risk_level || !result.inputs?.ml) {
        throw new Error("The assessment service returned an unexpected response. Please try again.");
      }

      setAssessment(result);
    } catch (requestError) {
      setError(requestError.message || "Risk assessment could not be completed. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  if (currentUser?.role !== "ADMIN") return null;

  return (
    <section className="risk-assessment" aria-label="AI flood risk assessment">
      <div className="section-heading">
        <div><p className="eyebrow">AI-assisted analysis</p><h2>Flood risk assessment</h2></div>
      </div>
      <p className="risk-assessment-intro">Enter measured model and operational inputs to run the existing AI and risk-engine pipeline.</p>

      <form onSubmit={runAssessment}>
        <details className="risk-assessment-section" open>
          <summary>Disaster conditions and operational inputs</summary>
          <div className="risk-assessment-grid">
            <label>
              Disaster context (optional)
              <select value={selectedDisasterId} onChange={selectDisaster} disabled={disastersLoading || running}>
                <option value="">Use a manual disaster severity</option>
                {disasters.map((disaster) => <option key={disaster.id} value={disaster.id}>{disaster.type} · Severity {disaster.severity} · {disaster.status}</option>)}
              </select>
            </label>
            {OPERATIONAL_FIELDS.map((field) => (
              <label key={field.name}>
                {field.label}
                <input name={field.name} type="number" min={field.min} max={field.max} step={field.step} value={form[field.name]} onChange={updateForm} disabled={running} />
              </label>
            ))}
          </div>
          <p className="risk-assessment-note">The selected disaster only populates disaster severity; its ID is not part of the current risk API contract.</p>
        </details>

        {FEATURE_GROUPS.map((group) => (
          <details className="risk-assessment-section" key={group.title}>
            <summary>{group.title} <span>{group.features.length} required model inputs</span></summary>
            <div className="risk-assessment-grid">
              {group.features.map((feature) => (
                <label key={feature}>
                  {feature}
                  <input name={feature} type="number" inputMode="decimal" step="any" value={form[feature]} onChange={updateForm} disabled={running} />
                </label>
              ))}
            </div>
          </details>
        ))}

        <button className="risk-assessment-submit" type="submit" disabled={running}>
          {running ? "Running assessment..." : "Run AI Risk Assessment"}
        </button>
      </form>

      {disastersLoading && <p className="muted-text">Loading available disasters...</p>}
      {disastersError && <p className="auth-error" role="alert">{disastersError}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}

      {assessment && (
        <section className="risk-result" aria-label="Risk assessment result">
          <div className="risk-result-heading">
            <div><p className="eyebrow">Assessment result</p><h3>AI-assisted risk summary</h3></div>
            <strong className={`risk-level-badge ${String(assessment.risk_level).toLowerCase()}`}>{assessment.risk_level}</strong>
          </div>
          <div className="risk-score-grid">
            <div><span>AI Severity Score</span><strong>{formatScore(assessment.inputs.ml.severe_flood_score, 4)}</strong><small>Model output on a 0–1 scale</small></div>
            <div><span>Overall Risk Score</span><strong>{formatScore(assessment.risk_score)} / 100</strong><small>Weighted risk-engine result</small></div>
            <div><span>Risk Level</span><strong>{assessment.risk_level}</strong><small>{assessment.inputs.ml.classification || "Model classification unavailable"}</small></div>
          </div>
          <p className="risk-disclaimer">AI-assisted decision support. Scores are model outputs and should be interpreted alongside real-world observations and emergency-management judgment.</p>
          <div className="risk-factor-table-wrap">
            <table className="risk-factor-table">
              <thead><tr><th>Factor</th><th>Score</th><th>Weight</th><th>Explanation</th></tr></thead>
              <tbody>
                {FACTORS.map(([key, label, weight]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{formatScore(assessment.factor_scores?.[key])} / 100</td>
                    <td>{weight}</td>
                    <td>{assessment.explanation?.[key] || "Not available"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="risk-assessment-note">Final score is the weighted combination of the factors shown above. Current bands: LOW 0–30, MODERATE 31–60, HIGH 61–80, CRITICAL 81–100.</p>
        </section>
      )}
    </section>
  );
}

export default RiskAssessment;
