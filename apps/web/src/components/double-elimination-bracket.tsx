import { Badge } from "@/components/ui/badge";
import { getMatchStatusLabel, type MatchStatus } from "@/utils/stages";

type BracketMatchTeam = {
  id: string | null;
  name: string;
  slug: string | null;
  placeholder: string | null;
  logo: string | null;
};

type BracketMatchSource = {
  matchId: string;
  outcome: "WINNER" | "LOSER";
  target: "home" | "away";
  label: string;
};

type BracketMatch = {
  id: string;
  round: string | null;
  status: MatchStatus;
  home: BracketMatchTeam;
  away: BracketMatchTeam;
  score: {
    home: number | null;
    away: number | null;
  };
  metadata?: {
    format?: "ROUND_ROBIN" | "DOUBLE_ELIMINATION";
    label?: string | null;
    bracket?: "WINNERS" | "LOSERS" | "FINALS";
    roundIndex?: number | null;
    matchIndex?: number | null;
    fieldNumber?: number | null;
    sources?: BracketMatchSource[];
  } | null;
};

type DoubleEliminationBracketProps = {
  matches: BracketMatch[];
};

export function DoubleEliminationBracket({
  matches,
}: DoubleEliminationBracketProps) {
  const bracketMatches = matches.filter(
    (match) => match.metadata?.format === "DOUBLE_ELIMINATION"
  );

  if (!bracketMatches.length) {
    return null;
  }

  const winners = filterBracket(bracketMatches, "WINNERS");
  const losers = filterBracket(bracketMatches, "LOSERS");
  const finals = filterBracket(bracketMatches, "FINALS");

  return (
    <div className="space-y-6">
      {renderBracketSection("Winners bracket", winners)}
      {renderBracketSection("Losers bracket", losers)}
      {renderBracketSection("Finals", finals)}
    </div>
  );
}

function renderBracketSection(
  title: string,
  rounds: Map<number, BracketMatch[]>
) {
  if (!rounds.size) {
    return null;
  }
  const roundNumbers = Array.from(rounds.keys()).sort((a, b) => a - b);

  return (
    <section className="space-y-3">
      <p className="font-semibold text-base">{title}</p>
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${roundNumbers.length}, minmax(0, 1fr))`,
        }}
      >
        {roundNumbers.map((round) => (
          <div className="space-y-3" key={`${title}-round-${round}`}>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Round {round}
            </p>
            {rounds
              .get(round)
              ?.sort(
                (a, b) =>
                  (a.metadata?.matchIndex ?? 0) - (b.metadata?.matchIndex ?? 0)
              )
              .map((match) => (
                <BracketMatchCard key={match.id} match={match} />
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function filterBracket(
  matches: BracketMatch[],
  bracket: "WINNERS" | "LOSERS" | "FINALS"
) {
  const grouped = new Map<number, BracketMatch[]>();
  for (const match of matches) {
    if (match.metadata?.bracket !== bracket) {
      continue;
    }
    const roundIndex = match.metadata?.roundIndex ?? 1;
    if (!grouped.has(roundIndex)) {
      grouped.set(roundIndex, []);
    }
    grouped.get(roundIndex)?.push(match);
  }
  return grouped;
}

type BracketMatchCardProps = {
  match: BracketMatch;
};

function BracketMatchCard({ match }: BracketMatchCardProps) {
  const label = match.metadata?.label ?? match.round ?? "Match";
  const sources = match.metadata?.sources ?? [];
  return (
    <div className="rounded-md border bg-background/80 p-3 shadow-sm">
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          {match.metadata?.fieldNumber ? (
            <span className="font-medium text-foreground">
              Field {match.metadata.fieldNumber}
            </span>
          ) : null}
          <Badge variant="outline">{getMatchStatusLabel(match.status)}</Badge>
        </div>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <MatchTeamDisplay
          score={match.score.home}
          side="Home"
          team={match.home}
        />
        <MatchTeamDisplay
          score={match.score.away}
          side="Away"
          team={match.away}
        />
      </div>
      {sources.length ? (
        <div className="mt-3 text-muted-foreground text-xs">
          <p className="font-medium text-foreground">Feeds from</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {sources.map((source) => (
              <li key={`${match.id}-${source.matchId}-${source.target}`}>
                {source.label} ({source.outcome.toLowerCase()})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

type MatchTeamDisplayProps = {
  team: BracketMatchTeam;
  score: number | null;
  side: "Home" | "Away";
};

function MatchTeamDisplay({ team, score, side }: MatchTeamDisplayProps) {
  const name = team.name || team.placeholder || "TBD";
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium leading-tight">{name}</p>
        <p className="text-muted-foreground text-xs">{side}</p>
      </div>
      <span className="font-semibold text-base">{score ?? "—"}</span>
    </div>
  );
}
