# Analytics Service

Production ML analytics backend for FactoryOPS. This service runs asynchronous analytics jobs for anomaly detection and failure prediction, and returns both raw model output and dashboard-ready formatted payloads.

## Final Fix Status
This README reflects the current stabilized implementation in `services/analytics-service`:
- resilient dataset loading with fallback
- strict fleet orchestration support
- formatted-results API for UI-first payloads
- weekly auto-retrainer integrated in app lifecycle
- confidence-aware model behavior and messaging
- JSON-safe persistence boundary

---

## What This Service Does
- Executes ML analytics per device or fleet scope.
- Pulls telemetry datasets from S3/MinIO parquet exports.
- Queues and processes jobs asynchronously.
- Stores job status/progress/results in MySQL.
- Exposes APIs for run, status, results, models, datasets, fleet, formatted results, retrain status.

---

## Architecture Overview

### Runtime Components
- API routes: `src/api/routes/analytics.py`
- Queue: `src/workers/job_queue.py`
- Worker: `src/workers/job_worker.py`
- Job execution: `src/services/job_runner.py`
- Pipelines:
  - `src/services/analytics/anomaly_detection.py`
  - `src/services/analytics/failure_prediction.py`
- Dataset access (S3): `src/services/dataset_service.py`
- Formatting layer: `src/services/result_formatter.py`
- Persistence: `src/infrastructure/mysql_repository.py`
- Retrainer: `src/services/analytics/retrainer.py`

### End-to-End Job Flow
1. Client submits `POST /api/v1/analytics/run` (or `/run-fleet`).
2. Request is queued in `JobQueue`.
3. `JobWorker` dequeues and ensures job row exists.
4. `JobRunner` loads dataset from S3 parquet during execution.
5. Pipeline runs exact sequence:
   - `prepare_data()`
   - `train()`
   - `predict()`
   - `evaluate()`
6. Runner attaches point-level timeline arrays.
7. `ResultFormatter` writes structured payload under `results["formatted"]`.
8. `_json_safe` sanitizes NaN/Inf.
9. Results + metrics persisted to MySQL and status updated.

---

## Data Source and Pull Timing

### Source of Truth
- Input datasets are parquet files in S3/MinIO bucket.
- Canonical key pattern:
  - `datasets/{device_id}/{YYYYMMDD}_{YYYYMMDD}.parquet`

### When Data is Pulled
Data is pulled **during job execution** (not at UI scope/date selection time).

### Missing Exact Range Behavior
If exact range key is missing:
- service attempts best-available key fallback (closest valid dataset window)
- for fleet strict flow, readiness checks use fallback logic before failing

This improves reliability when exports are slightly delayed or range key is absent.

---

## ML Models in Use

## 1) Anomaly Detection
File: `src/services/analytics/anomaly_detection.py`

Primary model:
- `IsolationForest` (scikit-learn)

Pipeline highlights:
- timestamp normalization (`timestamp` or `_time`)
- numeric-only feature selection with time-derived leakage fields excluded
- 1-minute resampling
- short-gap forward/back fill
- numeric sanitization (NaN/Inf replacement)
- feature scaling + clipping
- anomaly details with severity + context + triggered parameters

Output includes:
- `anomaly_score`
- `is_anomaly`
- `anomaly_details`
- `point_timestamps`
- `data_completeness_pct`
- `days_available`
- confidence metadata

Minimum data guard:
- `MIN_POINTS = 50`

## 2) Failure Prediction
File: `src/services/analytics/failure_prediction.py`

Primary model:
- `RandomForestClassifier` (scikit-learn)

Pipeline highlights:
- timestamp normalization + 1-minute resampling
- leakage column exclusion (`hour/day/...` etc.)
- rolling and rate-of-change engineered features
- non-circular stress-label generation
- probability inference + risk factor attribution and trend context

Output includes:
- `failure_probability`
- `predicted_failure`
- `time_to_failure_hours`
- `failure_probability_pct`
- `risk_breakdown`
- `risk_factors`
- `point_timestamps`
- `data_completeness_pct`
- `days_available`

Minimum data guard:
- `MIN_POINTS = 100`


---

## Confidence System
File: `src/services/analytics/confidence.py`

Confidence is computed from available data points after resampling.

Tier summary:
- `< 10 points`: Low
- `10-359`: Low
- `360-10079`: Moderate
- `10080-43199`: High
- `>= 43200`: Very High

Used for:
- contamination tuning in anomaly pipeline
- z-score multiplier behavior
- UI banner text and reliability messaging

Customer-facing wording is humanized (`minutes/hours/days`) to avoid confusing decimals.

---

## Health Score Logic (Current Implementation)
File: `src/services/result_formatter.py`

### Anomaly result health score
- `anomaly_score` is weighted from anomaly severity distribution.
- Formula:
  - `health_score = clamp(100 - (anomaly_score * 0.60), 0, 100)`

### Failure result health score
- Formula:
  - `health_score = clamp(100 - (anomaly_score * 0.60) - (failure_probability_pct * 0.40), 0, 100)`

### Fleet health score
- Weighted average across device health scores.
- Weight = `data_points_analyzed` per device.

---

## Result Persistence
Results are stored in MySQL in analytics job records.

Stored fields include:
- `results` (raw payload)
- `results["formatted"]` (dashboard-ready payload)
- `accuracy_metrics`
- execution metadata (status/progress/message/error, timings)

Repository implementation:
- `src/infrastructure/mysql_repository.py`

---

## APIs
Base path: `/api/v1/analytics`

### Core
- `POST /run` - submit single-device job
- `GET /status/{job_id}` - current status/progress
- `GET /results/{job_id}` - completed job raw results
- `GET /models` - runnable models by analysis type
- `GET /datasets?device_id=...` - list available dataset keys

Note on `/models`:
- API compatibility may still expose forecasting-related entries.
- For this release, supported production scope is anomaly + failure prediction only.

### Fleet + formatted payloads
- `POST /run-fleet` - strict fleet orchestration
- `GET /formatted-results/{job_id}` - dashboard-ready structured payload
- `GET /retrain-status` - retrainer latest submission status map

Compatibility note:
- existing consumers can continue using `/results/{job_id}`
- modern UI should prefer `/formatted-results/{job_id}` and fallback to nested `results.formatted`

---

## Fleet Strict Mode
File: `src/api/routes/analytics.py`

Current default:
- `ml_fleet_strict_enabled = true`

Behavior:
- parent fleet job orchestrates per-device child jobs
- if required devices are not ready, parent fails with clear reason
- readiness path includes exact-key check + fallback key + optional export trigger path

---

## Weekly Retrainer
File: `src/services/analytics/retrainer.py`

Current default:
- `ml_weekly_retrainer_enabled = true`

Schedule:
- warm-up: 5 minutes after service startup
- run cycle: every 7 days

Per-device retrain submission:
- analysis type: anomaly
- model: `isolation_forest`
- parameters: `{"sensitivity": "medium", "lookback_days": 30}`
- jobs submitted through existing queue (`submit_job`), not direct fit calls

Device discovery:
- fetched from device-service endpoint each cycle
- falls back to last known device list if endpoint temporarily unavailable

---

## Key Settings (Current Defaults)
File: `src/config/settings.py`

- `ml_formatted_results_enabled = true`
- `ml_weekly_retrainer_enabled = true`
- `ml_fleet_strict_enabled = true`
- `ml_data_readiness_gate_enabled = true`
- `data_readiness_poll_attempts = 3`
- `data_readiness_initial_delay_seconds = 5`
- `max_concurrent_jobs = 3`

---

## Reliability Behaviors

Implemented hardening:
- robust timestamp handling (`timestamp` / `_time`)
- NaN/Inf sanitization before persistence
- point-array alignment protection in job runner
- missing dataset fallback strategy
- structured failure messages for no-data and insufficient-signal cases
- retrainer guarded start/stop in app lifespan

User-facing no-data messaging intentionally avoids “simulator” language and instructs starting device telemetry flow.

---

## Local Dev / Ops Notes

### Start service in stack
Use root compose setup.

### Health and smoke checks
- submit single-device anomaly and prediction jobs
- validate completed status
- fetch `/formatted-results/{job_id}`
- run fleet request and validate strict outcome
- verify `/retrain-status`

### What to verify before deploy
- models endpoint returns expected model list
- formatted payload has required UI fields
- retrainer status endpoint reachable
- fleet strict errors are clear and actionable

---

## Troubleshooting Quick Guide

### "Data not ready" or no results
- check datasets exist for requested device/date
- check fallback dataset availability
- check export service health if readiness gate is enabled

### Fleet job fails while single jobs pass
- strict mode requires all target devices ready
- inspect parent formatted execution metadata for failed devices list

### Low confidence warnings
- increase time range to gather more telemetry points
- confidence tiers are data-volume-based after resampling

---


