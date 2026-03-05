# API Endpoints Documentation

> Complete API reference for the FactoryOPS/Cittagent Industrial IoT Platform
> This document lists all REST API endpoints across all microservices with detailed explanations

---

## Table of Contents
1. [Device Service (Port 8000)](#1-device-service-port-8000)
2. [Data Service (Port 8081)](#2-data-service-port-8081)
3. [Rule Engine Service (Port 8002)](#3-rule-engine-service-port-8002)
4. [Reporting Service (Port 8085)](#4-reporting-service-port-8085)
5. [Analytics Service](#5-analytics-service)
6. [Data Export Service](#6-data-export-service)

---

## 1. Device Service (Port 8000)

**Base URL:** `http://localhost:8000/api/v1`

**Purpose:** Manages devices, shifts, health configurations, and device properties. This is the central service for device onboarding and management.

### 1.1 Health Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check endpoint for Kubernetes probes. Returns service status |
| GET | `/ready` | Readiness check. Verifies database connectivity before accepting traffic |

**Example Response:**
```json
{
  "status": "healthy",
  "service": "device-service",
  "version": "1.0.0"
}
```

---

### 1.2 Device Endpoints

#### List All Devices
```
GET /devices
```
**Description:** Retrieves a paginated list of all devices with optional filtering.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| tenant_id | string | No | Filter by tenant (for multi-tenancy) |
| device_type | string | No | Filter by device type (e.g., 'bulb', 'compressor') |
| status | string | No | Filter by status: 'active', 'inactive', 'maintenance', 'error' |
| page | integer | No | Page number (default: 1) |
| page_size | integer | No | Items per page (default: 20, max: 100) |

**Example Request:**
```bash
curl "http://localhost:8000/api/v1/devices?device_type=compressor&status=active"
```

---

#### Create New Device
```
POST /devices
```
**Description:** Creates a new device in the system. This is the first step in device onboarding.

**Request Body:**
```json
{
  "device_id": "COMPRESSOR-001",
  "device_name": "Compressor 001",
  "device_type": "compressor",
  "phase_type": "three",
  "manufacturer": "Atlas Copco",
  "model": "GA37",
  "location": "Plant A",
  "metadata_json": {"floor": "1", "line": "A"}
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| device_id | string | Yes | Unique identifier for the device |
| device_name | string | Yes | Human-readable name |
| device_type | string | Yes | Category of device (e.g., 'compressor', 'bulb', 'motor') |
| manufacturer | string | No | Device manufacturer |
| model | string | No | Device model number |
| location | string | No | Physical location |
| metadata_json | object | No | Additional custom metadata |

---

#### Get Device by ID
```
GET /devices/{device_id}
```
**Description:** Retrieves detailed information about a specific device.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| device_id | string | Unique device identifier |

**Example Response:**
```json
{
  "success": true,
  "data": {
    "device_id": "COMPRESSOR-001",
    "device_name": "Compressor 001",
    "device_type": "compressor",
    "status": "active",
    "last_seen_timestamp": "2026-03-04T12:00:00Z"
  }
}
```

---

#### Update Device
```
PUT /devices/{device_id}
```
**Description:** Updates an existing device's information. Only provided fields will be updated.

**Request Body:** (All fields optional)
```json
{
  "device_name": "Updated Name",
  "status": "maintenance",
  "location": "Building B"
}
```

---

#### Delete Device
```
DELETE /devices/{device_id}
```
**Description:** Deletes a device. Can perform soft delete (marks as deleted) or hard delete (permanent removal).

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| soft | boolean | true | If true, marks as deleted; if false, permanently removes |

---

### 1.3 Device Properties Endpoints

Properties are dynamic telemetry fields discovered from incoming data.

#### Get All Devices Properties
```
GET /devices/properties
```
**Description:** Gets all properties (telemetry fields) across all devices. Useful for understanding what data types are being collected.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| tenant_id | string | Optional tenant filter |

**Example Response:**
```json
{
  "success": true,
  "devices": {
    "COMPRESSOR-001": ["voltage", "current", "power", "temperature", "pressure"],
    "COMPRESSOR-002": ["voltage", "current", "power"]
  },
  "all_properties": ["current", "power", "pressure", "temperature", "voltage"]
}
```

---

#### Get Common Properties
```
POST /devices/properties/common
```
**Description:** Finds properties that are common across multiple selected devices.

**Request Body:**
```json
{
  "device_ids": ["COMPRESSOR-001", "COMPRESSOR-002"]
}
```

---

#### Get Device Properties
```
GET /devices/{device_id}/properties
```
**Description:** Gets all properties for a specific device.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| numeric_only | boolean | true | Only return numeric properties |

---

#### Sync Device Properties
```
POST /devices/{device_id}/properties/sync
```
**Description:** Called automatically when telemetry data arrives. Updates device properties from incoming data and updates the last_seen_timestamp.

**Request Body:** (telemetry data)
```json
{
  "device_id": "COMPRESSOR-001",
  "timestamp": "2026-03-04T12:00:00Z",
  "voltage": 231.4,
  "current": 0.86,
  "power": 198.7,
  "temperature": 45.9,
  "pressure": 5.2
}
```

---

### 1.4 Dashboard Endpoints

#### Get Dashboard Summary
```
GET /devices/dashboard/summary
```
**Description:** Returns aggregate statistics across all devices for the home dashboard. Includes total devices, active count, average health scores, etc.

---

### 1.5 Device Heartbeat

#### Device Heartbeat
```
POST /devices/{device_id}/heartbeat
```
**Description:** Lightweight endpoint for devices to mark themselves as alive. Called periodically by devices or telemetry service.

**Purpose:** Updates the `last_seen_timestamp` to track device runtime status without sending full telemetry.

---

### 1.6 Shift Management Endpoints

Shifts define working schedules for devices to calculate uptime properly.

#### Create Shift
```
POST /devices/{device_id}/shifts
```
**Description:** Creates a new shift schedule for a device.

**Request Body:**
```json
{
  "shift_name": "Morning Shift",
  "start_time": "08:00:00",
  "end_time": "16:00:00",
  "days_of_week": ["monday", "tuesday", "wednesday", "thursday", "friday"]
}
```

---

#### List Shifts
```
GET /devices/{device_id}/shifts
```
**Description:** Lists all shifts configured for a device.

---

#### Get Shift
```
GET /devices/{device_id}/shifts/{shift_id}
```
**Description:** Gets a specific shift by ID.

---

#### Update Shift
```
PUT /devices/{device_id}/shifts/{shift_id}
```
**Description:** Updates an existing shift schedule.

---

#### Delete Shift
```
DELETE /devices/{device_id}/shifts/{shift_id}
```
**Description:** Removes a shift from a device.

---

#### Get Device Uptime
```
GET /devices/{device_id}/uptime
```
**Description:** Calculates device uptime based on configured shifts and telemetry data.

**Example Response:**
```json
{
  "device_id": "COMPRESSOR-001",
  "total_uptime_hours": 150.5,
  "total_downtime_hours": 10.2,
  "uptime_percentage": 93.6
}
```

---

### 1.7 Health Configuration Endpoints

Health configurations define thresholds and weights for calculating device health scores.

#### Create Health Config
```
POST /devices/{device_id}/health-config
```
**Description:** Creates a health configuration for a device parameter (e.g., temperature threshold).

**Request Body:**
```json
{
  "parameter_name": "temperature",
  "min_value": 20,
  "max_value": 80,
  "weight": 25,
  "ideal_value": 45
}
```

| Field | Type | Description |
|-------|------|-------------|
| parameter_name | string | The telemetry parameter (e.g., 'temperature', 'pressure') |
| min_value | float | Minimum acceptable value |
| max_value | float | Maximum acceptable value |
| weight | float | Weight percentage for health calculation (must sum to 100 across all configs) |
| ideal_value | float | Ideal/optimal value |

---

#### List Health Configs
```
GET /devices/{device_id}/health-config
```
**Description:** Lists all health configurations for a device.

---

#### Validate Health Weights
```
GET /devices/{device_id}/health-config/validate-weights
```
**Description:** Validates that all health parameter weights sum to 100%. Returns validation status.

---

#### Update Health Config
```
PUT /devices/{device_id}/health-config/{config_id}
```
**Description:** Updates an existing health configuration.

---

#### Delete Health Config
```
DELETE /devices/{device_id}/health-config/{config_id}
```
**Description:** Removes a health configuration.

---

#### Bulk Create Health Configs
```
POST /devices/{device_id}/health-config/bulk
```
**Description:** Creates or updates multiple health configurations at once.

**Request Body:**
```json
[
  {"parameter_name": "temperature", "min_value": 20, "max_value": 80, "weight": 25, "ideal_value": 45},
  {"parameter_name": "pressure", "min_value": 4, "max_value": 6, "weight": 25, "ideal_value": 5},
  {"parameter_name": "power", "min_value": 0, "max_value": 250, "weight": 25, "ideal_value": 200},
  {"parameter_name": "current", "min_value": 0, "max_value": 10, "weight": 25, "ideal_value": 5}
]
```

---

### 1.8 Health Score Endpoints

#### Calculate Health Score
```
POST /devices/{device_id}/health-score
```
**Description:** Calculates device health score based on current telemetry values using configured health parameters.

**Request Body:**
```json
{
  "values": {
    "temperature": 45.9,
    "pressure": 5.2,
    "power": 198.7
  },
  "machine_state": "RUNNING"
}
```

**Machine State Values:**
- `RUNNING`: Full health calculation
- `OFF`, `IDLE`, `UNLOAD`, `POWER CUT`: Returns standby status

**Example Response:**
```json
{
  "device_id": "COMPRESSOR-001",
  "health_score": 85.5,
  "status": "healthy",
  "parameter_scores": {
    "temperature": 95,
    "pressure": 90,
    "power": 75
  }
}
```

---

### 1.9 Performance Trends Endpoints

#### Get Performance Trends
```
GET /devices/{device_id}/performance-trends
```
**Description:** Gets materialized performance trends (health/uptime) over time.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| metric | string | "health" | Metric type: 'health' or 'uptime' |
| range | string | "24h" | Time range: '30m', '1h', '6h', '24h', '7d', '30d' |

---

## 2. Data Service (Port 8081)

**Base URL:** `http://localhost:8081/api/v1`

**Purpose:** Handles telemetry data ingestion, storage, and retrieval from InfluxDB. Also provides WebSocket for live telemetry.

### 2.1 Health Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Returns health status including InfluxDB and MQTT connection status |

---

### 2.2 Telemetry Endpoints

#### Get Telemetry Data
```
GET /telemetry/{device_id}
```
**Description:** Retrieves historical telemetry data for a device from InfluxDB.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| start_time | datetime | Start of time range (ISO8601) |
| end_time | datetime | End of time range (ISO8601) |
| fields | string | Comma-separated fields to return (e.g., "voltage,current") |
| aggregate | string | Aggregation function: 'mean', 'sum', 'min', 'max' |
| interval | string | Aggregation interval (e.g., '5m', '1h') |
| limit | integer | Max records to return (default: 1000, max: 10000) |

**Example Request:**
```bash
curl "http://localhost:8081/api/v1/telemetry/COMPRESSOR-001?start_time=2026-03-01T00:00:00Z&end_time=2026-03-04T12:00:00Z&fields=voltage,current,power&aggregate=mean&interval=1h"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "device_id": "COMPRESSOR-001",
        "timestamp": "2026-03-04T10:00:00Z",
        "voltage": 231.4,
        "current": 0.86,
        "power": 198.7
      }
    ],
    "total": 1,
    "device_id": "COMPRESSOR-001"
  },
  "timestamp": "2026-03-04T12:00:00Z"
}
```

---

#### Get Telemetry Stats
```
GET /stats/{device_id}
```
**Description:** Returns statistical summary (min, max, avg, last) of telemetry data for a device over a time range.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| start_time | datetime | Start of time range |
| end_time | datetime | End of time range |

---

#### Custom Query
```
POST /query
```
**Description:** Advanced query endpoint for complex telemetry retrieval.

**Request Body:**
```json
{
  "device_id": "COMPRESSOR-001",
  "start_time": "2026-03-01T00:00:00Z",
  "end_time": "2026-03-04T12:00:00Z",
  "fields": ["voltage", "current", "power"],
  "aggregate": "mean",
  "interval": "1h",
  "limit": 100
}
```

---

### 2.3 WebSocket Endpoints

#### Live Telemetry WebSocket
```
WS /ws/telemetry/{device_id}
```
**Description:** WebSocket connection for receiving real-time telemetry updates.

**Connection URL:** `ws://localhost:8081/ws/telemetry/{device_id}`

**Features:**
- Real-time push of telemetry data
- Heartbeat/ping support for connection keep-alive
- Connection limiting

**Client Messages:**
```json
// Ping to keep alive
{"type": "ping"}

// Subscribe confirmation
{"type": "subscribe"}
```

**Server Messages:**
```json
// Telemetry update
{
  "type": "telemetry",
  "device_id": "COMPRESSOR-001",
  "timestamp": "2026-03-04T12:00:00Z",
  "data": {
    "voltage": 231.4,
    "current": 0.86,
    "power": 198.7
  }
}

// Heartbeat
{
  "type": "heartbeat",
  "timestamp": "2026-03-04T12:00:00Z"
}

// Connection confirmation
{
  "type": "connected",
  "device_id": "COMPRESSOR-001",
  "timestamp": "2026-03-04T12:00:00Z"
}
```

---

#### WebSocket Stats
```
GET /ws/stats
```
**Description:** Returns WebSocket connection statistics.

**Example Response:**
```json
{
  "total_connections": 5,
  "device_subscriptions": {
    "COMPRESSOR-001": 2,
    "COMPRESSOR-002": 3
  },
  "max_connections": 100
}
```

---

## 3. Rule Engine Service (Port 8002)

**Base URL:** `http://localhost:8002/api/v1`

**Purpose:** Manages alert rules, evaluates telemetry against rules, and sends notifications when rules are triggered.

### 3.1 Health Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check endpoint |
| GET | `/ready` | Readiness check |

---

### 3.2 Rules Endpoints

#### List Rules
```
GET /rules
```
**Description:** Retrieves a paginated list of all rules with optional filtering.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| tenant_id | string | Filter by tenant |
| status | string | Filter by status: 'active', 'paused', 'archived' |
| device_id | string | Filter by device ID |
| page | integer | Page number |
| page_size | integer | Items per page |

---

#### Create Rule
```
POST /rules
```
**Description:** Creates a new alert rule.

**Request Body:**
```json
{
  "rule_name": "High Temperature Alert",
  "description": "Alert when temperature exceeds threshold",
  "device_ids": ["COMPRESSOR-001", "COMPRESSOR-002"],
  "condition": {
    "parameter": "temperature",
    "operator": ">",
    "threshold": 80
  },
  "notification_channels": ["email", "webhook"],
  "status": "active"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| rule_name | string | Yes | Name of the rule |
| description | string | No | Description of what the rule does |
| device_ids | array | No | List of device IDs to apply rule to |
| condition | object | Yes | The condition to evaluate |
| condition.parameter | string | Yes | Telemetry parameter to check |
| condition.operator | string | Yes | Operator: '>', '<', '>=', '<=', '==', '!=' |
| condition.threshold | number | Yes | Threshold value |
| notification_channels | array | No | Channels: 'email', 'webhook', 'sms' |
| status | string | No | Rule status: 'active', 'paused', 'archived' |

---

#### Get Rule by ID
```
GET /rules/{rule_id}
```
**Description:** Retrieves a specific rule by UUID.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| rule_id | uuid | Unique rule identifier |

---

#### Update Rule
```
PUT /rules/{rule_id}
```
**Description:** Updates an existing rule.

---

#### Update Rule Status
```
PATCH /rules/{rule_id}/status
```
**Description:** Quickly update just the status of a rule (activate, pause, archive).

**Request Body:**
```json
{
  "status": "paused"
}
```

---

#### Delete Rule
```
DELETE /rules/{rule_id}
```
**Description:** Deletes a rule. Can perform soft delete (archives) or hard delete.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| soft | boolean | true | Soft delete vs permanent removal |

---

#### Evaluate Rules (Manual Trigger)
```
POST /rules/evaluate
```
**Description:** Manually trigger rule evaluation for a telemetry payload. This is also called by data-service when telemetry arrives.

**Request Body:**
```json
{
  "device_id": "COMPRESSOR-001",
  "timestamp": "2026-03-04T12:00:00Z",
  "values": {
    "temperature": 85.5,
    "pressure": 5.2,
    "power": 198.7
  }
}
```

**Example Response:**
```json
{
  "rules_evaluated": 5,
  "rules_triggered": 1,
  "results": [
    {
      "rule_id": "uuid-of-rule",
      "rule_name": "High Temperature Alert",
      "triggered": true,
      "message": "Temperature 85.5 exceeds threshold 80"
    }
  ]
}
```

---

### 3.3 Alerts Endpoints

#### List Alerts
```
GET /alerts
```
**Description:** Retrieves a paginated list of all alerts.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| tenant_id | string | Filter by tenant |
| device_id | string | Filter by device |
| rule_id | uuid | Filter by rule |
| status | string | Filter by status: 'open', 'acknowledged', 'resolved' |
| page | integer | Page number |
| page_size | integer | Items per page |

---

#### Acknowledge Alert
```
PATCH /alerts/{alert_id}/acknowledge
```
**Description:** Marks an alert as acknowledged (seen but not yet resolved).

**Request Body:**
```json
{
  "acknowledged_by": "operator@example.com"
}
```

---

#### Resolve Alert
```
PATCH /alerts/{alert_id}/resolve
```
**Description:** Marks an alert as resolved/cleared.

---

### 3.4 Activity/Events Endpoints

#### List Activity Events
```
GET /alerts/events
```
**Description:** Lists activity events (rule created, triggered, deleted, etc.) for audit trail.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| tenant_id | string | Filter by tenant |
| device_id | string | Filter by device |
| event_type | string | Filter by event type |
| page | integer | Page number |
| page_size | integer | Items per page |

**Event Types:** 'rule_created', 'rule_triggered', 'rule_updated', 'rule_deleted', 'alert_acknowledged', 'alert_resolved'

---

#### Get Unread Event Count
```
GET /alerts/events/unread-count
```
**Description:** Returns count of unread activity events for notification badges.

---

#### Mark All Events Read
```
PATCH /alerts/events/mark-all-read
```
**Description:** Marks all activity events as read for a tenant/device.

---

#### Clear Event History
```
DELETE /alerts/events
```
**Description:** Clears activity event history.

---

#### Get Activity Summary
```
GET /alerts/events/summary
```
**Description:** Returns system-wide activity summary for dashboard cards.

**Example Response:**
```json
{
  "success": true,
  "data": {
    "active_alerts": 5,
    "alerts_triggered": 150,
    "alerts_cleared": 145,
    "rules_created": 10,
    "rules_updated": 25,
    "rules_deleted": 3
  }
}
```

---

## 4. Reporting Service (Port 8085)

**Base URL:** `http://localhost:8085/api/v1`

**Purpose:** Generates energy consumption reports, comparison reports, manages scheduled reports, and handles tariff configurations.

### 4.1 Health Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/ready` | Readiness check |

---

### 4.2 Energy Reports Endpoints

#### Create Consumption Report
```
POST /reports/consumption
```
**Description:** Creates an energy consumption report for specified devices over a date range. Runs asynchronously in background.

**Request Body:**
```json
{
  "tenant_id": "tenant-001",
  "device_ids": ["COMPRESSOR-001", "COMPRESSOR-002"],
  "start_date": "2026-03-01",
  "end_date": "2026-03-31",
  "group_by": "day"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tenant_id | string | Yes | Tenant identifier |
| device_ids | array | Yes | List of device IDs, or ["all"] for all devices |
| start_date | date | Yes | Start date (inclusive) |
| end_date | date | Yes | End date (inclusive) |
| group_by | string | No | Grouping: 'hour', 'day', 'week', 'month' (default: 'day') |

**Example Response:**
```json
{
  "report_id": "uuid-of-report",
  "status": "pending",
  "created_at": "2026-03-04T12:00:00Z"
}
```

**Notes:**
- Date range must be at least 24 hours apart
- Use "all" in device_ids to automatically include all tenant devices
- Report generation is asynchronous - use report_id to check status and retrieve results

---

### 4.3 Comparison Reports Endpoints

#### Create Comparison Report
```
POST /reports
```
or
```
POST /reports/
```
**Description:** Creates comparison reports (machine vs machine, period vs period, etc.).

**Request Body:**
```json
{
  "tenant_id": "tenant-001",
  "comparison_type": "machine_vs_machine",
  "machine_a_id": "COMPRESSOR-001",
  "machine_b_id": "COMPRESSOR-002",
  "start_date": "2026-03-01",
  "end_date": "2026-03-31"
}
```

**Comparison Types:**
- `machine_vs_machine`: Compare two machines' energy usage
- `period_vs_period`: Compare same machine across two time periods
- `device_vs_average`: Compare device against tenant average

---

### 4.4 Report Management Endpoints

#### List Report History
```
GET /reports/history
```
**Description:** Lists all reports for a tenant.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| tenant_id | string | Yes | Tenant identifier |
| limit | integer | No | Number of reports (default: 20, max: 100) |
| offset | integer | No | Offset for pagination |
| report_type | string | No | Filter by report type: 'consumption', 'comparison' |

---

#### Get Report Status
```
GET /reports/{report_id}/status
```
**Description:** Check the status of a report generation job.

**Example Response:**
```json
{
  "report_id": "uuid-of-report",
  "status": "completed",
  "progress": 100,
  "error_code": null,
  "error_message": null
}
```

**Status Values:** 'pending', 'processing', 'completed', 'failed'

---

#### Get Report Result
```
GET /reports/{report_id}/result
```
**Description:** Retrieves the generated report data (JSON format).

**Note:** Report must be 'completed' status before calling this endpoint.

---

#### Download Report PDF
```
GET /reports/{report_id}/download
```
**Description:** Downloads the generated report as a PDF file.

**Response:** Binary PDF file with Content-Disposition header for download.

---

### 4.5 Scheduled Reports Endpoints

#### Create Schedule
```
POST /reports/schedules
```
**Description:** Creates a recurring report schedule.

**Request Body:**
```json
{
  "report_type": "consumption",
  "frequency": "weekly",
  "day_of_week": "monday",
  "params_template": {
    "device_ids": ["COMPRESSOR-001"],
    "group_by": "day"
  }
}
```

**Frequency Values:** 'daily', 'weekly', 'monthly'

---

#### List Schedules
```
GET /reports/schedules
```
**Description:** Lists all scheduled reports for a tenant.

---

#### Delete Schedule
```
DELETE /reports/schedules/{schedule_id}
```
**Description:** Deactivates a scheduled report.

---

### 4.6 Tariff Endpoints

#### Create/Update Tariff
```
POST /tariffs/
```
**Description:** Creates or updates tariff rates for a tenant (used for cost calculations).

**Request Body:**
```json
{
  "tenant_id": "tenant-001",
  "energy_rate_per_kwh": 0.12,
  "demand_charge_per_kw": 15.00,
  "reactive_penalty_rate": 0.02,
  "fixed_monthly_charge": 50.00,
  "power_factor_threshold": 0.85,
  "currency": "USD"
}
```

---

#### Get Tariff
```
GET /tariffs/{tenant_id}
```
**Description:** Retrieves tariff configuration for a tenant.

---

## 5. Analytics Service

**Base URL:** `/api/v1` (internal service, no external port exposed by default)

**Purpose:** Provides advanced analytics including forecasting, anomaly detection, and failure prediction using ML models.

### 5.1 Analytics Job Endpoints

#### Run Analytics
```
POST /analytics/run
```
**Description:** Submits an analytics job for asynchronous processing.

**Request Body:**
```json
{
  "analysis_type": "forecasting",
  "model_name": "prophet",
  "device_id": "COMPRESSOR-001",
  "date_range_start": "2026-01-01T00:00:00Z",
  "date_range_end": "2026-03-01T00:00:00Z",
  "parameters": {
    "forecast_horizon": "7d",
    "confidence_level": 0.95
  }
}
```

**Analysis Types:**
- `forecasting`: Time series forecasting (uses Prophet or ARIMA)
- `anomaly_detection`: Detect anomalies (uses Isolation Forest or Autoencoder)
- `failure_prediction`: Predict failures (uses Random Forest or Gradient Boosting)

**Example Response:**
```json
{
  "job_id": "uuid-of-job",
  "status": "pending",
  "message": "Job queued successfully"
}
```

---

#### Get Job Status
```
GET /analytics/status/{job_id}
```
**Description:** Check the status of an analytics job.

---

#### Get Job Results
```
GET /analytics/results/{job_id}
```
**Description:** Retrieve results of a completed analytics job.

---

#### List Jobs
```
GET /analytics/jobs
```
**Description:** Lists analytics jobs with optional filtering.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status: 'pending', 'running', 'completed', 'failed' |
| device_id | string | Filter by device |
| limit | integer | Number of jobs to return |
| offset | integer | Pagination offset |

---

#### Get Supported Models
```
GET /analytics/models
```
**Description:** Lists all available analytics models by type.

**Example Response:**
```json
{
  "anomaly_detection": ["isolation_forest", "autoencoder"],
  "failure_prediction": ["random_forest", "gradient_boosting"],
  "forecasting": ["prophet", "arima"]
}
```

---

#### List Available Datasets
```
GET /analytics/datasets
```
**Description:** Lists exported datasets available in S3/MinIO for a device.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| device_id | string | Yes | Device identifier |

---

## 6. Data Export Service

**Base URL:** Internal service

**Purpose:** Continuously exports telemetry data to S3/MinIO for long-term storage and analytics.

### 6.1 Health Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/ready` | Readiness check (verifies worker, checkpoint store, S3) |

---

### 6.2 Export Endpoints

#### Trigger On-Demand Export
```
POST /api/v1/exports/run
```
**Description:** Manually triggers an export for a specific device or all devices.

**Request Body:**
```json
{
  "device_id": "COMPRESSOR-001"
}
```

If device_id is omitted, exports all devices.

---

#### Get Export Status
```
GET /api/v1/exports/status/{device_id}
```
**Description:** Check the export status for a device.

---

## Summary Table

| Service | Port | Main Endpoints |
|---------|------|----------------|
| Device Service | 8000 | `/api/v1/devices`, `/api/v1/shifts`, `/api/v1/health-config`, `/api/v1/health-score` |
| Data Service | 8081 | `/api/v1/telemetry`, `/api/v1/stats`, `/ws/telemetry` |
| Rule Engine | 8002 | `/api/v1/rules`, `/api/v1/alerts`, `/api/v1/alerts/events` |
| Reporting | 8085 | `/api/v1/reports`, `/api/v1/reports/consumption`, `/api/v1/tariffs` |
| Analytics | - | `/api/v1/analytics/run`, `/api/v1/analytics/status`, `/api/v1/analytics/models` |
| Data Export | - | `/api/v1/exports/run`, `/api/v1/exports/status` |

---

## Common Query Parameters

Many endpoints support these common parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| tenant_id | string | Multi-tenancy filter (used in most endpoints) |
| page | integer | Page number for paginated responses (default: 1) |
| page_size | integer | Items per page (default: 20, max: 100) |

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  },
  "timestamp": "2026-03-04T12:00:00Z"
}
```

**Common Error Codes:**
- `DEVICE_NOT_FOUND`: Device doesn't exist
- `RULE_NOT_FOUND`: Rule doesn't exist
- `VALIDATION_ERROR`: Request validation failed
- `QUERY_ERROR`: Database/query error
- `INTERNAL_ERROR`: Unexpected server error
