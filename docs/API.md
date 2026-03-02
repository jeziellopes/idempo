# idempo — API Contracts

**Related:** [SPEC.md](SPEC.md) · [GAME.md](GAME.md)

All REST endpoints are routed through the API Gateway at `http://localhost:4000/api`. Every mutating request requires a `Authorization: Bearer <jwt>` header. The gateway injects a `X-Correlation-Id` header on all forwarded requests.

---

## Table of Contents

0. [Gateway](#0-gateway)
1. [Authentication](#1-authentication)
2. [Matches](#2-matches)
3. [Player Actions](#3-player-actions)
4. [Wallet](#4-wallet)
5. [Inventory](#5-inventory)
6. [Marketplace — Listings](#6-marketplace--listings)
7. [Marketplace — Trades](#7-marketplace--trades)
8. [Leaderboard](#8-leaderboard)
9. [WebSocket Events](#9-websocket-events)

---

## 0. Gateway

### `GET /health` — Liveness / readiness probe

```json
// Response 200
{ "status": "ok", "uptime": 42.3 }
```

Used by Kubernetes liveness and readiness probes. No authentication required.

---

## 1. Authentication

### `POST /auth/login`

```json
// Request
{ "username": "string", "password": "string" }

// Response 200
{ "accessToken": "jwt", "expiresIn": 900 }

// Response 400 — validation error
{ "error": "VALIDATION_ERROR", "detail": "password must be a string", "correlationId": "uuid" }

// Response 401
{ "error": "UNAUTHORIZED", "detail": "Invalid credentials.", "correlationId": "uuid" }
```

### `POST /auth/refresh` — Refresh access token

> **Phase 0 stub:** returns `501 Not Implemented`. Full implementation arrives in Phase 1 (Identity Service).

```json
// Request
{ "refreshToken": "string" }

// Response 200
{ "accessToken": "jwt", "expiresIn": 900 }

// Response 401
{ "error": "UNAUTHORIZED", "detail": "Refresh token invalid or expired.", "correlationId": "uuid" }
```

---

## 2. Matches

### `POST /matches` — Create or join a match

```json
// Request
{}   // Player is assigned to a pending match or a new one is created

// Response 201
{
  "matchId": "uuid",
  "status": "PENDING",
  "players": [{ "playerId": "uuid", "username": "string" }],
  "gridSize": 10,
  "wsToken": "jwt"   // short-lived token for WebSocket auth
}
```

### `GET /matches/:matchId` — Get match state

```json
// Response 200
{
  "matchId": "uuid",
  "status": "ACTIVE",   // PENDING | ACTIVE | FINISHED
  "players": [
    { "playerId": "uuid", "username": "string", "hp": 80, "score": 120, "position": { "x": 3, "y": 5 } }
  ],
  "startedAt": "ISO8601",
  "finishedAt": null
}
```

---

## 3. Player Actions

### `POST /matches/:matchId/actions` — Submit an arena action

This is the primary idempotency endpoint. The client **must** supply `X-Idempotency-Key` for any action. If `useStamp: true`, the key is also the Stamp UUID and triggers the Stamp-sealed flow (see [GAME.md §4](GAME.md#4-stamp-sealed-actions)).

**Headers:**

| Header | Required | Description |
|---|---|---|
| `Authorization` | ✅ | `Bearer <jwt>` |
| `X-Idempotency-Key` | ✅ | Client-generated UUID v4. Must be globally unique per action. |

**Request:**

```json
{
  "type": "attack" | "defend" | "move" | "collect",
  "useStamp": false,   // optional — consumes one Stamp from balance
  "payload": {
    // attack
    "targetId": "uuid",
    // move
    "direction": "north" | "south" | "east" | "west",
    // collect — no extra payload needed
  }
}
```

**Response 200 — Action accepted (first submission or idempotent replay):**

```json
{
  "actionId": "uuid",       // equals X-Idempotency-Key
  "type": "attack",
  "result": {
    "damage": 30,
    "targetHp": 50
  },
  "sealed": true,           // true if Stamp was spent
  "stampBalance": 4         // updated balance (only if sealed)
}
```

**Response 409 — Action invalid (target dead, out of range, etc.):**

```json
{ "error": "TARGET_OUT_OF_RANGE", "detail": "Target is not in attack range." }
```

**Response 402 — Stamp requested but balance is 0:**

```json
{ "error": "INSUFFICIENT_STAMPS", "detail": "No Stamps available to seal this action." }
```

---

## 4. Wallet

### `GET /wallet` — Get balance and Stamp count

```json
// Response 200
{
  "playerId": "uuid",
  "balance": 1250,         // in minor units (cents)
  "heldAmount": 500,       // reserved for pending trades
  "stampBalance": 3,
  "updatedAt": "ISO8601"
}
```

### `GET /wallet/transactions` — Ledger history

```json
// Query params: ?page=1&limit=20&type=REWARD
// Response 200
{
  "items": [
    {
      "id": "uuid",
      "amount": 500,
      "type": "REWARD",
      "referenceId": "uuid",
      "createdAt": "ISO8601"
    }
  ],
  "total": 42,
  "page": 1
}
```

---

## 5. Inventory

### `GET /inventory` — List owned items

```json
// Response 200
{
  "items": [
    {
      "id": "uuid",
      "itemId": "rare_sword_01",
      "name": "Rare Sword",
      "type": "weapon",
      "locked": false   // true when item is committed to a pending trade
    }
  ]
}
```

---

## 6. Marketplace — Listings

### `POST /marketplace/listings` — Create a listing

```json
// Request
{ "itemId": "uuid", "price": 800 }

// Response 201
{
  "listingId": "uuid",
  "itemId": "uuid",
  "price": 800,
  "status": "ACTIVE",
  "createdAt": "ISO8601"
}
```

**Response 409** if item is locked (already in a pending trade).

### `GET /marketplace/listings` — Browse active listings

```json
// Query params: ?page=1&limit=20&minPrice=100&maxPrice=1000
// Response 200
{
  "items": [
    {
      "listingId": "uuid",
      "sellerId": "uuid",
      "sellerName": "string",
      "itemId": "uuid",
      "itemName": "string",
      "price": 800,
      "createdAt": "ISO8601"
    }
  ],
  "total": 15,
  "page": 1
}
```

### `DELETE /marketplace/listings/:listingId` — Cancel a listing

```json
// Response 200
{ "listingId": "uuid", "status": "CANCELLED" }
```

**Response 409** if a trade is in progress for this listing.

---

## 7. Marketplace — Trades

### `POST /marketplace/trades` — Initiate a trade (starts Saga)

```json
// Request
{ "listingId": "uuid" }

// Response 202 — Saga initiated
{
  "tradeId": "uuid",
  "listingId": "uuid",
  "status": "PENDING",
  "price": 800
}
```

**Response 402** — Insufficient balance.  
**Response 503** — Wallet or Inventory circuit breaker open.

### `GET /marketplace/trades/:tradeId` — Get trade status

```json
// Response 200
{
  "tradeId": "uuid",
  "listingId": "uuid",
  "buyerId": "uuid",
  "sellerId": "uuid",
  "itemId": "uuid",
  "price": 800,
  "status": "COMPLETED",   // PENDING | COMPLETED | FAILED
  "sagaState": "COMPLETED",
  "createdAt": "ISO8601",
  "completedAt": "ISO8601"
}
```

### `GET /marketplace/trades` — Trade history for authenticated player

```json
// Query params: ?page=1&limit=20&role=buyer
// Response 200
{
  "items": [ /* array of trade objects */ ],
  "total": 7,
  "page": 1
}
```

---

## 8. Leaderboard

### `GET /leaderboard/top100` — Global top-100 (Redis-cached)

```json
// Response 200
{
  "entries": [
    { "rank": 1, "playerId": "uuid", "username": "string", "score": 4200 }
  ],
  "cachedAt": "ISO8601",   // timestamp of last Redis write
  "stale": false           // true if served from stale cache due to DB slowness
}
```

---

## 9. WebSocket Events

Connect to: `ws://localhost:4000/game?token=<wsToken>`

The `wsToken` is obtained from `POST /matches` and is match-scoped.

### Server → Client

#### `match.state` — Full state sync on connect

```json
{
  "event": "match.state",
  "data": {
    "matchId": "uuid",
    "status": "ACTIVE",
    "grid": {
      "size": 10,
      "cells": [
        { "x": 3, "y": 5, "type": "resource_node", "depleted": false }
      ]
    },
    "players": [
      { "playerId": "uuid", "username": "string", "hp": 100, "position": { "x": 0, "y": 0 }, "score": 0 }
    ]
  }
}
```

#### `match.action` — Player action resolved

```json
{
  "event": "match.action",
  "data": {
    "actionId": "uuid",
    "playerId": "uuid",
    "type": "attack",
    "sealed": true,
    "result": { "targetId": "uuid", "damage": 30, "targetHp": 70 }
  }
}
```

#### `match.player_eliminated`

```json
{
  "event": "match.player_eliminated",
  "data": { "playerId": "uuid", "eliminatedBy": "uuid", "resourcesDropped": 150 }
}
```

#### `match.finished`

```json
{
  "event": "match.finished",
  "data": {
    "matchId": "uuid",
    "winnerId": "uuid",
    "finalScores": [{ "playerId": "uuid", "score": 480 }],
    "rewards": [
      { "type": "currency", "amount": 500 },
      { "type": "stamps", "amount": 3 }
    ]
  }
}
```

#### `trade.completed`

```json
{
  "event": "trade.completed",
  "data": { "tradeId": "uuid", "role": "buyer" | "seller" }
}
```

#### `trade.failed`

```json
{
  "event": "trade.failed",
  "data": { "tradeId": "uuid", "reason": "TRANSFER_FAILED" }
}
```

### Client → Server

#### `action` — Submit a player action (alternative to REST for lower latency)

```json
{
  "event": "action",
  "data": {
    "idempotencyKey": "uuid",
    "type": "attack",
    "useStamp": true,
    "payload": { "targetId": "uuid" }
  }
}
```

Server replies with `match.action` or an error event.

---

## Error Format

All error responses follow:

```json
{
  "error": "MACHINE_READABLE_CODE",
  "detail": "Human-readable explanation.",
  "correlationId": "uuid"
}
```

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `MATCH_NOT_FOUND` | 404 | Match does not exist |
| `ACTION_ALREADY_PROCESSED` | 200 | Idempotent replay — original response returned |
| `TARGET_OUT_OF_RANGE` | 409 | Action invalid given current game state |
| `INSUFFICIENT_STAMPS` | 402 | Stamp requested but `stamp_balance = 0` |
| `INSUFFICIENT_BALANCE` | 402 | Not enough currency for trade |
| `ITEM_LOCKED` | 409 | Item already in a pending trade |
| `CIRCUIT_OPEN` | 503 | Downstream service unavailable |

---

*For game mechanics (grid rules, combat resolution, action range) see [GAME.md](GAME.md). For Kafka event contracts see [SPEC.md §3](SPEC.md#3-event-contracts).*
