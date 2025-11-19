import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Grid3X3, List } from "lucide-react";
import { useEffect, useState } from "react";
import Loader from "@/components/loader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { formatStatus } from "@/utils/teams";

type SortField = "createdAt" | "name" | "status" | "teamNumber";
type SortDirection = "asc" | "desc";

type TeamsSearchState = {
  page: number;
  search: string;
  sortField: SortField;
  sortDirection: SortDirection;
};

const sortFieldOptions: Array<{
  label: string;
  value: `${SortField}:${SortDirection}`;
}> = [
  { label: "Newest first", value: "createdAt:desc" },
  { label: "Oldest first", value: "createdAt:asc" },
  { label: "Name (A → Z)", value: "name:asc" },
  { label: "Name (Z → A)", value: "name:desc" },
  { label: "Status (A → Z)", value: "status:asc" },
  { label: "Status (Z → A)", value: "status:desc" },
  { label: "Team number (low → high)", value: "teamNumber:asc" },
  { label: "Team number (high → low)", value: "teamNumber:desc" },
];

const isSortField = (value: unknown): value is SortField =>
  value === "createdAt" ||
  value === "name" ||
  value === "status" ||
  value === "teamNumber";

const isSortDirection = (value: unknown): value is SortDirection =>
  value === "asc" || value === "desc";

type TeamListItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  logo?: string;
  coverImage?: string | null;
  teamNumber?: string;
  location?: string;
  description?: string;
  createdAt: string;
  isMember: boolean;
  memberRole?: string;
  memberJoinedAt?: string;
};

type TeamsResponse = {
  items: TeamListItem[];
  pagination: {
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
  meta: Record<string, unknown>;
};

function TeamsErrorState({ error }: { error: Error }) {
  return (
    <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div>
        <h1 className="font-bold text-3xl">Teams</h1>
        <p className="text-destructive">
          {error instanceof Error
            ? error.message
            : "Failed to load teams. Please try again later."}
        </p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/teams/")({
  component: TeamsRoute,
  validateSearch: (search: Record<string, unknown>): TeamsSearchState => {
    const page = Number(search.page);
    const sortField = isSortField(search.sortField)
      ? search.sortField
      : "createdAt";
    const sortDirection = isSortDirection(search.sortDirection)
      ? search.sortDirection
      : "desc";

    return {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      search: typeof search.search === "string" ? search.search : "",
      sortField,
      sortDirection,
    };
  },
});

function useTeamSearch() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/teams" });
  const [searchDraft, setSearchDraft] = useState(search.search);

  useEffect(() => {
    setSearchDraft(search.search);
  }, [search.search]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    navigate({
      search: (prev) => ({
        ...prev,
        search: searchDraft.trim(),
        page: 1,
      }),
    });
  };

  const handleSortChange = (value: string) => {
    const [field, direction] = value.split(":");
    navigate({
      search: (prev) => ({
        ...prev,
        sortField: isSortField(field) ? field : prev.sortField,
        sortDirection: isSortDirection(direction)
          ? (direction as SortDirection)
          : prev.sortDirection,
        page: 1,
      }),
    });
  };

  const handlePageChange = (page: number) => {
    navigate({
      search: (prev) => ({
        ...prev,
        page: Math.max(1, page),
      }),
    });
  };

  return {
    search,
    searchDraft,
    setSearchDraft,
    handleSearchSubmit,
    handleSortChange,
    handlePageChange,
  };
}

function TeamsRoute() {
  const {
    search,
    searchDraft,
    setSearchDraft,
    handleSearchSubmit,
    handleSortChange,
    handlePageChange,
  } = useTeamSearch();
  const { data: session } = authClient.useSession();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const listQuery = useQuery<TeamsResponse>({
    queryKey: ["teams", search],
    queryFn: async (): Promise<TeamsResponse> => {
      const params = new URLSearchParams();
      params.set("page", search.page.toString());
      if (search.search) {
        params.set("search", search.search);
      }
      params.set("sortField", search.sortField);
      params.set("sortDirection", search.sortDirection);

      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/teams?${params}`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch teams");
      }
      return response.json();
    },
  });

  if (listQuery.isPending) {
    return <Loader />;
  }

  if (listQuery.error) {
    return <TeamsErrorState error={listQuery.error} />;
  }

  const teams = listQuery.data?.items ?? [];
  const pagination = listQuery.data?.pagination;

  const canCreate = !!session?.user;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Teams</h1>
          <p className="text-muted-foreground">
            Browse every registered team and quickly jump into the ones you own.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
              size="sm"
              title={
                viewMode === "grid"
                  ? "Switch to list view"
                  : "Switch to grid view"
              }
              variant="outline"
            >
              {viewMode === "grid" ? (
                <List className="h-4 w-4" />
              ) : (
                <Grid3X3 className="h-4 w-4" />
              )}
            </Button>
            <Button asChild disabled={!canCreate}>
              <Link search={{}} to="/teams/new">
                Create team
              </Link>
            </Button>
          </div>
          {!canCreate && (
            <p className="text-muted-foreground text-xs">
              Only verified mentors over 18 can create teams.
            </p>
          )}
        </div>
      </div>

      <section className="space-y-4 rounded-lg border p-4">
        <form
          className="flex flex-col gap-3 md:flex-row"
          onSubmit={handleSearchSubmit}
        >
          <div className="flex flex-1 gap-2">
            <Input
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search team name, number, or location..."
              value={searchDraft}
            />
            <Button type="submit">Search</Button>
          </div>
          <div className="flex items-center gap-2">
            <label className="font-medium text-sm" htmlFor="sort-select">
              Sort:
            </label>
            <Select
              id="sort-select"
              onChange={(event) => handleSortChange(event.target.value)}
              value={`${search.sortField}:${search.sortDirection}`}
            >
              {sortFieldOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        {(() => {
          if (teams.length === 0) {
            return (
              <Card>
                <CardHeader>
                  <CardTitle>No teams found</CardTitle>
                  <CardDescription>
                    {search.search
                      ? "No teams match your search."
                      : "There are no teams registered yet."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {search.search && (
                    <div className="text-muted-foreground text-sm">
                      <p className="mb-2">Try:</p>
                      <ul className="list-disc space-y-1 pl-6">
                        <li>Using different search terms</li>
                      </ul>
                    </div>
                  )}
                  {!search.search && canCreate && (
                    <div className="flex flex-col items-start gap-3">
                      <p className="text-muted-foreground text-sm">
                        Be the first to create a team!
                      </p>
                      <Button asChild>
                        <Link search={{}} to="/teams/new">
                          Create your team
                        </Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          }

          if (viewMode === "grid") {
            return (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {teams.map((team: TeamListItem) => (
                  <TeamCardGrid key={team.id} team={team} />
                ))}
              </div>
            );
          }

          return (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-sm">
                      Avatar
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left font-medium text-sm hover:bg-muted/70"
                      onClick={() =>
                        handleSortChange(
                          search.sortField === "teamNumber" &&
                            search.sortDirection === "asc"
                            ? "teamNumber:desc"
                            : "teamNumber:asc"
                        )
                      }
                    >
                      Team Number{" "}
                      {search.sortField === "teamNumber" &&
                        (search.sortDirection === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left font-medium text-sm hover:bg-muted/70"
                      onClick={() =>
                        handleSortChange(
                          search.sortField === "name" &&
                            search.sortDirection === "asc"
                            ? "name:desc"
                            : "name:asc"
                        )
                      }
                    >
                      Team Name{" "}
                      {search.sortField === "name" &&
                        (search.sortDirection === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-sm">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-sm">
                      Join Date
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-sm">
                      Members
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-sm">
                      Tournaments
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-sm">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team: TeamListItem) => (
                    <TeamTableRow key={team.id} team={team} />
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </section>

      {pagination && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between text-sm">
            <div className="text-muted-foreground">
              Showing {teams.length} of {pagination.totalItems} teams
            </div>
            <div className="flex items-center gap-2">
              <Button
                disabled={search.page <= 1}
                onClick={() => handlePageChange(search.page - 1)}
                type="button"
                variant="outline"
              >
                Previous
              </Button>
              <span>
                Page {search.page} of {Math.max(pagination.totalPages, 1)}
              </span>
              <Button
                disabled={!pagination.hasMore}
                onClick={() => handlePageChange(search.page + 1)}
                type="button"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TeamCardGrid({ team }: { team: TeamListItem }) {
  const statusMeta = formatStatus(team.status);
  const cardClass = cn(
    "h-full",
    "transition-shadow",
    "rounded-xl",
    "border",
    "bg-card",
    "ring-1",
    "ring-border",
    team.isMember
      ? "border-primary bg-primary/5 shadow-md ring-primary/30"
      : "hover:shadow-md"
  );

  return (
    <Card className={cardClass}>
      <CardContent className="flex flex-col items-center gap-3 p-4 text-center">
        <Avatar className="h-12 w-12">
          <AvatarImage alt={team.name} src={team.logo} />
          <AvatarFallback>{team.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="space-y-1">
          <Link
            className="font-semibold text-foreground text-sm leading-tight hover:underline"
            params={{ slug: team.slug }}
            search={{}}
            to="/teams/$slug"
          >
            {team.name}
          </Link>
          {team.teamNumber && (
            <p className="text-muted-foreground text-xs">#{team.teamNumber}</p>
          )}
          {team.location && (
            <p className="text-muted-foreground text-xs">{team.location}</p>
          )}
        </div>
        <Badge className="text-xs" variant={statusMeta.badgeVariant}>
          {statusMeta.label}
        </Badge>
        {team.isMember && (
          <div className="flex w-full flex-col gap-2 text-sm">
            <Badge className="text-xs" variant="secondary">
              Your team
            </Badge>
            <Button asChild className="w-full" size="sm" variant="secondary">
              <Link params={{ slug: team.slug }} search={{}} to="/teams/$slug">
                View my team
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeamTableRow({ team }: { team: TeamListItem }) {
  const statusMeta = formatStatus(team.status);
  const joinDate = team.memberJoinedAt
    ? new Date(team.memberJoinedAt)
    : new Date(team.createdAt);
  const rowHighlight = cn(
    "border-b hover:bg-muted/50",
    team.isMember && "bg-primary/5"
  );

  return (
    <tr className={rowHighlight}>
      <td className="px-4 py-3">
        <Avatar className="h-8 w-8">
          <AvatarImage alt={team.name} src={team.logo} />
          <AvatarFallback>{team.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </td>
      <td className="px-4 py-3 text-sm">{team.teamNumber || "N/A"}</td>
      <td className="px-4 py-3 font-medium text-sm">
        <div className="flex items-center gap-2">
          <Link
            className="text-foreground hover:underline"
            params={{ slug: team.slug }}
            search={{}}
            to="/teams/$slug"
          >
            {team.name}
          </Link>
          {team.isMember && (
            <Badge className="text-xs" variant="secondary">
              Your team
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground text-sm">
        {team.location || "N/A"}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-sm">
        {joinDate.toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-sm">N/A</td>
      <td className="px-4 py-3 text-muted-foreground text-sm">N/A</td>
      <td className="px-4 py-3 text-sm">
        <div className="flex flex-col gap-2">
          <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
          {team.isMember && (
            <Button
              asChild
              className="w-fit border-muted text-xs"
              size="xs"
              variant="outline"
            >
              <Link params={{ slug: team.slug }} search={{}} to="/teams/$slug">
                View my team
              </Link>
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
