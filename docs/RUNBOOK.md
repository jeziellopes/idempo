# idempo — Demo Runbook

**Related:** [PRD.md](PRD.md) · [OBSERVABILITY.md](OBSERVABILITY.md) · [DEPLOYMENT.md](DEPLOYMENT.md)

Each scenario below must be demonstrable and observable in Grafana / Jaeger against a running local stack (`docker compose up`).

---

## Prerequisites

**Temporary Authentication Note:** The web UI currently uses auto-generated JWT tokens for streamlined testing. When users enter a username, a token is automatically generated with the hardcoded password "idempo". This is a temporary implementation — production-ready authentication (signup, login UI, session management) will be implemented in a future iteration.

```bash
# Start full local stack
docker compose up -d

# Verify all services healthy
docker compose ps

# Open observability UIs
open http://localhost:3000   # Web UI (or Grafana if observability enabled)
open http://localhost:16686  # Jaeger
open http://localhost:9090   # Prometheus
open http://localhost:8080   # DLQ Admin UI (if implemented)
```

---

## Scenario 1 — Sealed Attack (Stamp Idempotency)

**What it demonstrates:** `X-Idempotency-Key` enforcement · `UNIQUE(action_id)` constraint · Stamp balance atomic deduction

**Setup:** Player spends a Stamp to seal an attack. Client sends the same action twice with identical `actionId` (simulating a retry under lag).

```bash
ACTION_ID=$(uuidgen)

# First submission
curl -X POST http://localhost:4000/api/matches/{matchId}/actions \
  -H "Authorization: Bearer $JWT" \
  -H "X-Idempotency-Key: $ACTION_ID" \
  -d '{"type":"attack","targetId":"...","useStamp":true}'

# Duplicate (same ACTION_ID) — should return original response, no second effect
curl -X POST http://localhost:4000/api/matches/{matchId}/actions \
  -H "Authorization: Bearer $JWT" \
  -H "X-Idempotency-Key: $ACTION_ID" \
  -d '{"type":"attack","targetId":"...","useStamp":true}'
```

**Expected:**
- Second request returns the original response (HTTP 200, same body)
- `player_actions` table has exactly one row for `$ACTION_ID`
- `stamp_balance` decremented exactly once

**Observable:**
- No duplicate `PlayerAttackedEvent` in Kafka (`kafka-ui` or `kcat`)
- `stamp_balance` in `wallet_db` unchanged after second request
- Jaeger: single span for the action, second request returns from cache

---

## Scenario 2 — Wallet Service Down (Circuit Breaker)

**What it demonstrates:** Circuit breaker CLOSED → OPEN → HALF_OPEN → CLOSED lifecycle

**Setup:** Kill the Wallet Service pod while trades are in flight.

```bash
# Kill wallet service
docker compose stop wallet-service

# Attempt trades — first few will timeout, then breaker opens
for i in $(seq 1 20); do
  curl -X POST http://localhost:4000/api/marketplace/trades \
    -H "Authorization: Bearer $JWT" \
    -d '{"listingId":"..."}' &
done
wait
```

**Expected:**
- First requests hang up to 3 s (circuit CLOSED, awaiting timeout)
- After failure threshold (50% over 10 s), subsequent requests return `503 Service Unavailable` immediately (< 50 ms)
- After cooldown, circuit enters HALF_OPEN and allows one probe request through

**Observable:**
- Grafana: `circuit_breaker_state{target="wallet", state="open"} = 1`
- Circuit Breaker State Timeline dashboard shows transition timestamps

```bash
# Restore wallet and watch breaker recover
docker compose start wallet-service
```

---

## Scenario 3 — Kafka Paused (Consumer Lag)

**What it demonstrates:** At-least-once delivery · Consumer lag draining · No duplicate processing after restart

**Setup:** Stop Kafka broker for 30 seconds, then restart.

```bash
docker compose stop kafka

# Submit actions during the pause — they will be queued client-side
sleep 30

docker compose start kafka
```

**Expected:**
- During pause: services queue internally, API returns appropriate errors or queues requests
- After restart: consumer lag drains without message loss or double-processing
- No duplicate rewards or actions applied

**Observable:**
- Grafana: `kafka_consumer_lag` spikes then recovers to 0
- `processed_events` table confirms each `event_id` appears exactly once

---

## Scenario 4 — Slow Database (Latency Visibility)

**What it demonstrates:** Distributed tracing identifying slow spans · Latency histogram increase · Potential circuit breaker trip

**Setup:** Inject artificial latency into Wallet DB.

```bash
# Connect to wallet_db and inject sleep
docker compose exec wallet-db psql -U idempo -d wallet_db -c \
  "CREATE OR REPLACE RULE slow_rule AS ON SELECT TO wallets DO ALSO SELECT pg_sleep(2);"
```

**Expected:**
- Trade saga slows proportionally
- `http_request_duration_seconds` p99 increases noticeably
- Circuit breaker to Wallet may trip if latency exceeds 3 s threshold

**Observable:**
- Grafana: Latency histogram p99 spike on `marketplace-service`
- Jaeger: Trace shows `wallet-service:debit` span taking 2+ s

```bash
# Remove the injection
docker compose exec wallet-db psql -U idempo -d wallet_db -c \
  "DROP RULE IF EXISTS slow_rule ON wallets;"
```

---

## Scenario 5 — Trade Fails Mid-Saga (Compensation)

**What it demonstrates:** Saga compensation path · Full rollback across 3 services · Buyer notification on failure

**Setup:** Force an error in the `TransferFundsCommand` handler via environment flag.

```bash
# Enable fault injection on marketplace service
docker compose exec marketplace-service \
  sh -c 'kill -USR1 1'  # or set env FAULT_INJECT_TRANSFER_FUNDS=true and restart

# Initiate a trade
curl -X POST http://localhost:4000/api/marketplace/trades \
  -H "Authorization: Bearer $JWT" \
  -d '{"listingId":"..."}'
```

**Expected:**
- Saga enters `COMPENSATING_FULL` state
- `ReleaseFundsCommand` and `UnlockItemCommand` emitted
- Buyer's wallet balance fully restored
- Item unlocked and listing returns to `ACTIVE`
- Trade status = `FAILED`
- Buyer receives WebSocket push notification: `trade.failed`

**Observable:**
- `saga_log` table: state transitions visible (`FUNDS_TRANSFERRING` → `COMPENSATING_FULL` → `FAILED`)
- Grafana: `saga_duration_seconds{outcome="compensated"}` counter increments
- Jaeger: Full span tree showing compensation commands

---

## Scenario 6 — DLQ Accumulation

**What it demonstrates:** Retry exhaustion · Dead Letter Queue routing · Consumer unblocking

**Setup:** Publish a malformed message directly to `economy-events`.

```bash
# Publish a poison message (missing required fields)
docker compose exec kafka kafka-console-producer \
  --bootstrap-server localhost:9092 \
  --topic economy-events \
  <<< '{"broken":"message","missingEventId":true}'
```

**Expected:**
- Consumer fails to deserialise/validate the message
- Retries 3 times with exponential backoff
- Message routed to `economy-events.dlq` after 3rd failure
- Valid messages on `economy-events` continue processing unblocked

**Observable:**
- Grafana: `dlq_message_count_total{topic="economy-events"}` increments to 1
- DLQ Admin UI (`http://localhost:8080`): message visible with error details, retry count = 3
- Manual replay button available in Admin UI

---

*This runbook is the authoritative reference for failure demonstration scenarios. See [OBSERVABILITY.md](OBSERVABILITY.md) for the full metrics and dashboard catalogue.*
