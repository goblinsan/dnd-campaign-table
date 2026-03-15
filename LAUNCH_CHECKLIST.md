# D&D Campaign Table – Launch Checklist

Use this checklist before and during a full rehearsal session to validate that all DM, player, and table display flows work end-to-end. Check off each item as it is confirmed.

---

## Pre-Session Setup

### Infrastructure

- [ ] Server starts without errors: `npm start` (or `node dist/index.js` after `npm run build`)
- [ ] Health endpoint returns `{"status":"ok"}`: `GET /health`
- [ ] `JWT_SECRET` is set to a strong value (not the default `dnd-campaign-table-dev-secret`)
- [ ] `DM_PASSCODE` is set and securely shared with the DM only
- [ ] All player devices are on the same network as the server
- [ ] Table display device is connected and browser is open to the table view URL

### Session Tokens

- [ ] DM joins successfully: `POST /sessions/join` with `role: "dm"` and correct passcode → receives token
- [ ] At least one player joins: `POST /sessions/join` with `role: "player"` → receives token
- [ ] Table display joins: `POST /sessions/join` with `role: "table"` → receives token
- [ ] Invalid DM passcode is rejected with 403
- [ ] Unauthenticated request to any protected endpoint returns 401

---

## DM Flows

### Campaign Data Management

- [ ] DM can create an encounter: `POST /campaign/encounters`
- [ ] DM can update encounter state (HP, initiative, round): `PATCH /campaign/encounters/:id`
- [ ] DM can create/update an NPC: `POST /campaign/npcs`
- [ ] DM can reveal an NPC to players: `PATCH /campaign/npcs/:npcId` with `{"revealed":true}`
- [ ] DM can control fog-of-war: `PATCH /campaign/map/:mapId/areas/:areaId` with `{"revealed":true/false}`
- [ ] DM can read private notes: `GET /campaign/notes`
- [ ] DM can view the aggregated table display: `GET /campaign/view/table`

### Soundscape (Issue #16)

- [ ] DM can create an ambient scene: `PUT /campaign/soundscape/:sceneId`
- [ ] DM can create an encounter scene: `PUT /campaign/soundscape/:sceneId` with `type: "encounter"`
- [ ] DM can create an SFX scene: `PUT /campaign/soundscape/:sceneId` with `type: "sfx"`
- [ ] DM can list all scenes: `GET /campaign/soundscape`
- [ ] DM can activate a scene: `POST /campaign/soundscape/:sceneId/activate`
- [ ] Active scene is visible to all roles: `GET /campaign/soundscape/active`
- [ ] Switching scenes updates the active scene for all clients in real time
- [ ] PLAYER/TABLE cannot manage scenes (returns 403)

### Sync & Overrides

- [ ] DM can manually refresh an entity: `POST /campaign/sync/refresh/:entityType/:entityId`
- [ ] DM can set an override: `PUT /campaign/sync/overrides/:entityType/:entityId`
- [ ] Override takes precedence over cached data
- [ ] DM can clear an override: `DELETE /campaign/sync/overrides/:entityType/:entityId`
- [ ] Sync health endpoint is accessible: `GET /campaign/sync/health`

---

## Player Flows

### Campaign Data Access

- [ ] Player can read their own character: `GET /campaign/characters/:id`
- [ ] Player cannot read another player's character (403 or filtered response)
- [ ] Player can see revealed encounters: `GET /campaign/encounters/:id`
- [ ] Player cannot see DM encounter notes (dmNotes and hiddenDetails absent)
- [ ] Player can see revealed NPCs: `GET /campaign/npcs/:npcId` (when `revealed: true`)
- [ ] Player receives 404 for unrevealed NPCs
- [ ] Player can see revealed map areas: `GET /campaign/map/:mapId`
- [ ] Hidden areas not visible to player (filtered out)

### Feedback (Issue #17)

- [ ] Player can submit clarity/immersion feedback: `POST /campaign/feedback`
- [ ] Player can submit feedback without all optional fields
- [ ] Player cannot read feedback list (403)
- [ ] Player cannot add session notes (403)

---

## Table Display Flows

### Aggregated View

- [ ] TABLE role receives the aggregated public view: `GET /campaign/view/table`
- [ ] DM-private map fields absent (dmOverlay, hiddenAreas)
- [ ] Only revealed map areas shown
- [ ] DM encounter notes absent (dmNotes, hiddenDetails)
- [ ] Per-mob dmNotes absent
- [ ] NPC list contains only revealed NPCs without hidden fields
- [ ] Active soundscape scene is readable: `GET /campaign/soundscape/active`

### Performance Reporting (Issue #18)

- [ ] TABLE client can report metrics: `POST /campaign/metrics` with `clientType: "table"`
- [ ] Map client can report metrics: `POST /campaign/metrics` with `clientType: "map"`
- [ ] TABLE cannot view performance summary (403)

---

## DM Observability

### Metrics (Issue #18)

- [ ] Performance summary shows correct totals: `GET /campaign/metrics`
- [ ] Raw reports accessible: `GET /campaign/metrics/raw`
- [ ] averageLatencyMs is below 200 ms for all client types
- [ ] averageFps is at or above 30 for `table` and `map` clients

---

## Post-Session

### Feedback Collection (Issue #17)

- [ ] DM can read all submitted player feedback: `GET /campaign/feedback`
- [ ] DM can filter feedback by session: `GET /campaign/feedback?sessionId=<id>`
- [ ] DM can add session notes: `POST /campaign/feedback/notes`
- [ ] DM can retrieve session notes: `GET /campaign/feedback/notes`

### Session Cleanup

- [ ] DM ends the session: `DELETE /sessions/:id`
- [ ] Server stops cleanly (SIGTERM / Ctrl+C)

---

## Sign-Off

| Rehearsal Date | Conducted By | Notes |
|---|---|---|
|  |  |  |

All items above must be checked before the campaign table is declared **production-ready** for a live game-night session.
