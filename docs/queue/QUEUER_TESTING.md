# Queuer System Testing Guide

## Setup Test Data

Before testing, ensure you have:
1. A tournament with ID (e.g., `tournament-1`)
2. A stage with ID (e.g., `stage-1`)
3. Matches scheduled in that stage

## Test Scenarios

### Scenario 1: Robot Passes Inspection

**Precondition**: Match in SCHEDULED status with robotStatus = null

**Test Steps**:
```bash
# 1. Check matches awaiting inspection
curl -X GET "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches-ready-for-queue" \
  -H "Authorization: Bearer <queuer-token>" \
  -H "Content-Type: application/json"

# Expected: List of SCHEDULED matches with robotStatus: null

# 2. Submit robot passed inspection
curl -X POST "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches/match-1/robot-check" \
  -H "Authorization: Bearer <queuer-token>" \
  -H "Content-Type: application/json" \
  -d '{"robotStatus": "PASS"}'

# Expected Response:
# {
#   "success": true,
#   "robotStatus": "PASS"
# }

# 3. Verify match status changed to READY
curl -X GET "http://localhost:3000/api/matches/match-1" \
  -H "Authorization: Bearer <queuer-token>"

# Expected: status = "READY", robotStatus = "PASS"
```

### Scenario 2: Robot Fails Inspection

**Precondition**: Match in SCHEDULED status

**Test Steps**:
```bash
# 1. Submit robot failed inspection
curl -X POST "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches/match-2/robot-check" \
  -H "Authorization: Bearer <queuer-token>" \
  -H "Content-Type: application/json" \
  -d '{"robotStatus": "FAIL"}'

# Expected Response:
# {
#   "success": true,
#   "robotStatus": "FAIL"
# }

# 2. Verify match status still SCHEDULED (not transitioned to READY)
curl -X GET "http://localhost:3000/api/matches/match-2" \
  -H "Authorization: Bearer <queuer-token>"

# Expected: status = "SCHEDULED", robotStatus = "FAIL"

# 3. Admin reschedules the match
curl -X PATCH "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches/match-2/reschedule" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduledAt": "2025-11-19T15:00:00Z",
    "reason": "Robot had servo malfunction, rescheduling after repair"
  }'

# Expected Response:
# {
#   "success": true
# }

# 4. Verify match reset and rescheduled
curl -X GET "http://localhost:3000/api/matches/match-2" \
  -H "Authorization: Bearer <admin-token>"

# Expected: status = "SCHEDULED", robotStatus = null, scheduledAt = new time
```

### Scenario 3: Authorization Test

**Test QUEUER Cannot Reschedule**:
```bash
curl -X PATCH "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches/match-3/reschedule" \
  -H "Authorization: Bearer <queuer-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduledAt": "2025-11-19T16:00:00Z"
  }'

# Expected: 403 Forbidden
# {
#   "error": "Forbidden"
# }
```

**Test Admin Can Reschedule**:
```bash
curl -X PATCH "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches/match-3/reschedule" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduledAt": "2025-11-19T16:00:00Z"
  }'

# Expected: 200 OK
# {
#   "success": true
# }
```

## Manual Testing with cURL

### Get Ready-for-Queue Matches
```bash
curl -X GET "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches-ready-for-queue" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" | jq .
```

Expected output:
```json
{
  "matches": [
    {
      "id": "match-123",
      "round": "1",
      "homeTeamId": "team-1",
      "awayTeamId": "team-2",
      "scheduledAt": "2025-11-19T10:00:00Z",
      "status": "SCHEDULED"
    }
  ],
  "count": 1
}
```

### Submit Robot Inspection
```bash
curl -X POST "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches/match-123/robot-check" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"robotStatus": "PASS"}' | jq .
```

Expected output:
```json
{
  "success": true,
  "robotStatus": "PASS"
}
```

### Reschedule Match
```bash
curl -X PATCH "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches/match-456/reschedule" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduledAt": "2025-11-19T14:00:00Z",
    "reason": "Equipment issue resolved"
  }' | jq .
```

Expected output:
```json
{
  "success": true
}
```

## Error Scenarios

### 1. Match Not Found
```bash
curl -X POST "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches/invalid-id/robot-check" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"robotStatus": "PASS"}'

# Expected: 404
# {
#   "error": "Match not found"
# }
```

### 2. Missing Required Field
```bash
curl -X POST "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches/match-1/robot-check" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: 422
# {
#   "error": {
#     "fieldErrors": {...}
#   }
# }
```

### 3. Invalid Date Format
```bash
curl -X PATCH "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches/match-1/reschedule" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduledAt": "not-a-date"
  }'

# Expected: 422
# {
#   "error": {
#     "fieldErrors": {
#       "scheduledAt": ["Invalid date format"]
#     }
#   }
# }
```

### 4. Reschedule Non-Canceled Match
```bash
curl -X PATCH "http://localhost:3000/api/tournaments/tournament-1/stages/stage-1/matches/match-1/reschedule" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduledAt": "2025-11-19T14:00:00Z"
  }'

# If match.status != "CANCELED"
# Expected: 400
# {
#   "error": "Only canceled matches can be rescheduled"
# }
```

## Testing Checklist

- [ ] Queuer can view matches ready for inspection
- [ ] Queuer can submit PASS inspection result
- [ ] Queuer can submit FAIL inspection result
- [ ] PASS result transitions match to READY
- [ ] FAIL result keeps match in SCHEDULED
- [ ] Admin can reschedule CANCELED matches
- [ ] Reschedule resets robotStatus to null
- [ ] Reschedule updates scheduled time
- [ ] Queuer cannot reschedule (403)
- [ ] Unauthenticated user cannot access endpoints (403)
- [ ] Invalid match ID returns 404
- [ ] Invalid data returns 422
- [ ] Non-CANCELED match reschedule fails (400)

## Performance Testing

For load testing, consider:
- Number of matches per stage
- Concurrent inspection submissions
- Query performance for large tournaments

Use `getMatchesReadyForQueuing()` with stageId for optimal query performance.
