# idempo — Deployment & Scaling

**Related:** [SPEC.md](SPEC.md) · [OBSERVABILITY.md](OBSERVABILITY.md)

---

## 1. Environments

| Environment | Infrastructure | How to run |
|---|---|---|
| **Local dev** | Docker Compose | `docker compose up` |
| **Local k8s** | k3s | `kubectl apply -k infra/k8s/overlays/local` |
| **Cloud** | Single-region Kubernetes (EKS / GKE) | `kubectl apply -k infra/k8s/overlays/cloud` |

---

## 2. Container Strategy

Each service is a separate Docker image built from the monorepo:

```
infra/docker/<service-name>/Dockerfile
```

Images are built via **Nx affected** — only services changed in a given commit are rebuilt in CI, keeping build times minimal.

```bash
# Build only affected services
nx affected --target=docker-build --base=main
```

---

## 3. Kubernetes Resources

### 3.1 HPA Example — Marketplace Service

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: marketplace-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: marketplace-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### 3.2 Scaling Configuration per Service

| Service | Scale trigger | Min replicas | Max replicas | Notes |
|---|---|---|---|---|
| Game Service | CPU | 2 | 8 | Stateless WebSocket server; sticky sessions via Gateway |
| Combat Service | CPU | 2 | 8 | Kafka consumer; scale with lag |
| Reward Service | CPU | 1 | 4 | Low throughput — one event per match |
| Wallet Service | CPU | 2 | 6 | Strong consistency — optimistic lock handles contention |
| Inventory Service | CPU | 1 | 4 | Moderate throughput |
| Marketplace Service | RPS (KEDA) | 2 | 10 | KEDA scales on trade request rate |
| Leaderboard Service | CPU | 1 | 4 | Mostly reads; Redis absorbs load |
| Notification Service | CPU | 1 | 4 | Stateless WebSocket push |
| API Gateway | RPS | 2 | 8 | Front door — scale aggressively |

---

## 4. Kafka Partitioning

All topics partitioned by `playerId` to guarantee per-player event ordering.

```
Partition key:        playerId
Partitions per topic: 12  (scale to 24 as needed)
Replication factor:   3
Min in-sync replicas: 2
```

### Topic Configuration

| Topic | Partitions | Retention | Notes |
|---|---|---|---|
| `player-actions` | 12 | 7 days | Keyed by `playerId` |
| `match-events` | 12 | 30 days | Keyed by `matchId` |
| `economy-events` | 12 | 30 days | Keyed by `tradeId` or `playerId` |
| `leaderboard-events` | 4 | 3 days | Low volume |
| `*.dlq` | 3 | 14 days | Manual inspection and replay |

---

## 5. Database Scaling

| Database | Primary strategy | Future strategy |
|---|---|---|
| `wallet_db` | Vertical (predictable write pattern) | Horizontal read replicas for ledger reporting |
| `game_db` | Vertical | Read replicas for match history queries |
| `marketplace_db` | Vertical | Partition `trades` by `created_at` monthly once table exceeds ~50M rows |
| `inventory_db` | Vertical | Read replicas for browsing queries |
| Redis | Single node (dev) | Redis Cluster — 3 shards (production) |

---

## 6. Namespace Layout (Kubernetes)

All v1 services run in the `idempo` namespace:

```
idempo/
├── api-gateway
├── game-service
├── combat-service
├── reward-service
├── wallet-service
├── inventory-service
├── marketplace-service
├── leaderboard-service
├── notification-service
├── web
└── dlq-admin
```

Infrastructure components run in dedicated namespaces:

```
kafka/         — Kafka + ZooKeeper (or KRaft)
monitoring/    — Prometheus, Grafana, Jaeger, Loki
databases/     — PostgreSQL instances × 4, Redis
```

---

## 7. Local Development Quick-Start

```bash
# Clone and install
git clone https://github.com/your-org/idempo
cd idempo
pnpm install

# Start all infrastructure (Kafka, PostgreSQL ×4, Redis, Jaeger, Prometheus, Grafana)
docker compose up -d

# Run all services in dev mode (hot reload)
nx run-many --target=serve --all

# Open the game
open http://localhost:3001   # Next.js frontend
open http://localhost:3000   # Grafana
open http://localhost:16686  # Jaeger
open http://localhost:8080   # DLQ Admin UI
```

---

*See [OBSERVABILITY.md](OBSERVABILITY.md) for the full metrics and alerting configuration.*
