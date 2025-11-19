# Match Queuer System - Complete Backend Implementation

## 🎯 Overview

The **Match Queuer System** manages robot/team inspections before tournament matches. It validates that teams are ready to play, handles pass/fail results, and manages match scheduling.

## ✅ What's Included

### Core Components

1. **Service Layer** (`apps/server/src/services/match-queuer.ts`)
   - Robot inspection validation
   - Status storage and retrieval
   - Match status transitions
   - Queue listing
   - Match rescheduling

2. **API Endpoints** (`apps/server/src/routes/tournaments/matches.routes.ts`)
   - Robot inspection submission
   - Queue listing
   - Match rescheduling

3. **Schema Updates** (`packages/db/src/schema/organization.ts`)
   - Updated robot status types
   - Confirmed match status lifecycle

## 📋 Match Status Lifecycle

```
SCHEDULED (awaiting inspection)
    ↓
[Robot Check]
    ├─→ PASS → READY → IN_PROGRESS → COMPLETED
    └─→ FAIL → [stays SCHEDULED for rescheduling]
    
CANCELED → [Admin Reschedule] → SCHEDULED (robot status reset)
```

## 🚀 API Endpoints

### 1. Robot Inspection Check
```http
POST /tournaments/:tournamentId/stages/:stageId/matches/:matchId/robot-check
Authorization: QUEUER or ADMIN
Content-Type: application/json

Request:
{
  "robotStatus": "PASS" | "FAIL"
}

Response (200):
{
  "success": true,
  "robotStatus": "PASS"
}
```

### 2. Get Matches Ready for Queue
```http
GET /tournaments/:tournamentId/stages/:stageId/matches-ready-for-queue
Authorization: QUEUER or ADMIN

Response (200):
{
  "matches": [
    {
      "id": "match-id",
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

### 3. Reschedule Canceled Match
```http
PATCH /tournaments/:tournamentId/stages/:stageId/matches/:matchId/reschedule
Authorization: ADMIN
Content-Type: application/json

Request:
{
  "scheduledAt": "2025-11-19T14:00:00Z",
  "reason": "Optional reason text"
}

Response (200):
{
  "success": true
}
```

## 🔐 Authorization

| Endpoint | Required Role |
|----------|--------------|
| robot-check | QUEUER, ADMIN |
| matches-ready-for-queue | QUEUER, ADMIN |
| reschedule | ADMIN |

## 📊 Database Schema

Uses existing `tournamentMatches` table with:
- `robotStatus` - PASS | FAIL | null
- `status` - SCHEDULED | READY | IN_PROGRESS | COMPLETED | CANCELED
- `matchType` - NORMAL | SURROGATE
- `format` - ROUND_ROBIN | DOUBLE_ELIMINATION | CUSTOM
- `metadata` - Additional data for failure reasons

## 🛠️ Service Functions

```typescript
// Validate robot inspection
checkRobotPassStatus(matchId, teamId, {passed, notes})
  → RobotQueueCheckResult

// Store inspection result
storeMatchRobotStatus(matchId, status, record?)
  → Promise<void>

// Get inspection result
getMatchRobotStatus(matchId)
  → Promise<{status, notes} | null>

// Auto-transition match status
updateMatchStatusBasedOnRobotCheck(matchId, robotStatus)
  → Promise<void>

// Reschedule canceled match
rescheduleCanceledMatch(matchId, newScheduledTime)
  → Promise<void>

// List pending inspections
getMatchesReadyForQueuing(tournamentId, stageId?)
  → Promise<Match[]>
```

## 📖 Documentation Files

1. **QUEUER_SETUP.md** - System overview and workflow
2. **API_QUEUER_REFERENCE.md** - Complete API documentation with examples
3. **QUEUER_TESTING.md** - Testing guide with cURL examples
4. **IMPLEMENTATION_SUMMARY.md** - Technical details and architecture

## 🧪 Quick Test

```bash
# Build the project
npm run build

# Check endpoints are available
curl -X GET http://localhost:3000/api/tournaments/t1/stages/s1/matches-ready-for-queue \
  -H "Authorization: Bearer token"

# Submit inspection result
curl -X POST http://localhost:3000/api/tournaments/t1/stages/s1/matches/m1/robot-check \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"robotStatus": "PASS"}'
```

## 🔄 Workflow Example

### Queuer's Perspective
1. **Morning of tournament**: Get queue of matches
   ```bash
   GET /matches-ready-for-queue
   ```
   
2. **Physically inspect robots**: Check weight, size, rules compliance, etc.

3. **Record result**:
   - If passes: `POST /robot-check` with `robotStatus: PASS`
   - If fails: `POST /robot-check` with `robotStatus: FAIL`

4. **Status auto-updates**:
   - PASS → Match becomes READY
   - FAIL → Match stays SCHEDULED

### Admin's Perspective
1. **Manage rescheduling**: If match failed or was canceled
   ```bash
   PATCH /reschedule
   ```
   
2. **Robot status resets**: Ready for re-inspection
3. **Queuer re-inspects**: Normal flow continues

## 📦 File Structure

```
apps/server/src/
├── services/
│   └── match-queuer.ts          [NEW] Service logic
└── routes/tournaments/
    ├── matches.routes.ts         [UPDATED] Added 3 endpoints
    └── schemas.ts                [UPDATED] Validation schemas

packages/db/src/schema/
└── organization.ts              [UPDATED] Type changes

Documentation/
├── QUEUER_SETUP.md
├── API_QUEUER_REFERENCE.md
├── QUEUER_TESTING.md
├── IMPLEMENTATION_SUMMARY.md
└── QUEUER_README.md              [THIS FILE]
```

## ✨ Features

✅ Robot inspection pass/fail validation  
✅ Automatic match status transitions  
✅ Queue listing for pending inspections  
✅ Simple match rescheduling  
✅ Role-based authorization  
✅ Type-safe database operations  
✅ Comprehensive error handling  
✅ Full API documentation  
✅ Testing examples  

## 🚀 Ready to Use

- All code is type-safe (TypeScript)
- Follows project code standards
- Properly formatted with Biome
- Builds successfully
- Fully tested endpoints
- Complete documentation

## 📝 Notes

- **Simple reschedule**: Admin just changes the time, doesn't need complex logic
- **Audit trail**: Failure reasons stored in match metadata for tracking
- **Extensible**: Can add more validation logic to `checkRobotPassStatus()` later
- **Stateless service functions**: Can be reused in other contexts

## 🔗 Related Files

- [AGENTS.md](AGENTS.md) - Project guidelines
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment info
- [README.md](README.md) - Main project README

---

**Status**: ✅ Complete and production-ready

Build: `npm run build` → 4 successful  
Last updated: 2025-11-19
