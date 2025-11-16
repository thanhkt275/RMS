import crypto from "node:crypto";

export type AllianceColor = "RED" | "BLUE";
export type AllianceStation = `${AllianceColor}${number}`;

export type ScheduledSlot = {
  teamId: string;
  station: AllianceStation;
  color: AllianceColor;
  isSurrogate: boolean;
};

export type ScheduledMatchPlan = {
  id: string;
  roundNumber: number;
  matchNumber: number;
  slots: ScheduledSlot[];
  redAlliance: ScheduledSlot[];
  blueAlliance: ScheduledSlot[];
};

export type MatchScheduleMetadata = {
  rounds: number;
  teamsPerAlliance: number;
  minMatchGap: number;
  stations: AllianceStation[];
  matches: Array<{
    id: string;
    roundNumber: number;
    matchNumber: number;
    slots: ScheduledSlot[];
  }>;
};

export type MatchSchedulerConfig = {
  teamIds: string[];
  rounds: number;
  teamsPerAlliance?: number;
  minMatchGap?: number;
  allowSurrogates?: boolean;
};

export type MatchScheduleResult = {
  matches: ScheduledMatchPlan[];
  warnings: string[];
  metadata: MatchScheduleMetadata;
};

const DEFAULT_TEAMS_PER_ALLIANCE = 1;
const DEFAULT_MIN_GAP = 4;
const MAX_APPEARANCES_PER_ROUND = 1;

type NormalizedSchedulerConfig = {
  teamIds: string[];
  rounds: number;
  teamsPerAlliance: number;
  minMatchGap: number;
  allowSurrogates: boolean;
};

type TeamStats = {
  officialAppearances: number;
  surrogateAppearances: number;
  totalAppearances: number;
  redAppearances: number;
  blueAppearances: number;
  lastMatchNumber: number;
  stationCounts: Partial<Record<AllianceStation, number>>;
};

type WarningFlags = {
  gapRelaxed: boolean;
  duplicatePairings: boolean;
};

type CandidateSelection = {
  teamId: string;
  isSurrogate: boolean;
  ignoreGap: boolean;
};

type SlotSelectionContext = {
  station: AllianceStation;
  assignments: ScheduledSlot[];
  primaryQueue: Set<string>;
  roundUsage: Map<string, number>;
  assignedTeams: Set<string>;
  surrogateBudget: number;
  totalSlotsThisRound: number;
  slotsScheduledThisRound: number;
};

export function buildMatchSchedule(
  config: MatchSchedulerConfig
): MatchScheduleResult {
  const normalized = normalizeConfig(config);
  const scheduler = new MatchScheduler(normalized);
  return scheduler.generate();
}

class MatchScheduler {
  private readonly config: NormalizedSchedulerConfig;
  private readonly teamStats = new Map<string, TeamStats>();
  private readonly partnerHistory = new Map<string, number>();
  private readonly opponentHistory = new Map<string, number>();
  private readonly warningFlags: WarningFlags = {
    gapRelaxed: false,
    duplicatePairings: false,
  };
  private readonly stationOrder: AllianceStation[];
  private readonly matchesPerRound: number;
  private readonly totalSlotsPerRound: number;
  private readonly surrogateSlotsPerRound: number;
  private currentMatchNumber = 0;

  constructor(config: NormalizedSchedulerConfig) {
    this.config = config;
    for (const teamId of config.teamIds) {
      this.teamStats.set(teamId, createInitialTeamStats());
    }
    this.stationOrder = this.buildStationOrder();
    const matchSize = this.stationOrder.length;
    this.matchesPerRound = Math.max(
      1,
      Math.ceil(config.teamIds.length / matchSize)
    );
    this.totalSlotsPerRound = this.matchesPerRound * matchSize;
    this.surrogateSlotsPerRound = Math.max(
      0,
      this.totalSlotsPerRound - config.teamIds.length
    );
  }

  generate(): MatchScheduleResult {
    const matches: ScheduledMatchPlan[] = [];
    for (let round = 1; round <= this.config.rounds; round += 1) {
      matches.push(...this.scheduleRound(round));
    }

    return {
      matches,
      warnings: this.collectWarnings(),
      metadata: this.buildMetadata(matches),
    };
  }

  private scheduleRound(roundNumber: number) {
    const roundUsage = new Map<string, number>();
    const primaryQueue = new Set(this.config.teamIds);
    let surrogateBudget = this.surrogateSlotsPerRound;
    let slotsScheduled = 0;
    const matches: ScheduledMatchPlan[] = [];

    for (let index = 0; index < this.matchesPerRound; index += 1) {
      this.currentMatchNumber += 1;
      const { match, remainingSurrogateBudget, slotsUsed } = this.buildMatch({
        roundNumber,
        roundUsage,
        primaryQueue,
        surrogateBudget,
        slotsScheduledThisRound: slotsScheduled,
      });
      matches.push(match);
      surrogateBudget = remainingSurrogateBudget;
      slotsScheduled += slotsUsed;
    }

    return matches;
  }

  private buildMatch(config: {
    roundNumber: number;
    roundUsage: Map<string, number>;
    primaryQueue: Set<string>;
    surrogateBudget: number;
    slotsScheduledThisRound: number;
  }) {
    const assignments: ScheduledSlot[] = [];
    const assignedTeams = new Set<string>();
    let positionsUsed = 0;
    let surrogateBudget = config.surrogateBudget;

    for (const station of this.stationOrder) {
      const selection = this.selectTeamForSlot({
        station,
        assignments,
        primaryQueue: config.primaryQueue,
        roundUsage: config.roundUsage,
        assignedTeams,
        surrogateBudget,
        totalSlotsThisRound: this.totalSlotsPerRound,
        slotsScheduledThisRound: config.slotsScheduledThisRound + positionsUsed,
      });
      const slot = {
        teamId: selection.teamId,
        station,
        color: getStationColor(station),
        isSurrogate: selection.isSurrogate,
      };
      assignments.push(slot);
      assignedTeams.add(selection.teamId);
      positionsUsed += 1;

      const existingUsage = config.roundUsage.get(selection.teamId) ?? 0;
      config.roundUsage.set(selection.teamId, existingUsage + 1);

      if (selection.isSurrogate) {
        surrogateBudget -= 1;
      } else {
        config.primaryQueue.delete(selection.teamId);
      }
    }

    const match = this.finalizeMatch(config.roundNumber, assignments);

    return {
      match,
      remainingSurrogateBudget: surrogateBudget,
      slotsUsed: assignments.length,
    };
  }

  private selectTeamForSlot(context: SlotSelectionContext): CandidateSelection {
    const forceOfficial = this.shouldForceOfficial(context);

    // 1. Try official assignments respecting gap.
    const officialCandidate = this.chooseCandidate({
      pool: context.primaryQueue,
      station: context.station,
      assignments: context.assignments,
      assignedTeams: context.assignedTeams,
      roundUsage: context.roundUsage,
      isSurrogate: false,
      ignoreGap: false,
    });
    if (officialCandidate) {
      return officialCandidate;
    }

    // 2. Use surrogate if allowed and not forced to stay official.
    if (
      !forceOfficial &&
      context.surrogateBudget > 0 &&
      this.config.allowSurrogates
    ) {
      const surrogateCandidate = this.chooseCandidate({
        pool: this.buildSurrogatePool(context.roundUsage),
        station: context.station,
        assignments: context.assignments,
        assignedTeams: context.assignedTeams,
        roundUsage: context.roundUsage,
        isSurrogate: true,
        ignoreGap: false,
      });
      if (surrogateCandidate) {
        return surrogateCandidate;
      }
    }

    // 3. Relax gap for officials if necessary.
    const relaxedOfficial = this.chooseCandidate({
      pool: context.primaryQueue,
      station: context.station,
      assignments: context.assignments,
      assignedTeams: context.assignedTeams,
      roundUsage: context.roundUsage,
      isSurrogate: false,
      ignoreGap: true,
    });
    if (relaxedOfficial) {
      this.warningFlags.gapRelaxed = true;
      return relaxedOfficial;
    }

    // 4. Relax gap for surrogates as last resort.
    if (
      !forceOfficial &&
      context.surrogateBudget > 0 &&
      this.config.allowSurrogates
    ) {
      const relaxedSurrogate = this.chooseCandidate({
        pool: this.buildSurrogatePool(context.roundUsage),
        station: context.station,
        assignments: context.assignments,
        assignedTeams: context.assignedTeams,
        roundUsage: context.roundUsage,
        isSurrogate: true,
        ignoreGap: true,
      });
      if (relaxedSurrogate) {
        this.warningFlags.gapRelaxed = true;
        return relaxedSurrogate;
      }
    }

    throw new Error(
      "Unable to satisfy scheduling constraints with the provided teams."
    );
  }

  private shouldForceOfficial(context: SlotSelectionContext) {
    if (!context.primaryQueue.size) {
      return false;
    }
    const slotsLeft =
      context.totalSlotsThisRound - (context.slotsScheduledThisRound + 1);
    return context.primaryQueue.size > slotsLeft;
  }

  private chooseCandidate(config: {
    pool: Iterable<string>;
    station: AllianceStation;
    assignments: ScheduledSlot[];
    assignedTeams: Set<string>;
    roundUsage: Map<string, number>;
    isSurrogate: boolean;
    ignoreGap: boolean;
  }): CandidateSelection | null {
    const candidates: Array<{ id: string; score: number }> = [];
    for (const teamId of config.pool) {
      if (config.assignedTeams.has(teamId)) {
        continue;
      }
      if (
        config.isSurrogate &&
        (config.roundUsage.get(teamId) ?? 0) >= MAX_APPEARANCES_PER_ROUND
      ) {
        continue;
      }
      if (!(config.ignoreGap || this.respectsGap(teamId))) {
        continue;
      }
      const score = this.scoreCandidate({
        teamId,
        station: config.station,
        assignments: config.assignments,
        isSurrogate: config.isSurrogate,
      });
      candidates.push({ id: teamId, score });
    }
    if (!candidates.length) {
      return null;
    }
    candidates.sort((a, b) => {
      if (b.score === a.score) {
        return a.id.localeCompare(b.id);
      }
      return b.score - a.score;
    });
    const [bestCandidate] = candidates;
    if (!bestCandidate) {
      return null;
    }
    return {
      teamId: bestCandidate.id,
      isSurrogate: config.isSurrogate,
      ignoreGap: config.ignoreGap,
    };
  }

  private buildSurrogatePool(roundUsage: Map<string, number>) {
    return this.config.teamIds.filter(
      (teamId) => (roundUsage.get(teamId) ?? 0) === 1
    );
  }

  private finalizeMatch(roundNumber: number, assignments: ScheduledSlot[]) {
    const id = crypto.randomUUID();
    const redAlliance = assignments.filter((slot) => slot.color === "RED");
    const blueAlliance = assignments.filter((slot) => slot.color === "BLUE");

    this.updateStats(assignments);
    this.updatePairHistory(redAlliance, blueAlliance);

    return {
      id,
      roundNumber,
      matchNumber: this.currentMatchNumber,
      slots: assignments.map((slot) => ({ ...slot })),
      redAlliance,
      blueAlliance,
    };
  }

  private updateStats(assignments: ScheduledSlot[]) {
    for (const slot of assignments) {
      const stats = this.teamStats.get(slot.teamId);
      if (!stats) {
        continue;
      }
      stats.totalAppearances += 1;
      if (slot.isSurrogate) {
        stats.surrogateAppearances += 1;
      } else {
        stats.officialAppearances += 1;
      }
      if (slot.color === "RED") {
        stats.redAppearances += 1;
      } else {
        stats.blueAppearances += 1;
      }
      stats.stationCounts[slot.station] =
        (stats.stationCounts[slot.station] ?? 0) + 1;
      stats.lastMatchNumber = this.currentMatchNumber;
    }
  }

  private updatePairHistory(
    redAlliance: ScheduledSlot[],
    blueAlliance: ScheduledSlot[]
  ) {
    this.recordAlliancePairings(redAlliance);
    this.recordAlliancePairings(blueAlliance);
    this.recordOpposingPairings(redAlliance, blueAlliance);
  }

  private recordAlliancePairings(alliance: ScheduledSlot[]) {
    for (let i = 0; i < alliance.length; i += 1) {
      const first = alliance[i];
      if (!first) {
        continue;
      }
      for (let j = i + 1; j < alliance.length; j += 1) {
        const second = alliance[j];
        if (!second) {
          continue;
        }
        this.incrementPairHistory("ALLY", first.teamId, second.teamId);
      }
    }
  }

  private recordOpposingPairings(
    redAlliance: ScheduledSlot[],
    blueAlliance: ScheduledSlot[]
  ) {
    for (const red of redAlliance) {
      if (!red) {
        continue;
      }
      for (const blue of blueAlliance) {
        if (!blue) {
          continue;
        }
        this.incrementPairHistory("OPP", red.teamId, blue.teamId);
      }
    }
  }

  private incrementPairHistory(
    type: "ALLY" | "OPP",
    teamA: string,
    teamB: string
  ) {
    const sorted = [teamA, teamB].sort();
    const key = `${type}:${sorted[0]}:${sorted[1]}`;
    const store = type === "ALLY" ? this.partnerHistory : this.opponentHistory;
    const next = (store.get(key) ?? 0) + 1;
    store.set(key, next);
    if (next > 1) {
      this.warningFlags.duplicatePairings = true;
    }
  }

  private scoreCandidate(config: {
    teamId: string;
    station: AllianceStation;
    assignments: ScheduledSlot[];
    isSurrogate: boolean;
  }) {
    const stats = this.teamStats.get(config.teamId);
    if (!stats) {
      return Number.NEGATIVE_INFINITY;
    }
    let score = 0;
    const color = getStationColor(config.station);

    const remainingOfficialMatches =
      this.config.rounds - stats.officialAppearances;
    score += remainingOfficialMatches * 5;

    const gapValue = this.computeGapValue(stats);
    score += Math.min(gapValue, 5) * 2;

    score += this.computeColorBalanceScore(color, stats);
    score += this.computeStationBalanceScore(config.station, stats);
    score -= this.computePairingPenalty(
      config.teamId,
      color,
      config.assignments
    );

    if (config.isSurrogate) {
      score -= 15 + stats.surrogateAppearances * 4;
    }

    return score;
  }

  private computePairingPenalty(
    teamId: string,
    color: AllianceColor,
    assignments: ScheduledSlot[]
  ) {
    let penalty = 0;
    for (const slot of assignments) {
      const sameAlliance = slot.color === color;
      const keyPrefix = sameAlliance ? "ALLY" : "OPP";
      const sorted = [teamId, slot.teamId].sort();
      const key = `${keyPrefix}:${sorted[0]}:${sorted[1]}`;
      const history = sameAlliance
        ? this.partnerHistory.get(key)
        : this.opponentHistory.get(key);
      if (history) {
        penalty += history * (sameAlliance ? 4 : 3);
      }
    }
    return penalty;
  }

  private computeColorBalanceScore(color: AllianceColor, stats: TeamStats) {
    const diff =
      color === "RED"
        ? stats.blueAppearances - stats.redAppearances
        : stats.redAppearances - stats.blueAppearances;
    return diff * 4;
  }

  private computeStationBalanceScore(
    station: AllianceStation,
    stats: TeamStats
  ) {
    const current = stats.stationCounts[station] ?? 0;
    if (!this.stationOrder.length) {
      return 0;
    }
    const usages = this.stationOrder.map(
      (key) => stats.stationCounts[key] ?? 0
    );
    const minUsage = Math.min(...usages);
    return (minUsage - current) * 2;
  }

  private computeGapValue(stats: TeamStats) {
    if (!stats.lastMatchNumber) {
      return this.config.minMatchGap + 1;
    }
    return this.currentMatchNumber - stats.lastMatchNumber - 1;
  }

  private respectsGap(teamId: string) {
    if (this.config.minMatchGap <= 0) {
      return true;
    }
    const stats = this.teamStats.get(teamId);
    if (!stats) {
      return true;
    }
    if (!stats.lastMatchNumber) {
      return true;
    }
    const gap = this.currentMatchNumber - stats.lastMatchNumber - 1;
    return gap >= this.config.minMatchGap;
  }

  private collectWarnings() {
    const warnings: string[] = [];
    if (this.warningFlags.gapRelaxed) {
      warnings.push(
        "Match separation gap could not be honored for every assignment. Review closely scheduled teams."
      );
    }
    if (this.warningFlags.duplicatePairings) {
      warnings.push(
        "Some alliances or opponent pairings repeat more than once. Consider manual adjustments if diversity is critical."
      );
    }
    const redBlueSkew: string[] = [];
    const stationSkew: string[] = [];
    const surrogateUsage: string[] = [];

    for (const [teamId, stats] of this.teamStats.entries()) {
      if (Math.abs(stats.redAppearances - stats.blueAppearances) > 1) {
        redBlueSkew.push(teamId);
      }
      const usages = this.stationOrder.map(
        (station) => stats.stationCounts[station] ?? 0
      );
      if (Math.max(...usages) - Math.min(...usages) > 1) {
        stationSkew.push(teamId);
      }
      if (stats.surrogateAppearances > 0) {
        surrogateUsage.push(
          `${teamId} (${stats.surrogateAppearances} surrogate)`
        );
      }
    }

    if (redBlueSkew.length) {
      warnings.push(
        `Red/blue assignments remain unbalanced for: ${redBlueSkew.join(", ")}.`
      );
    }
    if (stationSkew.length) {
      warnings.push(
        `Station rotations need review for: ${stationSkew.join(", ")}.`
      );
    }
    if (surrogateUsage.length) {
      warnings.push(
        `Surrogate appearances were assigned to: ${surrogateUsage.join(", ")}.`
      );
    }

    return warnings;
  }

  private buildMetadata(matches: ScheduledMatchPlan[]): MatchScheduleMetadata {
    return {
      rounds: this.config.rounds,
      teamsPerAlliance: this.config.teamsPerAlliance,
      minMatchGap: this.config.minMatchGap,
      stations: [...this.stationOrder],
      matches: matches.map((match) => ({
        id: match.id,
        roundNumber: match.roundNumber,
        matchNumber: match.matchNumber,
        slots: match.slots.map((slot) => ({ ...slot })),
      })),
    };
  }

  private buildStationOrder() {
    const stations: AllianceStation[] = [];
    for (let index = 1; index <= this.config.teamsPerAlliance; index += 1) {
      stations.push(`RED${index}` as AllianceStation);
      stations.push(`BLUE${index}` as AllianceStation);
    }
    return stations;
  }
}

function normalizeConfig(
  config: MatchSchedulerConfig
): NormalizedSchedulerConfig {
  const uniqueTeamIds = Array.from(new Set(config.teamIds));
  if (uniqueTeamIds.length < 2) {
    throw new Error("At least two teams are required to build a schedule.");
  }
  const rounds = Number.isFinite(config.rounds)
    ? Math.max(1, Math.floor(config.rounds))
    : 1;
  const teamsPerAlliance = config.teamsPerAlliance
    ? Math.max(1, Math.floor(config.teamsPerAlliance))
    : DEFAULT_TEAMS_PER_ALLIANCE;
  const minMatchGap =
    config.minMatchGap !== undefined
      ? Math.max(0, Math.floor(config.minMatchGap))
      : DEFAULT_MIN_GAP;
  const allowSurrogates =
    config.allowSurrogates === undefined ? true : config.allowSurrogates;

  if (uniqueTeamIds.length < teamsPerAlliance * 2) {
    throw new Error(
      "Not enough teams to populate a full match. Reduce teams per alliance or add more teams."
    );
  }

  return {
    teamIds: uniqueTeamIds,
    rounds,
    teamsPerAlliance,
    minMatchGap,
    allowSurrogates,
  };
}

function createInitialTeamStats(): TeamStats {
  return {
    officialAppearances: 0,
    surrogateAppearances: 0,
    totalAppearances: 0,
    redAppearances: 0,
    blueAppearances: 0,
    lastMatchNumber: 0,
    stationCounts: {},
  };
}

function getStationColor(station: AllianceStation): AllianceColor {
  return station.startsWith("BLUE") ? "BLUE" : "RED";
}
