import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";

type Tournament = {
  id: string;
  name: string;
  status: string;
};

type StageSummary = {
  id: string;
  name: string;
  status: string;
  stageOrder: number;
  fieldCount: number;
};

type StageMatch = {
  id: string;
  round: string | null;
  status: string;
  metadata?: {
    label?: string | null;
    fieldNumber?: number | null;
  } | null;
  home: {
    name: string;
    placeholder: string | null;
  };
  away: {
    name: string;
    placeholder: string | null;
  };
};

type StageDetail = {
  id: string;
  name: string;
  fieldCount: number;
  matches: StageMatch[];
};

type TournamentsResponse = {
  items: Tournament[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
};

export default function OrgNavigationSelector() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [selectedTournament, setSelectedTournament] = useState<string>("");
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [selectedField, setSelectedField] = useState<string>("");
  const [selectedMatch, setSelectedMatch] = useState<string>("");

  // Fetch tournaments
  const { data: tournamentsData } = useQuery<TournamentsResponse>({
    queryKey: ["tournaments"],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch tournaments");
      }
      return response.json();
    },
  });

  const tournaments = tournamentsData?.items;

  // Fetch stages for selected tournament
  const { data: stagesData } = useQuery<{ stages?: StageSummary[] }>({
    queryKey: ["tournament-stages", selectedTournament],
    queryFn: async () => {
      if (!selectedTournament) {
        return { stages: [] };
      }
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${selectedTournament}/stages`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch stages");
      }
      return response.json();
    },
    enabled: !!selectedTournament,
  });

  const stages = stagesData?.stages ?? [];

  // Fetch selected stage details (matches + field counts)
  const { data: stageDetail } = useQuery<StageDetail | null>({
    queryKey: ["stage-detail", selectedTournament, selectedStage],
    queryFn: async () => {
      if (!(selectedTournament && selectedStage)) {
        return null;
      }
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${selectedTournament}/stages/${selectedStage}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch stage");
      }
      const data = (await response.json()) as { stage?: StageDetail };
      return data.stage ?? null;
    },
    enabled: !!selectedTournament && !!selectedStage,
  });

  // Reset downstream selections when upstream changes
  const handleTournamentChange = (value: string) => {
    setSelectedTournament(value);
    setSelectedStage("");
    setSelectedField("");
    setSelectedMatch("");

    // Navigate to tournament page
    if (value) {
      navigate({
        to: "/tournaments/$tournamentId",
        params: {
          tournamentId: value,
        },
      });
    }
  };

  const handleStageChange = (value: string) => {
    setSelectedStage(value);
    setSelectedField("");
    setSelectedMatch("");

    // Navigate to stages page for the selected tournament
    if (selectedTournament && value) {
      navigate({
        to: "/tournaments/$tournamentId/stages",
        params: {
          tournamentId: selectedTournament,
        },
        search: {
          stageId: value,
        },
      });
    }
  };

  const handleFieldChange = (value: string) => {
    setSelectedField(value);
    setSelectedMatch("");

    // Navigate to stages page with field filter
    if (selectedTournament && selectedStage) {
      navigate({
        to: "/tournaments/$tournamentId/stages",
        params: {
          tournamentId: selectedTournament,
        },
        search: {
          stageId: selectedStage,
          ...(value && { fieldId: value }),
        },
      });
    }
  };

  const handleMatchChange = (value: string) => {
    setSelectedMatch(value);

    // Navigate to match detail page
    if (value) {
      navigate({
        to: "/matches/$matchId",
        params: {
          matchId: value,
        },
      });
    }
  }; // Only show for ORG users
  if (
    !session?.user ||
    (session.user as unknown as { type?: string }).type !== "ORG"
  ) {
    return null;
  }

  const getMatchLabel = (match: StageMatch) => {
    const homeLabel = match.home.name || match.home.placeholder || "TBD";
    const awayLabel = match.away.name || match.away.placeholder || "TBD";
    const prefix = match.metadata?.label || match.round || "Match";
    const fieldLabel = match.metadata?.fieldNumber
      ? ` (Field ${match.metadata.fieldNumber})`
      : "";
    return `${prefix}: ${homeLabel} vs ${awayLabel}${fieldLabel}`;
  };

  const availableFields = stageDetail?.fieldCount ?? 0;
  const matchOptions = (stageDetail?.matches ?? []).filter((match) => {
    if (!selectedField) {
      return true;
    }
    const fieldNumber = Number(selectedField);
    if (Number.isNaN(fieldNumber)) {
      return true;
    }
    return match.metadata?.fieldNumber === fieldNumber;
  });

  return (
    <div className="flex items-center gap-2">
      {/* Tournament Selector */}
      <Select
        className="w-[200px]"
        onChange={(e) => handleTournamentChange(e.target.value)}
        value={selectedTournament}
      >
        <option value="">Select Tournament</option>
        {tournaments?.map((tournament) => (
          <option key={tournament.id} value={tournament.id}>
            {tournament.name}
          </option>
        ))}
      </Select>

      <ChevronRight className="h-4 w-4 text-muted-foreground" />

      {/* Stage Selector */}
      <Select
        className="w-[200px]"
        disabled={!selectedTournament}
        onChange={(e) => handleStageChange(e.target.value)}
        value={selectedStage}
      >
        <option value="">Select Stage</option>
        {stages?.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </Select>

      <ChevronRight className="h-4 w-4 text-muted-foreground" />

      {/* Field Selector (Optional) */}
      <Select
        className="w-[180px]"
        disabled={!selectedStage || availableFields <= 1}
        onChange={(e) => handleFieldChange(e.target.value)}
        value={selectedField}
      >
        <option value="">
          {availableFields <= 1 ? "No fields" : "All fields"}
        </option>
        {availableFields > 1 &&
          Array.from({ length: availableFields }, (_, index) => index + 1).map(
            (fieldNumber) => (
              <option key={`field-${fieldNumber}`} value={fieldNumber}>
                Field {fieldNumber}
              </option>
            )
          )}
      </Select>

      <ChevronRight className="h-4 w-4 text-muted-foreground" />

      {/* Match Selector */}
      <Select
        className="w-[250px]"
        disabled={!selectedStage || matchOptions.length === 0}
        onChange={(e) => handleMatchChange(e.target.value)}
        value={selectedMatch}
      >
        <option value="">Select Match</option>
        {matchOptions.map((match) => (
          <option key={match.id} value={match.id}>
            {getMatchLabel(match)}
          </option>
        ))}
      </Select>
    </div>
  );
}
