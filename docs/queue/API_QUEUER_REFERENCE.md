# Queuer API Reference

## Base URL
```
/tournaments/:tournamentId/stages/:stageId/matches/:matchId
```

## Endpoints

### 1. Submit Robot Inspection Result

**Endpoint**: `POST /:matchId/robot-check`

**Authentication**: QUEUER or ADMIN

**Description**: Submit robot inspection pass/fail result for a match

**Request**:
```json
{
  "robotStatus": "PASS"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "robotStatus": "PASS"
}
```

**Error Responses**:
- `403`: Forbidden (missing QUEUER/ADMIN role)
- `404`: Tournament or match not found
- `422`: Validation error
- `500`: Server error

---

### 2. Get Matches Awaiting Queue

**Endpoint**: `GET /matches-ready-for-queue`

**Authentication**: QUEUER or ADMIN

**Description**: List all matches scheduled but not yet inspected (robotStatus = null)

**Query Parameters**: None (uses :tournamentId and :stageId from path)

**Success Response** (200):
```json
{
  "matches": [
    {
      "id": "match-abc123",
      "round": "1",
      "homeTeamId": "team-001",
      "awayTeamId": "team-002",
      "scheduledAt": "2025-11-19T10:00:00Z",
      "status": "SCHEDULED"
    },
    {
      "id": "match-def456",
      "round": "1",
      "homeTeamId": "team-003",
      "awayTeamId": "team-004",
      "scheduledAt": "2025-11-19T10:30:00Z",
      "status": "SCHEDULED"
    }
  ],
  "count": 2
}
```

**Error Responses**:
- `403`: Forbidden (missing QUEUER/ADMIN role)
- `404`: Tournament not found
- `500`: Server error

---

### 3. Reschedule Canceled Match

**Endpoint**: `PATCH /:matchId/reschedule`

**Authentication**: ADMIN only

**Description**: Reschedule a canceled match to a new time. Resets robot inspection status.

**Request**:
```json
{
  "scheduledAt": "2025-11-19T14:00:00Z",
  "reason": "Equipment failure delayed match"
}
```

**Success Response** (200):
```json
{
  "success": true
}
```

**Error Responses**:
- `403`: Forbidden (missing ADMIN role)
- `404`: Tournament or match not found
- `400`: Match is not in CANCELED status
- `422`: Validation error (invalid date format)
- `500`: Server error

---

## Status Transitions

### Normal Flow
```
SCHEDULED → (robot check) → READY → IN_PROGRESS → COMPLETED
   ↓
   └─ (fail) → stays SCHEDULED (for rescheduling)
```

### Canceled Match
```
CANCELED → (admin reschedule) → SCHEDULED → (robot check) → READY
```

---

## Examples

### Queuer Workflow

1. **Get matches to inspect**:
```bash
curl -X GET "https://api.tournament.com/tournaments/t1/stages/s1/matches-ready-for-queue" \
  -H "Authorization: Bearer <token>"
```

2. **Inspect a robot and record PASS**:
```bash
curl -X POST "https://api.tournament.com/tournaments/t1/stages/s1/matches/m1/robot-check" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"robotStatus": "PASS"}'
```

Match now transitions to `READY` status.

3. **If robot failed inspection**:
```bash
curl -X POST "https://api.tournament.com/tournaments/t1/stages/s1/matches/m1/robot-check" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"robotStatus": "FAIL"}'
```

Match stays in `SCHEDULED` status for rescheduling.

### Admin Workflow

1. **Reschedule a canceled match**:
```bash
curl -X PATCH "https://api.tournament.com/tournaments/t1/stages/s1/matches/m1/reschedule" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduledAt": "2025-11-19T14:00:00Z",
    "reason": "Previous match overran"
  }'
```

Match transitions from `CANCELED` to `SCHEDULED` with new time.

---

## Data Models

### Match Record
```typescript
{
  id: string;
  tournamentId: string;
  stageId: string;
  round: string | null;
  status: "SCHEDULED" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
  matchType: "NORMAL" | "SURROGATE";
  format: "ROUND_ROBIN" | "DOUBLE_ELIMINATION" | "CUSTOM" | null;
  robotStatus: "PASS" | "FAIL" | null;
  scheduledAt: Date | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Notes

- **Robot Status Pending**: When `robotStatus` is `null`, match is awaiting inspection
- **Automatic Transitions**: Robot check automatically transitions match to READY or keeps it SCHEDULED
- **Reschedule Reset**: Rescheduling a canceled match resets `robotStatus` to `null`
- **Metadata Storage**: Failure reasons are stored in match metadata for audit trail
