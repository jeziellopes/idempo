# idempo — Arena Game Mechanics

**Related:** [PRD.md](PRD.md) · [API.md](API.md)

This document is the authoritative reference for all arena game rules. It is consumed by the Combat Service, Game Service, and Arena UI.

---

## Table of Contents

1. [Match Lifecycle](#1-match-lifecycle)
2. [Grid](#2-grid)
3. [Player State](#3-player-state)
4. [Actions](#4-actions)
5. [Stamp-Sealed Actions](#5-stamp-sealed-actions)
6. [Combat Resolution](#6-combat-resolution)
7. [Resource Nodes](#7-resource-nodes)
8. [Scoring](#8-scoring)
9. [Match End Conditions](#9-match-end-conditions)
10. [Rewards](#10-rewards)

---

## 1. Match Lifecycle

```
PENDING   → 2–6 players joining (30 s lobby timeout)
ACTIVE    → Match running (3–5 min, server-authoritative tick)
FINISHED  → Winner determined, rewards granted
```

- A match starts automatically when 6 players join, or after the lobby timeout (30 s) if at least 2 players are present.
- If fewer than 2 players join within 30 s, the match is cancelled and players are returned to matchmaking.
- Match duration is capped at **5 minutes**. If time expires, the highest-score player wins.

---

## 2. Grid

- **Size:** 10 × 10 tiles
- **Coordinate system:** (0,0) is top-left; x increases east, y increases south
- **Spawn positions:** Players spawn at fixed corners and mid-edges, spaced as far apart as possible

| Players | Spawn positions |
|---|---|
| 2 | (0,0) · (9,9) |
| 3 | (0,0) · (9,0) · (4,9) |
| 4 | (0,0) · (9,0) · (0,9) · (9,9) |
| 5 | (0,0) · (9,0) · (0,9) · (9,9) · (4,4) |
| 6 | (0,0) · (9,0) · (0,9) · (9,9) · (0,4) · (9,4) |

### 2.1 Tile Types

| Type | Symbol | Description |
|---|---|---|
| `empty` | · | Passable, no special effect |
| `resource_node` | R | Contains collectible resources; depleted after collection |
| `wall` | # | Impassable; blocks movement and line-of-sight |

### 2.2 Map Layout (default)

```
. . . . R . . . . .
. # # . . . . # # .
. # . . . . . . # .
. . . . R . . . . .
R . . R . . R . . R
. . . . R . . . . .
. . . . . . . . . .
. # . . . . . . # .
. # # . . . . # # .
. . . . R . . . . .
```

Additional maps may be introduced post-v1.

---

## 3. Player State

| Attribute | Initial | Notes |
|---|---|---|
| `hp` | 100 | Integer. Eliminated when ≤ 0. |
| `score` | 0 | Increases via kills, resource collection |
| `resources` | 0 | Currency units accumulated in-match |
| `position` | spawn tile | Updated by `move` action |
| `shields` | 0 | Temporary damage reduction, granted by `defend` action |
| `alive` | true | Set to false on elimination |

---

## 4. Actions

Every action is submitted via `POST /matches/:matchId/actions` (REST) or the `action` WebSocket event. All actions require an `X-Idempotency-Key`.

The server processes actions in **tick order** (100 ms ticks). Within a tick, actions are resolved in receipt order.

### 4.1 `move`

Move one tile in a cardinal direction.

| Rule | Detail |
|---|---|
| Distance | 1 tile per action |
| Directions | `north` · `south` · `east` · `west` |
| Blocked by | walls, grid boundary, another player's tile |
| Cooldown | None — one move per tick allowed |

### 4.2 `attack`

Attack a player on an adjacent tile (including diagonals).

| Rule | Detail |
|---|---|
| Range | Chebyshev distance ≤ 1 (adjacent 8 tiles) |
| Base damage | 20 pts |
| Weapon bonus | +0 to +20 pts depending on equipped weapon |
| Critical hit | 10% chance — double damage |
| Blocked by | Walls between attacker and target break line-of-sight (cardinal only) |
| Cooldown | 1 tick (1 action per tick) |
| Target self | Not allowed |

`payload`: `{ "targetId": "uuid" }`

### 4.3 `defend`

Enter defensive stance for the current tick.

| Rule | Detail |
|---|---|
| Effect | Grants **20 shield points** for 1 tick |
| Stacking | Does not stack — re-using removes old shield |
| Duration | Until the next tick begins |
| Cooldown | None |

`payload`: `{}` (no extra payload)

### 4.4 `collect`

Collect resources from the current tile if it is a `resource_node`.

| Rule | Detail |
|---|---|
| Requirement | Player must be standing on a `resource_node` tile |
| Yield | 50–150 resource units (uniform random) |
| Depletion | Tile becomes `empty` after collection |
| Cooldown | 1 tick |

`payload`: `{}` (no extra payload)

---

## 5. Stamp-Sealed Actions

Any action can be sealed with an idempo Stamp by setting `useStamp: true` in the request.

**What sealing does:**

| Guarantee | Mechanism |
|---|---|
| Exactly-once resolution | `stampId` stored as `action_id` with `UNIQUE` constraint |
| Duplicate immunity | Second request with same `X-Idempotency-Key` returns original response — action not re-applied |
| Irreversibility | Sealed actions cannot be cancelled or overridden — the commitment is the cost |

**What sealing does NOT do:**

- It does not increase damage or give any in-game advantage beyond the exactly-once guarantee
- It does not prevent the action from being *invalid* (e.g., attacking an out-of-range target still returns 409)

**Stamp deduction rules:**

- One Stamp is deducted atomically with the action insert — in the same DB transaction
- If the action is rejected as a duplicate (idempotency hit), the Stamp is **not** deducted again
- If the action is invalid (e.g., 409), the Stamp is **not** deducted (validation runs before deduction)
- If the player has `stamp_balance = 0` and requests `useStamp: true`, the request returns 402 immediately

---

## 6. Combat Resolution

When an `attack` action is processed:

```
1. Validate attacker is alive
2. Validate target is alive
3. Validate range (Chebyshev distance ≤ 1)
4. Check line-of-sight (walls block cardinal directions only)
5. Roll critical hit (10% chance)
6. Calculate damage:
     damage = base_damage (20)
              + weapon_bonus (0–20)
              × (2 if critical, else 1)
7. Apply shield reduction:
     effective_damage = max(0, damage - target.shields)
8. Deduct HP:
     target.hp -= effective_damage
9. If target.hp ≤ 0:
     Eliminate target (see §3.2)
10. Emit PlayerAttackedEvent
11. If eliminated: emit PlayerEliminatedEvent
```

### 6.1 Elimination

When a player is eliminated:

- `alive` set to `false`
- They drop **50% of their accumulated `resources`** on their current tile (rounded down)
- Eliminated player is removed from the grid
- Remaining players may `collect` from their death tile (which becomes a temporary resource node)
- Score awarded to the eliminating player: **+100 pts**

---

## 7. Resource Nodes

- 6 resource nodes placed symmetrically (see map layout in §2.2)
- Each node holds 50–150 resource units (randomised on match start, same seed for all clients)
- After collection the tile becomes `empty` — nodes do not respawn during v1
- Resources accumulated in-match are converted to wallet currency at match end (1 resource = 1 currency unit)

---

## 8. Scoring

| Event | Points awarded |
|---|---|
| Dealing damage | +1 pt per damage point dealt |
| Eliminating a player | +100 pts |
| Collecting a resource node | +50 pts |
| Surviving to match end | +25 pts |

Score is the projection used by the Leaderboard Service (CQRS read model, updated via `ScoreUpdatedEvent`).

---

## 9. Match End Conditions

The match ends when:

1. Only one player remains alive — that player wins immediately, or
2. The 5-minute time limit expires — highest-score player wins

In the event of a score tie at time limit, the player with more remaining HP wins. If still tied, the match is declared a draw and both players receive winner rewards.

---

## 10. Rewards

Rewards are calculated by the Reward Service after `MatchFinishedEvent` is received. All grants are idempotent — redelivery of the event does not double-grant.

| Outcome | Currency | Items | Stamps |
|---|---|---|---|
| Winner | 500 | 1 random item (common–rare) | 3 |
| Survivor (not winner) | 200 + resources collected | — | 1 |
| Eliminated before end | resources collected at time of death | — | 0 |

### 10.1 Item Drop Table (Winner)

| Rarity | Probability | Example |
|---|---|---|
| Common | 60% | `iron_sword` (+5 weapon bonus) |
| Uncommon | 30% | `steel_sword` (+10 weapon bonus) |
| Rare | 10% | `rare_sword_01` (+20 weapon bonus) |

---

*For HTTP and WebSocket contracts used to submit actions, see [API.md](API.md). For idempotency implementation details, see [SPEC.md §5](SPEC.md#5-idempotency-strategy).*
