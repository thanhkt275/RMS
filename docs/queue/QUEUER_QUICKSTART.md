# Queuer System - Quick Start Guide

## 30-Second Overview

The queuer system validates robots before matches with 3 simple operations:

1. **List matches** needing inspection
2. **Submit pass/fail** result for each robot
3. **Reschedule** if a match fails

That's it. Status auto-transitions, no complexity.

## The 3 Endpoints

### 1️⃣ See What Needs Inspection
```bash
GET /tournaments/:tournamentId/stages/:stageId/matches-ready-for-queue
```
Returns list of SCHEDULED matches with `robotStatus: null`

### 2️⃣ Record Inspection Result
```bash
POST /tournaments/:tournamentId/stages/:stageId/matches/:matchId/robot-check
{
  "robotStatus": "PASS"  // or "FAIL"
}
```
- PASS → Match auto-becomes READY
- FAIL → Match stays SCHEDULED

### 3️⃣ Reschedule Failed/Canceled Matches
```bash
PATCH /tournaments/:tournamentId/stages/:stageId/matches/:matchId/reschedule
{
  "scheduledAt": "2025-11-19T14:00:00Z",
  "reason": "optional reason"
}
```
Resets robot status to null for re-inspection

## Who Can Do What

| Action | QUEUER | ADMIN |
|--------|--------|-------|
| View queue | ✅ | ✅ |
| Submit inspection | ✅ | ✅ |
| Reschedule | ❌ | ✅ |

## Typical Day Flow

**Morning**: Get queue
```bash
curl GET /matches-ready-for-queue -H "Authorization: Bearer token"
```

**Throughout day**: Inspect & record
```bash
# Robot passes
curl POST /robot-check -d '{"robotStatus": "PASS"}'

# Robot fails  
curl POST /robot-check -d '{"robotStatus": "FAIL"}'
```

**As needed**: Reschedule
```bash
# Admin reschedules
curl PATCH /reschedule -d '{"scheduledAt": "new-time"}'
```

## Match Status Flow

```
SCHEDULED (needs inspection)
    ↓
[You submit result]
    ├─→ PASS = Status becomes READY ✅
    └─→ FAIL = Stays SCHEDULED (needs reschedule)
```

## One Complete Example

```bash
# 1. List matches to inspect
curl -X GET "http://localhost:3000/api/tournaments/t1/stages/s1/matches-ready-for-queue" \
  -H "Authorization: Bearer eyJhbG..."

# Response:
{
  "matches": [
    {
      "id": "m1",
      "homeTeamId": "team-1",
      "awayTeamId": "team-2",
      "scheduledAt": "2025-11-19T10:00:00Z",
      "status": "SCHEDULED"
    }
  ],
  "count": 1
}

# 2. Inspect robot physically, then submit result
curl -X POST "http://localhost:3000/api/tournaments/t1/stages/s1/matches/m1/robot-check" \
  -H "Authorization: Bearer eyJhbG..." \
  -H "Content-Type: application/json" \
  -d '{"robotStatus": "PASS"}'

# Response:
{
  "success": true,
  "robotStatus": "PASS"
}

# ✅ Match automatically becomes READY
# Ready to play at 10:00 AM
```

## What Gets Stored

In the match record:
- `robotStatus` - PASS, FAIL, or null (pending)
- `status` - Current lifecycle state
- `metadata` - Failure reasons if applicable

## Error Codes

| Code | Meaning | Fix |
|------|---------|-----|
| 200 | Success | ✅ Good |
| 400 | Match not CANCELED | Only reschedule CANCELED matches |
| 403 | Not authorized | Use QUEUER or ADMIN token |
| 404 | Not found | Check IDs |
| 422 | Bad format | Check JSON format |
| 500 | Server error | Check server logs |

## Database Impact

Uses existing `tournamentMatches` table:
- Writes to `robotStatus` column
- Writes to `status` column  
- Reads from both for listings

No new tables needed.

## Testing Quick Check

```bash
# 1. Build succeeds?
npm run build
# → Should see "4 successful"

# 2. Service exports work?
# → Check apps/server/src/services/match-queuer.ts
# → Has 6 exported functions

# 3. Routes registered?
# → Check apps/server/src/routes/tournaments/matches.routes.ts  
# → Has 3 new endpoints
```

## Key Points to Remember

🎯 **Simple**: 3 endpoints, 1 decision (pass/fail)  
⚡ **Fast**: Status auto-updates, no extra calls  
🔒 **Secure**: Role-based authorization  
📝 **Logged**: Failure reasons stored in metadata  
🔄 **Reusable**: Reschedule resets for re-inspection  

## Next Steps

1. **Read** [API_QUEUER_REFERENCE.md](API_QUEUER_REFERENCE.md) for full details
2. **Test** with examples in [QUEUER_TESTING.md](QUEUER_TESTING.md)
3. **Deploy** - no migrations needed!

## One-Liner Summary

> Queuer lists SCHEDULED matches, inspects robots, submits PASS/FAIL, admin reschedules failures.

Done. 🚀
