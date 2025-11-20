import { prisma } from "../lib/prisma";

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
 */
export function checkRobotPassStatus(
  _matchId: string,
  _teamId: string,
  checkData: { passed: boolean; notes?: string }
): RobotQueueCheckResult {
  const status = checkData.passed ? "PASS" : "FAIL";
  return { passed: checkData.passed, status, notes: checkData.notes };
}

/**
 * Store robot status for a match
 */
export async function storeMatchRobotStatus(
  matchId: string,
  status: "PASS" | "FAIL",
  record?: MatchRobotCheckRecord
): Promise<void> {
  await prisma.tournamentMatch.update({
    where: { id: matchId },
    data: {
      robotStatus: status,
      metadata:
        record && status === "FAIL"
          ? {
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
            }
          : undefined,
      updatedAt: new Date(),
    },
  });
}

/**
 * Get robot status for a match
 */
export async function getMatchRobotStatus(matchId: string): Promise<{
  status: "PASS" | "FAIL" | null;
  notes?: string;
} | null> {
  const match = await prisma.tournamentMatch.findUnique({
    where: { id: matchId },
    select: { robotStatus: true },
  });
  if (!match) return null;
  return { status: match.robotStatus };
}

/**
 * Transition match status based on robot inspection
 */
export async function updateMatchStatusBasedOnRobotCheck(
  matchId: string,
  robotStatus: "PASS" | "FAIL"
): Promise<void> {
  const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");

  if (match.status === "SCHEDULED") {
    const newStatus = robotStatus === "PASS" ? "READY" : "SCHEDULED";
    await prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { status: newStatus, robotStatus, updatedAt: new Date() },
    });
  }
}

/**
 * Reschedule a canceled match
 */
export async function rescheduleCanceledMatch(
  matchId: string,
  newScheduledTime: Date
): Promise<void> {
  const match = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.status !== "CANCELED") throw new Error("Can only reschedule canceled matches");

  await prisma.tournamentMatch.update({
    where: { id: matchId },
    data: {
      status: "SCHEDULED",
      scheduledAt: newScheduledTime,
      robotStatus: null,
      updatedAt: new Date(),
    },
  });
}

/**
 * Get all matches ready for queuing (SCHEDULED and robotStatus is null)
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
  const where: any = { tournamentId, status: "SCHEDULED", robotStatus: null };
  if (stageId) where.stageId = stageId;

  const matches = await prisma.tournamentMatch.findMany({
    where,
    select: {
      id: true,
      round: true,
      homeTeamId: true,
      awayTeamId: true,
      scheduledAt: true,
      status: true,
    },
  });

  return matches;
}
