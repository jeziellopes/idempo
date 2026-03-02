# idempo — Observability Plan

**Related:** [SPEC.md](SPEC.md) · [RUNBOOK.md](RUNBOOK.md) · [DEPLOYMENT.md](DEPLOYMENT.md)

---

## Stack

| Tool | Role |
|---|---|
| Prometheus | Metrics collection and storage |
| Grafana | Metrics dashboards and alerting |
| Jaeger | Distributed tracing UI |
| OpenTelemetry SDK | Instrumentation in all NestJS services |
| Loki | Log aggregation |
| Pino | Structured JSON logger (per service) |

---

## 1. Metrics (Prometheus + Grafana)

Each NestJS service exposes `/metrics` in Prometheus text format via `@willsoto/nestjs-prometheus`.

### 1.1 Metrics Catalogue

| Metric | Type | Labels | Emitted by |
|---|---|---|---|
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status` | All services |
| `kafka_consumer_lag` | Gauge | `topic`, `consumer_group` | All consumers |
| `event_processing_duration_seconds` | Histogram | `event_type`, `service` | All consumers |
| `retry_count_total` | Counter | `service`, `target` | All HTTP clients |
| `circuit_breaker_state` | Gauge | `service`, `target`, `state` | Marketplace, Leaderboard |
| `saga_duration_seconds` | Histogram | `saga_type`, `outcome` | Marketplace Service |
| `dlq_message_count_total` | Counter | `topic` | All DLQ consumers |
| `stamp_spend_total` | Counter | — | Game Service |
| `idempotency_hit_total` | Counter | `service`, `key_type` | Game Service, all consumers |

### 1.2 Grafana Dashboards

| Dashboard | Key panels |
|---|---|
| **Service Health Overview** | Request rate, error rate, p50/p95/p99 latency per service |
| **Saga Funnel** | Completion rate vs compensation rate, saga duration histogram |
| **Kafka Lag** | Consumer lag per topic/consumer group, DLQ accumulation rate |
| **Circuit Breaker Timeline** | State transitions over time per breaker target |
| **Stamp Economy** | Stamps spent per match, idempotency hit rate, duplicate request rate |

---

## 2. Distributed Tracing (Jaeger / OpenTelemetry)

All services instrument with `@opentelemetry/sdk-node`. Trace propagation uses the `traceparent` W3C header for HTTP and a `tracing` Kafka message header for async hops.

### 2.1 Example Trace — Arena Action

```
Frontend (WS action)
  └─ API Gateway (5 ms)
       └─ Game Service (12 ms)
            └─ Kafka publish player-actions (2 ms)
                 └─ Combat Service consumer (8 ms)
                      └─ Kafka publish match-events (2 ms)
                           └─ Reward Service consumer (15 ms)
                                └─ Wallet Service credit (6 ms)
```

### 2.2 Example Trace — Trade Saga

```
Buyer → POST /marketplace/trades
  └─ Marketplace Service (orchestrator)
       ├─ ReserveFundsCommand → Wallet Service (18 ms)
       ├─ LockItemCommand → Inventory Service (12 ms)
       ├─ TransferFundsCommand → Wallet Service (20 ms)
       └─ TransferItemCommand → Inventory Service (14 ms)
```

### 2.3 Required Span Attributes

Every span must carry:

| Attribute | Source |
|---|---|
| `service.name` | Service name (env var) |
| `idempo.correlation_id` | Injected by API Gateway |
| `idempo.player_id` | From JWT claim |
| `idempo.match_id` / `trade_id` | From request context |
| `idempo.action_id` | For sealed actions |

---

## 3. Structured Logging (Loki + Pino)

Every log entry is JSON with mandatory fields:

```json
{
  "level": "info",
  "timestamp": "2026-03-02T14:00:00Z",
  "service": "marketplace-service",
  "requestId": "uuid",
  "correlationId": "uuid",
  "eventId": "uuid",
  "playerId": "uuid",
  "traceId": "uuid",
  "spanId": "uuid",
  "msg": "Trade saga step FUNDS_RESERVING completed"
}
```

### 3.1 Required Log Events per Pattern

| Pattern | Event logged | Level |
|---|---|---|
| Idempotency hit (HTTP) | `Duplicate request rejected` + `actionId` | `debug` |
| Idempotency hit (Kafka) | `Event already processed` + `eventId` | `debug` |
| Stamp sealed | `Stamp spent` + `stampId`, `playerId` | `info` |
| Saga state transition | State + `tradeId` | `info` |
| Saga compensation started | `COMPENSATING_FULL` + `tradeId`, reason | `warn` |
| Circuit breaker opened | Target service + failure rate | `warn` |
| DLQ routing | Topic + `eventId` + error message | `error` |

---

## 4. Alerting (Grafana)

| Alert | Condition | Severity |
|---|---|---|
| High saga compensation rate | `rate(saga_duration_seconds{outcome="compensated"}[5m]) > 0.1` | Warning |
| Circuit breaker open | `circuit_breaker_state{state="open"} == 1` | Critical |
| DLQ accumulating | `rate(dlq_message_count_total[5m]) > 0` | Warning |
| High Kafka lag | `kafka_consumer_lag > 5000` | Warning |
| Service error rate | `rate(http_request_duration_seconds{status=~"5.."}[5m]) > 0.05` | Critical |

---

*For failure injection scenarios that exercise these metrics, see [RUNBOOK.md](RUNBOOK.md).*
