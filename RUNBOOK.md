# D&D Campaign Table – Operations Runbook

This runbook documents operational procedures for the D&D Campaign Table service: how to start a session, recover from failures, and handle failover scenarios. Follow these steps in order during game-night to ensure a smooth experience.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Session Startup](#session-startup)
3. [Mid-Session Checks](#mid-session-checks)
4. [Recovery Procedures](#recovery-procedures)
5. [Failover Scenarios](#failover-scenarios)
6. [Session Shutdown](#session-shutdown)
7. [Environment Variables Reference](#environment-variables-reference)

---

## Prerequisites

Before starting any session, confirm the following are in place:

- Node.js ≥ 18 is installed on the host.
- The application has been built: `npm run build` (or `npm start` for ts-node mode).
- The `JWT_SECRET` environment variable is set to a strong random value.
- The `DM_PASSCODE` environment variable is set and shared only with the DM.
- All client devices (player laptops, table display) are connected to the same network.
- The application is accessible at the expected host/port (default: `http://localhost:3000`).

---

## Session Startup

### 1. Start the server

```bash
# Production (compiled)
npm run build && node dist/index.js

# Development (ts-node, hot-reload friendly)
npm start
```

### 2. Verify the health endpoint

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

### 3. DM joins the session

```bash
curl -X POST http://localhost:3000/sessions/join \
  -H "Content-Type: application/json" \
  -d '{"userId":"dm-1","role":"dm","sessionId":"session-2026","dmPasscode":"<DM_PASSCODE>"}'
```

Save the returned `token` – this is the DM's bearer token for all subsequent requests.

### 4. Players join the session

```bash
curl -X POST http://localhost:3000/sessions/join \
  -H "Content-Type: application/json" \
  -d '{"userId":"player-alice","role":"player","sessionId":"session-2026"}'
```

Each player saves their token.

### 5. Table display joins the session

```bash
curl -X POST http://localhost:3000/sessions/join \
  -H "Content-Type: application/json" \
  -d '{"userId":"table-display","role":"table","sessionId":"session-2026"}'
```

### 6. Load initial soundscape

Load the opening ambient scene for the first location:

```bash
# Create the scene
curl -X PUT http://localhost:3000/campaign/soundscape/tavern-ambience \
  -H "Authorization: Bearer <DM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tavern Ambience",
    "type": "ambient",
    "tracks": [{"id":"t1","url":"https://cdn.example.com/tavern.mp3","loop":true,"volume":0.7}],
    "transitionMs": 2000
  }'

# Activate it
curl -X POST http://localhost:3000/campaign/soundscape/tavern-ambience/activate \
  -H "Authorization: Bearer <DM_TOKEN>"
```

### 7. Verify sync health

```bash
curl http://localhost:3000/campaign/sync/health \
  -H "Authorization: Bearer <DM_TOKEN>"
```

Confirm `failureCount` is 0 before beginning play.

---

## Mid-Session Checks

Run these checks periodically (every 20–30 minutes) during long sessions.

### Performance check

```bash
curl http://localhost:3000/campaign/metrics \
  -H "Authorization: Bearer <DM_TOKEN>"
```

Watch for:
- `averageLatencyMs` > 200 ms – may indicate network congestion.
- `averageFps` < 30 for `table` or `map` clients – may indicate rendering bottlenecks.

### Sync health check

```bash
curl http://localhost:3000/campaign/sync/health \
  -H "Authorization: Bearer <DM_TOKEN>"
```

If `failureCount` is rising, check builder backend connectivity and consider setting a DM override (see [Recovery Procedures](#recovery-procedures)).

---

## Recovery Procedures

### Token expired (player or DM)

Tokens default to an 8-hour TTL (`TOKEN_TTL` env var). If a token expires mid-session:

1. The client will receive a `401 Unauthorized` response.
2. The user must call `POST /sessions/join` again with the same `userId`, `role`, and `sessionId`.
3. A new token is issued immediately – no data is lost.

### Entity sync failure

If the builder backend is unavailable, apply a DM override so the session can continue uninterrupted:

```bash
curl -X PUT http://localhost:3000/campaign/sync/overrides/npc/npc-1 \
  -H "Authorization: Bearer <DM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"id":"npc-1","name":"Zara the Merchant","revealed":true,"publicDescription":"A mysterious merchant."}'
```

Clear the override once the backend is restored:

```bash
curl -X DELETE http://localhost:3000/campaign/sync/overrides/npc/npc-1 \
  -H "Authorization: Bearer <DM_TOKEN>"
```

### Server restart (in-session)

The current store is in-memory; a server restart will **reset all game state**. To minimise disruption:

1. Before restarting: export critical state (encounter HP, fog-of-war, NPC reveals) by reading the relevant endpoints and recording responses.
2. Restart the server.
3. Replay the saved state by patching:
   - `PATCH /campaign/encounters/:id` to restore combat state.
   - `PATCH /campaign/map/:mapId/areas/:areaId` to restore fog-of-war.
   - `PATCH /campaign/npcs/:npcId` to restore NPC visibility.

> **Note:** A production deployment should replace the in-memory store with a persistent database to survive restarts automatically.

### High latency on table display

1. Check raw metrics: `GET /campaign/metrics/raw`.
2. Identify the slow `clientType` (`map` or `table`).
3. Reduce track count in the active soundscape to lower CPU overhead:
   ```bash
   curl -X PUT http://localhost:3000/campaign/soundscape/<sceneId> \
     -H "Authorization: Bearer <DM_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"name":"<name>","type":"ambient","tracks":[]}'
   ```
4. Verify improvement by polling `GET /campaign/metrics`.

---

## Failover Scenarios

### DM device fails

1. Another player with the DM passcode can join as DM from a different device using `POST /sessions/join` with `role: "dm"`.
2. The new DM token grants full DM permissions immediately.

### Table display fails

1. Any device that joins with `role: "table"` and the correct `sessionId` will receive the same public view.
2. Simply re-join from the backup device.

### Builder backend unreachable

1. Apply DM overrides for all affected entities (see [Recovery Procedures](#recovery-procedures)).
2. Continue the session using override data.
3. Once the backend recovers, use `POST /campaign/sync/refresh/:entityType/:entityId` to re-sync and then `DELETE /campaign/sync/overrides/...` to clear overrides.

---

## Session Shutdown

### 1. Capture post-session notes

```bash
curl -X POST http://localhost:3000/campaign/feedback/notes \
  -H "Authorization: Bearer <DM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Session summary: players defeated the goblin ambush and found the secret passage."}'
```

### 2. End the session

```bash
curl -X DELETE http://localhost:3000/sessions/session-2026 \
  -H "Authorization: Bearer <DM_TOKEN>"
```

### 3. Stop the server

Send `SIGTERM` to the server process (`Ctrl+C` if running in the foreground, or `kill <PID>`).

---

## Environment Variables Reference

| Variable       | Default                          | Description                                       |
|----------------|----------------------------------|---------------------------------------------------|
| `JWT_SECRET`   | `dnd-campaign-table-dev-secret`  | Secret used to sign/verify session tokens. **Must be changed in production.** |
| `TOKEN_TTL`    | `8h`                             | JWT expiry duration (e.g., `8h`, `2h`, `30m`).   |
| `DM_PASSCODE`  | `dm-secret`                      | Passcode required to join as the DM role. **Must be changed in production.** |
| `PORT`         | `3000`                           | TCP port the HTTP server binds to.                |
