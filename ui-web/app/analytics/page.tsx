"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getDevices, Device } from "@/lib/deviceApi";
import {
  runAnalytics,
  runFleetAnalytics,
  getAnalyticsStatus,
  getFormattedResults,
  getSupportedModels,
  AnomalyFormattedResult,
  FailureFormattedResult,
  FleetFormattedResult,
} from "@/lib/analyticsApi";

type Screen = "wizard" | "anomaly" | "failure" | "fleet";
type AnalysisType = "anomaly" | "failure_prediction";
type Preset = "quick" | "recommended" | "deep" | "custom";
type ResultType = AnomalyFormattedResult | FailureFormattedResult | FleetFormattedResult;

const COLORS = {
  bg: "#070b14",
  panel: "#0c1220",
  panelBorder: "rgba(147, 156, 184, 0.18)",
  text: "#eef4ff",
  muted: "rgba(210, 220, 240, 0.62)",
  accent: "#6366f1",
  good: "#22c55e",
  warn: "#f59e0b",
  bad: "#ef4444",
};

const PRESET_LABELS: Record<Preset, string> = {
  quick: "Last 24 Hours",
  recommended: "Last 7 Days",
  deep: "Last 30 Days",
  custom: "Custom",
};

function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPresetRange(preset: Preset): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (preset === "quick") start.setDate(end.getDate() - 1);
  else if (preset === "recommended") start.setDate(end.getDate() - 7);
  else if (preset === "deep") start.setDate(end.getDate() - 30);
  return { start: formatYmd(start), end: formatYmd(end) };
}

function formatDaysAnalysed(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return "0 minutes";
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const wholeDays = Math.max(1, Math.round(days));
  return `${wholeDays} day${wholeDays === 1 ? "" : "s"}`;
}

function badgeColor(level: string): string {
  if (level === "Very High") return "#4f46e5";
  if (level === "High") return "#22c55e";
  if (level === "Moderate") return "#f59e0b";
  return "#ef4444";
}

function StepDots({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ width: 34, height: 34, borderRadius: 17, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "white", background: step === i ? COLORS.accent : step > i ? COLORS.good : "rgba(255,255,255,0.1)" }}>
          {step > i ? "✓" : i}
        </div>
      ))}
    </div>
  );
}

function AnalyticsPageContent() {
  const search = useSearchParams();
  const [screen, setScreen] = useState<Screen>("wizard");
  const [step, setStep] = useState(1);

  const [devices, setDevices] = useState<Device[]>([]);
  const [models, setModels] = useState<{ anomaly_detection: string[]; failure_prediction: string[]; forecasting: string[] } | null>(null);

  const [selectedDevice, setSelectedDevice] = useState("all");
  const [preset, setPreset] = useState<Preset>("recommended");
  const [dateRange, setDateRange] = useState(getPresetRange("recommended"));
  const [analysisType, setAnalysisType] = useState<AnalysisType | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("Preparing analysis...");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultType | null>(null);
  const [anomalyPage, setAnomalyPage] = useState(1);

  useEffect(() => {
    Promise.all([getDevices(), getSupportedModels()])
      .then(([devs, mods]) => {
        setDevices(devs);
        setModels(mods);
        const qd = search.get("device");
        if (qd && devs.some((d) => d.id === qd)) setSelectedDevice(qd);
      })
      .catch((e: any) => setError(e?.message ?? "Failed to load initial data"));
  }, [search]);

  const runDays = useMemo(() => {
    const start = new Date(dateRange.start).getTime();
    const end = new Date(dateRange.end).getTime();
    return Math.max(1, Math.round((end - start) / 86400000));
  }, [dateRange]);

  useEffect(() => {
    if (step !== 4) return;
    const sequence: Array<[number, number, string]> = [
      [300, 12, "Loading telemetry from dataset storage..."],
      [1200, 35, "Engineering features across parameters..."],
      [2300, 58, "Training ML model..."],
      [3300, 78, "Running inference and scoring..."],
      [4300, 90, "Formatting premium dashboard payload..."],
    ];
    const timers = sequence.map(([ms, pct, msg]) =>
      setTimeout(() => {
        setProgress((p) => (p < pct ? pct : p));
        setProgressMsg(msg);
      }, ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [step]);

  useEffect(() => {
    if (!jobId) return;
    const t = setInterval(async () => {
      try {
        const s = await getAnalyticsStatus(jobId);
        if (typeof s.progress === "number") {
          setProgress((p) => (s.progress > p ? s.progress : p));
        }
        if (s.message) setProgressMsg(s.message);

        if (s.status === "completed") {
          clearInterval(t);
          setProgress(100);
          const r = await getFormattedResults(jobId);
          setResult(r);
          setAnomalyPage(1);
          setStep(5);
        }
        if (s.status === "failed") {
          clearInterval(t);
          setError(s.message || "Analysis failed");
          setStep(3);
        }
      } catch (e: any) {
        clearInterval(t);
        setError(e?.message ?? "Status polling failed");
        setStep(3);
      }
    }, 2000);
    return () => clearInterval(t);
  }, [jobId]);

  const submit = useCallback(async () => {
    if (!analysisType || !models) return;

    setError(null);
    setProgress(0);
    setProgressMsg("Preparing analysis...");
    setStep(4);

    try {
      const modelName = analysisType === "anomaly"
        ? (models.anomaly_detection[0] ?? "isolation_forest")
        : (models.failure_prediction[0] ?? "random_forest");

      if (selectedDevice === "all") {
        const ids = devices.map((d) => d.id);
        const resp = await runFleetAnalytics({
          device_ids: ids,
          analysis_type: analysisType === "anomaly" ? "anomaly" : "prediction",
          model_name: modelName,
          start_time: `${dateRange.start}T00:00:00Z`,
          end_time: `${dateRange.end}T23:59:59Z`,
          parameters: { sensitivity: "medium", lookback_days: runDays },
        });
        setJobId(resp.job_id);
        return;
      }

      const resp = await runAnalytics({
        device_id: selectedDevice,
        analysis_type: analysisType === "anomaly" ? "anomaly" : "prediction",
        model_name: modelName,
        start_time: `${dateRange.start}T00:00:00Z`,
        end_time: `${dateRange.end}T23:59:59Z`,
        parameters: { sensitivity: "medium", lookback_days: runDays },
      });
      setJobId(resp.job_id);
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit analysis");
      setStep(3);
    }
  }, [analysisType, models, selectedDevice, devices, dateRange, runDays]);

  const reset = () => {
    setScreen("wizard");
    setStep(1);
    setResult(null);
    setAnomalyPage(1);
    setJobId(null);
    setError(null);
    setProgress(0);
    setProgressMsg("Preparing analysis...");
  };

  const goDashboard = () => {
    if (!result) return;
    if (result.analysis_type === "anomaly_detection") setScreen("anomaly");
    else if (result.analysis_type === "failure_prediction") setScreen("failure");
    else setScreen("fleet");
  };

  if (screen === "wizard") {
    return (
      <div style={{ minHeight: "100vh", width: "100%", overflowX: "hidden", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 24px 40px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 26 }}>
            <div>
              <div style={{ color: COLORS.muted, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Machine Intelligence</div>
              <h1 style={{ margin: "8px 0 0", fontSize: 24 }}>Premium ML Analytics</h1>
            </div>
            <StepDots step={step} />
          </div>

          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 16, padding: 24 }}>
            {step === 1 && (
              <>
                <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>Select Scope</h2>
                <div style={{ color: COLORS.muted, marginBottom: 18 }}>Which machines do you want to analyse?</div>

                {[
                  { id: "all", name: "All Machines", subtitle: `Comparative analysis across all ${devices.length} devices` },
                  ...devices.map((d) => ({ id: d.id, name: d.name || d.id, subtitle: "Single device deep-dive" })),
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDevice(d.id)}
                    style={{ width: "100%", textAlign: "left", background: selectedDevice === d.id ? "rgba(99,102,241,0.14)" : "rgba(12,18,30,0.8)", color: "white", border: `1px solid ${selectedDevice === d.id ? "#6366f1" : COLORS.panelBorder}`, borderRadius: 14, padding: 18, marginBottom: 10, cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{d.name}</div>
                    <div style={{ color: COLORS.muted, marginTop: 4 }}>{d.subtitle}</div>
                  </button>
                ))}

                <button onClick={() => setStep(2)} style={{ marginTop: 10, width: "100%", padding: 12, borderRadius: 12, border: "none", background: COLORS.accent, color: "white", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
                  Continue
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>Select Date Range</h2>
                <div style={{ color: COLORS.muted, marginBottom: 18 }}>How much telemetry data to include?</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  {(["quick", "recommended", "deep", "custom"] as Preset[]).map((p) => {
                    const range = p === "custom" ? dateRange : getPresetRange(p);
                    return (
                      <button
                        key={p}
                        onClick={() => {
                          setPreset(p);
                          if (p !== "custom") setDateRange(range);
                        }}
                        style={{ textAlign: "left", background: preset === p ? "rgba(99,102,241,0.14)" : "rgba(12,18,30,0.8)", color: "white", border: `1px solid ${preset === p ? "#6366f1" : COLORS.panelBorder}`, borderRadius: 14, padding: 16, cursor: "pointer" }}
                      >
                        <div style={{ color: "#818cf8", letterSpacing: 2, textTransform: "uppercase", fontSize: 12, fontWeight: 700 }}>{p}</div>
                        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>{PRESET_LABELS[p]}</div>
                        <div style={{ color: COLORS.muted, marginTop: 6 }}>{range.start} → {range.end}</div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: COLORS.muted, letterSpacing: 1 }}>FROM</div>
                    <input type="date" value={dateRange.start} onChange={(e) => { setPreset("custom"); setDateRange((r) => ({ ...r, start: e.target.value })); }} style={{ marginTop: 8, width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${COLORS.panelBorder}`, background: "#0a101b", color: "white" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: COLORS.muted, letterSpacing: 1 }}>TO</div>
                    <input type="date" value={dateRange.end} onChange={(e) => { setPreset("custom"); setDateRange((r) => ({ ...r, end: e.target.value })); }} style={{ marginTop: 8, width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${COLORS.panelBorder}`, background: "#0a101b", color: "white" }} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <button onClick={() => setStep(1)} style={{ padding: "12px 20px", borderRadius: 12, border: `1px solid ${COLORS.panelBorder}`, background: "#151c29", color: "white", fontWeight: 700, cursor: "pointer" }}>Back</button>
                  <button onClick={() => setStep(3)} style={{ flex: 1, padding: "12px 20px", borderRadius: 12, border: "none", background: COLORS.accent, color: "white", fontWeight: 800, cursor: "pointer" }}>Continue</button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>Analysis Type</h2>
                <div style={{ color: COLORS.muted, marginBottom: 18 }}>What do you want to discover?</div>

                <button onClick={() => setAnalysisType("anomaly")} style={{ width: "100%", textAlign: "left", background: analysisType === "anomaly" ? "rgba(99,102,241,0.14)" : "rgba(12,18,30,0.8)", color: "white", border: `1px solid ${analysisType === "anomaly" ? "#6366f1" : COLORS.panelBorder}`, borderRadius: 14, padding: 18, marginBottom: 10, cursor: "pointer" }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Anomaly Detection</div>
                  <div style={{ color: COLORS.muted, marginTop: 4 }}>Find unusual patterns, spikes, drops, and correlated deviations across parameters.</div>
                </button>

                <button onClick={() => setAnalysisType("failure_prediction")} style={{ width: "100%", textAlign: "left", background: analysisType === "failure_prediction" ? "rgba(99,102,241,0.14)" : "rgba(12,18,30,0.8)", color: "white", border: `1px solid ${analysisType === "failure_prediction" ? "#6366f1" : COLORS.panelBorder}`, borderRadius: 14, padding: 18, cursor: "pointer" }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Failure Prediction</div>
                  <div style={{ color: COLORS.muted, marginTop: 4 }}>Predict failure probability, remaining useful life, risk factors, and maintenance urgency.</div>
                </button>

                {error && <div style={{ marginTop: 12, color: COLORS.bad }}>{error}</div>}

                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <button onClick={() => setStep(2)} style={{ padding: "12px 20px", borderRadius: 12, border: `1px solid ${COLORS.panelBorder}`, background: "#151c29", color: "white", fontWeight: 700, cursor: "pointer" }}>Back</button>
                  <button onClick={submit} disabled={!analysisType} style={{ flex: 1, padding: "12px 20px", borderRadius: 12, border: "none", background: COLORS.accent, color: "white", fontWeight: 800, cursor: !analysisType ? "not-allowed" : "pointer", opacity: analysisType ? 1 : 0.55 }}>Run Analysis</button>
                </div>
              </>
            )}

            {step === 4 && (
              <div style={{ minHeight: 520, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0" }}>
                <div style={{ width: "100%", maxWidth: 640, textAlign: "center" }}>
                  <div style={{ color: "#818cf8", letterSpacing: 4, textTransform: "uppercase", fontWeight: 700, marginBottom: 26, fontSize: 14 }}>
                    Running {analysisType === "anomaly" ? "Anomaly Detection" : "Failure Prediction"}
                  </div>
                  <div style={{ width: 190, height: 190, borderRadius: 95, border: "12px solid rgba(255,255,255,0.08)", margin: "0 auto", position: "relative" }}>
                    <svg width="190" height="190" style={{ position: "absolute", inset: 0 }}>
                      <circle cx="95" cy="95" r="83" fill="none" stroke="url(#g)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${Math.max(1, progress) * 5.22} 522`} transform="rotate(-90 95 95)" />
                      <defs>
                        <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#a78bfa" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 30, fontWeight: 800 }}>{progress}%</div>
                  </div>
                  <div style={{ marginTop: 22, fontSize: 14, color: COLORS.muted }}>{progressMsg}</div>
                  <div style={{ marginTop: 18, color: "rgba(180,194,220,0.4)", fontSize: 12 }}>{selectedDevice.toUpperCase()} · {dateRange.start} → {dateRange.end}</div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div style={{ textAlign: "center", padding: "26px 0 8px" }}>
                <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Analysis Complete</div>
                <div style={{ color: COLORS.muted, marginBottom: 20, fontSize: 14 }}>
                  {result?.analysis_type === "anomaly_detection" && `${result.summary.total_anomalies} anomalies · ${result.summary.health_impact} impact`}
                  {result?.analysis_type === "failure_prediction" && `${result.summary.failure_probability_pct.toFixed(1)}% failure probability · ${result.summary.failure_risk} risk`}
                  {result?.analysis_type === "fleet" && `${result.device_summaries.length} devices analysed`}
                </div>
                <button onClick={goDashboard} style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", background: COLORS.accent, color: "white", fontWeight: 700, fontSize: 16, cursor: "pointer", marginBottom: 10 }}>View Dashboard</button>
                <button onClick={reset} style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${COLORS.panelBorder}`, background: "#151c29", color: "white", fontWeight: 700, cursor: "pointer" }}>Run Another Analysis</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "anomaly" && result && result.analysis_type === "anomaly_detection") {
    const maxParam = Math.max(...result.parameter_breakdown.map((p) => p.anomaly_count), 1);
    const confidence = result.confidence;
    const anomalyRate = result.summary.anomaly_rate_pct;
    const anomalyPages = Math.max(1, Math.ceil(result.anomaly_list.length / 10));
    const pageStart = (anomalyPage - 1) * 10;
    const anomalyRows = result.anomaly_list.slice(pageStart, pageStart + 10);
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: 16 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 10 }}>
          <button onClick={reset} style={{ justifySelf: "start", padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.panelBorder}`, background: "#151c29", color: "white", cursor: "pointer", fontSize: 13 }}>New Analysis</button>
          {confidence && (
            <div style={{ background: "rgba(16,24,38,0.9)", border: `1px solid ${confidence.badge_color}`, borderRadius: 12, padding: 12, color: confidence.badge_color, fontWeight: 700 }}>
              {confidence.banner_text}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
            <Stat label="Total Anomalies" value={String(result.summary.total_anomalies)} />
            <Stat label="Anomaly Rate" value={`${result.summary.anomaly_rate_pct}%`} />
            <Stat label="Anomaly Score" value={`${result.summary.anomaly_score}/100`} />
            <Stat label="Health Impact" value={result.summary.health_impact} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={panelStyle()}>
              <h3 style={titleStyle()}>Anomaly Rate Gauge</h3>
              <RadialGauge
                value={anomalyRate}
                min={0}
                max={10}
                color={anomalyRate < 3 ? COLORS.good : anomalyRate < 7 ? COLORS.warn : COLORS.bad}
                label={`${anomalyRate.toFixed(2)}%`}
                subtitle="0-3% normal · 3-7% watch · >7% critical"
              />
            </div>
            <div style={panelStyle()}>
              <h3 style={titleStyle()}>Period Summary</h3>
              <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 8 }}>
                Most affected parameter: <b style={{ color: COLORS.text }}>{result.summary.most_affected_parameter}</b>
              </div>
              <div style={{ color: COLORS.muted, fontSize: 13 }}>
                Data points analyzed: <b style={{ color: COLORS.text }}>{result.summary.data_points_analyzed}</b>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
            <div style={panelStyle()}>
              <h3 style={titleStyle()}>Anomalies Over Time</h3>
              {result.anomalies_over_time.map((d) => (
                <div key={d.date} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.muted }}><span>{d.date}</span><span>{d.count}</span></div>
                  <div style={{ height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 8, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${d.count ? (d.high_count / d.count) * 100 : 0}%`, background: COLORS.bad }} />
                    <div style={{ width: `${d.count ? (d.medium_count / d.count) * 100 : 0}%`, background: COLORS.warn }} />
                    <div style={{ width: `${d.count ? (d.low_count / d.count) * 100 : 0}%`, background: COLORS.good }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={panelStyle()}>
              <h3 style={titleStyle()}>Affected Parameters</h3>
              {result.parameter_breakdown.map((p) => (
                <div key={p.parameter} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}><span>{p.parameter}</span><b>{p.anomaly_count}</b></div>
                  <div style={{ height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 8 }}>
                    <div style={{ height: "100%", width: `${(p.anomaly_count / maxParam) * 100}%`, background: "#60a5fa", borderRadius: 8 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={panelStyle()}>
            <h3 style={titleStyle()}>Anomaly Detail List</h3>
            {anomalyRows.map((a, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 210px", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 13 }}>
                <span style={{ color: a.severity === "high" ? COLORS.bad : a.severity === "medium" ? COLORS.warn : COLORS.good, fontWeight: 700 }}>{a.severity.toUpperCase()}</span>
                <span>{a.context}</span>
                <span style={{ color: COLORS.muted }}>{a.recommended_action}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span style={{ color: COLORS.muted, fontSize: 12 }}>
                Showing {result.anomaly_list.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + 10, result.anomaly_list.length)} of {result.anomaly_list.length}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setAnomalyPage((p) => Math.max(1, p - 1))}
                  disabled={anomalyPage <= 1}
                  style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.panelBorder}`, background: "#151c29", color: "white", cursor: anomalyPage <= 1 ? "not-allowed" : "pointer", opacity: anomalyPage <= 1 ? 0.5 : 1 }}
                >
                  Prev
                </button>
                <span style={{ color: COLORS.muted, fontSize: 12, alignSelf: "center" }}>Page {anomalyPage}/{anomalyPages}</span>
                <button
                  onClick={() => setAnomalyPage((p) => Math.min(anomalyPages, p + 1))}
                  disabled={anomalyPage >= anomalyPages}
                  style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.panelBorder}`, background: "#151c29", color: "white", cursor: anomalyPage >= anomalyPages ? "not-allowed" : "pointer", opacity: anomalyPage >= anomalyPages ? 0.5 : 1 }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div style={panelStyle()}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ color: COLORS.muted }}>
                📅 Days Analysed: <b style={{ color: COLORS.text }}>{formatDaysAnalysed(result.summary.days_analyzed)}</b>
              </div>
              <div style={{ color: COLORS.good }}>
                ✅ Completion: <b>100%</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "failure" && result && result.analysis_type === "failure_prediction") {
    const confidence = result.confidence;
    const failurePct = result.summary.failure_probability_pct;
    const safePct = result.summary.safe_probability_pct ?? Math.max(0, 100 - failurePct);
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: 16 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 10 }}>
          <button onClick={reset} style={{ justifySelf: "start", padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.panelBorder}`, background: "#151c29", color: "white", cursor: "pointer", fontSize: 13 }}>New Analysis</button>
          {confidence && (
            <div style={{ background: "rgba(16,24,38,0.9)", border: `1px solid ${confidence.badge_color}`, borderRadius: 12, padding: 12, color: confidence.badge_color, fontWeight: 700 }}>
              {confidence.banner_text}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
            <Stat label="Risk Level" value={result.summary.failure_risk} />
            <Stat label="Failure Probability" value={`${result.summary.failure_probability_pct.toFixed(1)}%`} />
            <Stat label="Remaining Life" value={result.summary.estimated_remaining_life} />
            <Stat label="Maintenance" value={result.summary.maintenance_urgency} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={panelStyle()}>
              <h3 style={titleStyle()}>Failure Probability Meter</h3>
              <RadialGauge
                value={failurePct}
                min={0}
                max={100}
                color={failurePct < 35 ? COLORS.good : failurePct < 60 ? COLORS.warn : COLORS.bad}
                label={`${failurePct.toFixed(1)}%`}
                subtitle="0% healthy → 100% imminent failure"
              />
            </div>
            <div style={panelStyle()}>
              <h3 style={titleStyle()}>Contributing Risk Factors</h3>
              {result.insufficient_trend_signal ? (
                <div style={{ color: COLORS.warn }}>No significant trend signal yet. Continue collecting telemetry for stronger prediction reliability.</div>
              ) : (
                result.risk_factors.slice(0, 6).map((rf, i) => (
                  <div key={`${rf.parameter}-${i}`} style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <b>{rf.parameter}</b>
                      <span>{rf.contribution_pct}%</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 8, margin: "5px 0 6px" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, rf.contribution_pct)}%`, background: "#f59e0b", borderRadius: 8 }} />
                    </div>
                    <div style={{ color: COLORS.muted, fontSize: 12 }}>{rf.context}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={panelStyle()}>
            <h3 style={titleStyle()}>Failure vs Safe Breakdown</h3>
            <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, alignItems: "center" }}>
              <DonutChart
                segments={[
                  { value: failurePct, color: COLORS.bad, label: "Failure" },
                  { value: safePct, color: COLORS.good, label: "Safe" },
                ]}
                size={150}
                inner={68}
              />
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: COLORS.muted }}>
                  <span>Failure</span><b style={{ color: COLORS.bad }}>{failurePct.toFixed(1)}%</b>
                </div>
                <div style={{ height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 8 }}>
                  <div style={{ width: `${failurePct}%`, height: "100%", background: COLORS.bad, borderRadius: 8 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: COLORS.muted }}>
                  <span>Safe</span><b style={{ color: COLORS.good }}>{safePct.toFixed(1)}%</b>
                </div>
                <div style={{ height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 8 }}>
                  <div style={{ width: `${safePct}%`, height: "100%", background: COLORS.good, borderRadius: 8 }} />
                </div>
              </div>
            </div>
          </div>

          <div style={panelStyle()}>
            <h3 style={titleStyle()}>Recommended Actions</h3>
            {result.recommended_actions.length === 0 && (
              <div style={{ color: COLORS.muted }}>No immediate actions generated yet. Continue telemetry collection and re-run analysis.</div>
            )}
            {result.recommended_actions.map((r) => (
              <div key={r.rank} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div>
                  <b>{r.rank}. {r.action}</b>
                  <div style={{ color: COLORS.muted, fontSize: 12 }}>{r.reasoning}</div>
                </div>
                <span style={{ color: COLORS.warn }}>{r.urgency}</span>
              </div>
            ))}
          </div>

          <div style={panelStyle()}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ color: COLORS.muted }}>
                📅 Days Analysed: <b style={{ color: COLORS.text }}>{formatDaysAnalysed(result.summary.days_analyzed)}</b>
              </div>
              <div style={{ color: COLORS.good }}>
                ✅ Completion: <b>100%</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "fleet" && result && result.analysis_type === "fleet") {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: 16 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 10 }}>
          <button onClick={reset} style={{ justifySelf: "start", padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.panelBorder}`, background: "#151c29", color: "white", cursor: "pointer", fontSize: 13 }}>New Analysis</button>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
            <Stat label="Fleet Health" value={`${result.fleet_health_score}%`} />
            <Stat label="Worst Device" value={result.worst_device_id || "N/A"} />
            <Stat label="Critical Devices" value={String(result.critical_devices.length)} />
          </div>
          <div style={panelStyle()}>
            <h3 style={titleStyle()}>Device Summaries</h3>
            {result.device_summaries.map((d) => (
              <div key={d.device_id} style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 13 }}>
                <b>{d.device_id}</b>
                <span>Health {d.health_score}%</span>
                <span>{d.failure_risk || `${d.total_anomalies || 0} anomalies`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return <div style={{ minHeight: "100vh", background: COLORS.bg }} />;
}

function panelStyle(): React.CSSProperties {
  return {
    background: COLORS.panel,
    border: `1px solid ${COLORS.panelBorder}`,
    borderRadius: 10,
    padding: 12,
  };
}

function titleStyle(): React.CSSProperties {
  return {
    margin: "0 0 10px",
    fontSize: 14,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 10, padding: 10 }}>
      <div style={{ fontSize: 11, color: COLORS.muted }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 18, fontWeight: 800, color: badgeColor(value) }}>{value}</div>
    </div>
  );
}

function RadialGauge({
  value,
  min,
  max,
  color,
  label,
  subtitle,
}: {
  value: number;
  min: number;
  max: number;
  color: string;
  label: string;
  subtitle: string;
}) {
  const clamped = Math.min(max, Math.max(min, value));
  const ratio = (clamped - min) / Math.max(1e-6, max - min);
  const sweep = 270;
  const rotate = -225;
  const dash = 471;
  const filled = dash * (ratio * (sweep / 360));
  return (
    <div style={{ display: "grid", placeItems: "center", padding: "6px 0 10px" }}>
      <div style={{ position: "relative", width: 180, height: 180 }}>
        <svg width="180" height="180">
          <g transform={`rotate(${rotate} 90 90)`}>
            <circle cx="90" cy="90" r="75" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="14" strokeDasharray={`${dash * (sweep / 360)} ${dash}`} strokeLinecap="round" />
            <circle cx="90" cy="90" r="75" fill="none" stroke={color} strokeWidth="14" strokeDasharray={`${filled} ${dash}`} strokeLinecap="round" />
          </g>
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color }}>{label}</div>
        </div>
      </div>
      <div style={{ color: COLORS.muted, fontSize: 12, marginTop: -12 }}>{subtitle}</div>
    </div>
  );
}

function DonutChart({
  segments,
  size,
  inner,
}: {
  segments: Array<{ value: number; color: string; label: string }>;
  size: number;
  inner: number;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  let start = 0;
  const r = size / 2 - 8;
  const c = size / 2;
  const paths = segments.map((seg, i) => {
    const part = total > 0 ? seg.value / total : 0;
    const end = start + part;
    const a0 = start * Math.PI * 2 - Math.PI / 2;
    const a1 = end * Math.PI * 2 - Math.PI / 2;
    const x0 = c + r * Math.cos(a0);
    const y0 = c + r * Math.sin(a0);
    const x1 = c + r * Math.cos(a1);
    const y1 = c + r * Math.sin(a1);
    const large = end - start > 0.5 ? 1 : 0;
    start = end;
    return (
      <path
        key={`${seg.label}-${i}`}
        d={`M ${c} ${c} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`}
        fill={seg.color}
      />
    );
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      <circle cx={c} cy={c} r={inner / 2} fill={COLORS.panel} />
    </svg>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.muted, padding: 24 }}>Loading analytics...</div>}>
      <AnalyticsPageContent />
    </Suspense>
  );
}
