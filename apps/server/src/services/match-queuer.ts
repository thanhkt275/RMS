import { type AppDB, db } from "@rms-modern/db";
import { tournamentMatches } from "@rms-modern/db/schema/organization";
import { and, eq } from "drizzle-orm";

export type RobotQueueCheckResult = {
  passed: boolean;
  status: "PASS" | "FAIL";
  notes?: string;
};

export type MatchRobotCheckRecord = {
  homeTeamId: string;
  homeTeamStatus: "PASS" | "FAIL";
  homeTeamNotes?: string;
  awayTeamId: string;
  awayTeamStatus: "PASS" | "FAIL";
  awayTeamNotes?: string;
  timestamp: Date;
};

/**
 * Check if a robot/team passes inspection for a match
 * This validates that the robot meets all required criteria to participate
 */
export function checkRobotPassStatus(
  _matchId: string,
  _teamId: string,
  checkData: {
    passed: boolean;
    notes?: string;
  }
): RobotQueueCheckResult {
  // Validation logic for robot inspection
  // Can include: weight checks, size checks, rule compliance, safety checks, etc.

  const status = checkData.passed ? "PASS" : "FAIL";

  return {
    passed: checkData.passed,
    status,
    notes: checkData.notes,
  };
}

/**
 * Store robot status for a match
 * Updates the match record with the robot pass/fail status
 */
export async function storeMatchRobotStatus(
  matchId: string,
  status: "PASS" | "FAIL",
  record?: MatchRobotCheckRecord
): Promise<void> {
  // Store check record for audit trail (optional additional table)
  // For now, we store in the match's robotStatus field

  await (db as AppDB)
    .update(tournamentMatches)
    .set({
      robotStatus: status,
      metadata:
        record && status === "FAIL"
          ? JSON.stringify({
              failureReasons: [
                {
                  homeTeam: {
                    status: record.homeTeamStatus,
                    notes: record.homeTeamNotes,
                  },
                  awayTeam: {
                    status: record.awayTeamStatus,
                    notes: record.awayTeamNotes,
                  },
                  timestamp: record.timestamp.toISOString(),
                },
              ],
            })
          : null,
      updatedAt: new Date(),
    })
    .where(eq(tournamentMatches.id, matchId));
}

/**
 * Get robot status for a match
 */
export async function getMatchRobotStatus(matchId: string): Promise<{
  status: "PASS" | "FAIL" | null;
  notes?: string;
} | null> {
  const match = await (db as AppDB).query.tournamentMatches.findFirst({
    where: eq(tournamentMatches.id, matchId),
  });

  if (!match) {
    return null;
  }

  return {
    status: match.robotStatus,
  };
}

/**
 * Check and transition match status based on robot inspection
 * When robot passes, transition from SCHEDULED -> READY
 * When robot fails, keep in SCHEDULED for rescheduling
 */
export async function updateMatchStatusBasedOnRobotCheck(
  matchId: string,
  robotStatus: "PASS" | "FAIL"
): Promise<void> {
  const match = await (db as AppDB).query.tournamentMatches.findFirst({
    where: eq(tournamentMatches.id, matchId),
  });

  if (!match) {
    throw new Error("Match not found");
  }

  // Only transition if current status allows it
  if (match.status === "SCHEDULED") {
    const newStatus = robotStatus === "PASS" ? "READY" : "SCHEDULED";

    await (db as AppDB)
      .update(tournamentMatches)
      .set({
        status: newStatus,
        robotStatus,
        updatedAt: new Date(),
      })
      .where(eq(tournamentMatches.id, matchId));
  }
}

/**
 * Reschedule a canceled match
 * Simple operation - just update the scheduled time
 */
export async function rescheduleCanceledMatch(
  matchId: string,
  newScheduledTime: Date
): Promise<void> {
  const match = await (db as AppDB).query.tournamentMatches.findFirst({
    where: eq(tournamentMatches.id, matchId),
  });

  if (!match) {
    throw new Error("Match not found");
  }

  if (match.status !== "CANCELED") {
    throw new Error("Can only reschedule canceled matches");
  }

  await (db as AppDB)
    .update(tournamentMatches)
    .set({
      status: "SCHEDULED",
      scheduledAt: newScheduledTime,
      robotStatus: null, // Reset robot status for re-inspection
      updatedAt: new Date(),
    })
    .where(eq(tournamentMatches.id, matchId));
}

/**
 * Get all matches ready for queuing (SCHEDULED matches with robot inspection pending)
 */
export async function getMatchesReadyForQueuing(
  tournamentId: string,
  stageId?: string
): Promise<
  Array<{
    id: string;
    round: string | null;
    homeTeamId: string | null;
    awayTeamId: string | null;
    scheduledAt: Date | null;
    status: string;
  }>
> {
  return await (db as AppDB)
    .select({
      id: tournamentMatches.id,
      round: tournamentMatches.round,
      homeTeamId: tournamentMatches.homeTeamId,
      awayTeamId: tournamentMatches.awayTeamId,
      scheduledAt: tournamentMatches.scheduledAt,
      status: tournamentMatches.status,
    })
    .from(tournamentMatches)
    .where(
      stageId
        ? and(
            eq(tournamentMatches.tournamentId, tournamentId),
            eq(tournamentMatches.stageId, stageId),
            eq(tournamentMatches.status, "SCHEDULED"),
            eq(tournamentMatches.robotStatus, null)
          )
        : and(
            eq(tournamentMatches.tournamentId, tournamentId),
            eq(tournamentMatches.status, "SCHEDULED"),
            eq(tournamentMatches.robotStatus, null)
          )
    );
}
