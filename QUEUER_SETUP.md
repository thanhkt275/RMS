# Match Queuer System Setup

## Overview

The queuer system manages robot inspection and match readiness validation before matches are executed during tournaments.

## Match Statuses

- **SCHEDULED**: Match is scheduled, waiting for robot inspection
- **READY**: Match is ready to be played (robots passed inspection)
- **IN_PROGRESS**: Match is currently being played
- **COMPLETED**: Match has finished
- **CANCELED**: Match was canceled and will need rescheduling

## Match Types

- **NORMAL**: Regular match between two teams
- **SURROGATE**: Match with substitute teams

## Match Formats

- **ROUND_ROBIN**: All teams play against each other
- **DOUBLE_ELIMINATION**: Teams are eliminated on first loss
- **CUSTOM**: Custom format

## Robot Queue Status

- **PASS**: Robot/Team passed inspection and is ready to play
- **FAIL**: Robot/Team failed inspection and cannot participate

## Backend API Endpoints

### 1. Robot Inspection Check
```
POST /:tournamentId/stages/:stageId/matches/:matchId/robot-check
```

**Auth**: QUEUER or ADMIN

**Request Body**:
```json
{
  "robotStatus": "PASS" | "FAIL"
}
```

**Response**:
```json
{
  "success": true,
  "robotStatus": "PASS" | "FAIL"
}
```

**Behavior**:
- If `PASS`: Match transitions from `SCHEDULED` → `READY`
- If `FAIL`: Match remains `SCHEDULED` for rescheduling

### 2. Get Matches Ready for Queue
```
GET /:tournamentId/stages/:stageId/matches-ready-for-queue
```

**Auth**: QUEUER or ADMIN

**Response**:
```json
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

Returns all `SCHEDULED` matches without robot inspection results yet.

### 3. Reschedule Canceled Match
```
PATCH /:tournamentId/stages/:stageId/matches/:matchId/reschedule
```

**Auth**: ADMIN only

**Request Body**:
```json
{
  "scheduledAt": "2025-11-19T14:00:00Z",
  "reason": "Rescheduling due to equipment failure"
}
```

**Response**:
```json
{
  "success": true
}
```

**Behavior**:
- Match transitions from `CANCELED` → `SCHEDULED`
- Robot status is reset to `null` for re-inspection
- New scheduled time is set

## Workflow

### Before Match Execution
1. **Queuer checks robot**: POST `/robot-check` with `PASS` or `FAIL`
   - If PASS → match becomes `READY`
   - If FAIL → match stays `SCHEDULED` until rescheduled

2. **Get queue list**: GET `/matches-ready-for-queue` to see pending inspection

3. **Reschedule if needed**: PATCH `/reschedule` to change time for failed inspections

### Database Schema

The `tournamentMatches` table stores:
- `robotStatus`: "PASS" | "FAIL" | NULL (NULL = pending inspection)
- `status`: Match lifecycle state
- `matchType`: NORMAL or SURROGATE
- `format`: Match format
- `metadata`: Can store inspection notes and failure reasons

## Implementation Notes

- Robot status is stored in the match record alongside match status
- When a match is rescheduled, robot status is reset for re-inspection
- Each match transitions through statuses in a controlled manner
- Queuer role can view and update robot inspection status
- Admin role handles rescheduling and critical changes

## Services Location

Core queuer logic: `apps/server/src/services/match-queuer.ts`

Exported Functions:
- `checkRobotPassStatus()` - Validate robot inspection
- `storeMatchRobotStatus()` - Store pass/fail result
- `updateMatchStatusBasedOnRobotCheck()` - Transition match status
- `rescheduleCanceledMatch()` - Reschedule a canceled match
- `getMatchesReadyForQueuing()` - List pending inspection matches
- `getMatchRobotStatus()` - Get inspection result
