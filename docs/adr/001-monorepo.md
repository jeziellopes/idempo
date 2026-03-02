# ADR-001 — Monorepo with Nx

**Date:** 2026-03-02  
**Status:** Accepted  
**Deciders:** idempo core team

---

## Context

idempo is composed of 9 NestJS microservices, 1 Next.js frontend, and 5 shared packages (contracts, kafka, idempotency, observability, circuit-breaker). We need to decide how to organise these in source control.

The two realistic options are:
1. **Monorepo** managed by [Nx](https://nx.dev) with pnpm workspaces
2. **Multi-repo** — one Git repository per service/package

---

## Decision

**Use a monorepo managed by Nx.**

---

## Rationale

| Factor | Monorepo (Nx) | Multi-repo |
|---|---|---|
| Shared event contracts | Single `@idempo/contracts` package, zero drift | Copy-paste or NPM publish overhead |
| Shared utilities | `@idempo/idempotency`, `@idempo/observability` trivially shared | Versioning complexity per library |
| Atomic cross-service commits | Yes — event schema + consumer updated together | Coordinated PRs across repos needed |
| CI/CD | Nx affected graph — only rebuild what changed | Full rebuild per repo on each push |
| Team size | Optimal for 1–3 engineers | Scales better at 5+ teams with ownership boundaries |
| Onboarding | Single clone, single `pnpm install` | N repos to configure |
| Deployment isolation | Services still containerised independently | Same |

---

## Trade-offs Accepted

- All services share the same CI pipeline trigger points — mitigated by Nx affected detection, which rebuilds only services touched by a given commit.
- A single Git history — acceptable for a project with a single team and clear service boundaries enforced by `@nx/enforce-module-boundaries` lint rules.

---

## When to Revisit

Switch to multi-repo **only if:**
- Separate teams own separate services with independent release cadences, **and**
- Different technology stacks are adopted per service (e.g., a Go service alongside NestJS)

Neither condition applies to idempo v1.

---

## Consequences

- New services are scaffolded with `nx generate @idempo/service <name>` — they inherit Kafka, observability, idempotency, and circuit-breaker wiring automatically.
- `packages/contracts` is the single source of truth for all event schemas; schema changes and their consumers are always committed together.
- CI pipelines use `nx affected` to avoid rebuilding unchanged services.
