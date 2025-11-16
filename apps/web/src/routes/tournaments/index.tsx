import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Calendar,
  Eye,
  Flag,
  Pencil,
  Plus,
  Search,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import Loader from "@/components/loader";
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
import { formatDateTime } from "@/utils/date";
import {
  getTournamentStatusMeta,
  TOURNAMENT_STATUSES,
  type TournamentStatus,
} from "@/utils/tournaments";

type SortField = "createdAt" | "name" | "startDate" | "registrationDeadline";
type SortDirection = "asc" | "desc";
type StatusFilter = "ALL" | TournamentStatus;

type TournamentsSearchState = {
  page: number;
  search: string;
  status: StatusFilter;
  sortField: SortField;
  sortDirection: SortDirection;
};

type TournamentListItem = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
  startDate?: string | null;
  registrationDeadline?: string | null;
  registeredTeams: number;
};

type TournamentsResponse = {
  items: TournamentListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
};

const sortOptions: Array<{
  label: string;
  value: `${SortField}:${SortDirection}`;
}> = [
  { label: "Newest", value: "createdAt:desc" },
  { label: "Oldest", value: "createdAt:asc" },
  { label: "Name (A → Z)", value: "name:asc" },
  { label: "Name (Z → A)", value: "name:desc" },
  { label: "Start date", value: "startDate:asc" },
  { label: "Registration deadline", value: "registrationDeadline:asc" },
];

const isSortField = (value: unknown): value is SortField =>
  value === "createdAt" ||
  value === "name" ||
  value === "startDate" ||
  value === "registrationDeadline";

const isSortDirection = (value: unknown): value is SortDirection =>
  value === "asc" || value === "desc";

export const Route = createFileRoute("/tournaments/")({
  component: TournamentsPage,
  validateSearch: (search: Record<string, unknown>): TournamentsSearchState => {
    const page = Number(search.page);
    const sortField = isSortField(search.sortField)
      ? search.sortField
      : "createdAt";
    const sortDirection = isSortDirection(search.sortDirection)
      ? search.sortDirection
      : "desc";
    const status =
      typeof search.status === "string" ? search.status.toUpperCase() : "ALL";

    return {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      search: typeof search.search === "string" ? search.search : "",
      status:
        status === "ALL" ||
        (TOURNAMENT_STATUSES as readonly string[]).includes(status)
          ? (status as StatusFilter)
          : "ALL",
      sortField,
      sortDirection,
    };
  },
});

function useTournamentSearch() {
  const searchState = Route.useSearch();
  const navigate = useNavigate({ from: "/tournaments" });
  const [searchDraft, setSearchDraft] = useState(searchState.search);

  useEffect(() => {
    setSearchDraft(searchState.search);
  }, [searchState.search]);

  const commitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    navigate({
      search: (prev) => ({
        ...prev,
        search: searchDraft,
        page: 1,
      }),
    });
  };

  const updateStatus = (status: StatusFilter) => {
    navigate({
      search: (prev) => ({
        ...prev,
        status,
        page: 1,
      }),
    });
  };

  const updateSort = (value: string) => {
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

  const changePage = (page: number) => {
    navigate({
      search: (prev) => ({
        ...prev,
        page: Math.max(1, page),
      }),
    });
  };

  return {
    searchState,
    searchDraft,
    setSearchDraft,
    commitSearch,
    updateStatus,
    updateSort,
    changePage,
  };
}

function TournamentsPage() {
  const {
    searchState,
    searchDraft,
    setSearchDraft,
    commitSearch,
    updateSort,
    updateStatus,
    changePage,
  } = useTournamentSearch();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "ADMIN";

  const listQuery = useQuery<TournamentsResponse>({
    queryKey: ["tournaments", searchState],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", searchState.page.toString());
      params.set("sortField", searchState.sortField);
      params.set("sortDirection", searchState.sortDirection);
      if (searchState.search) {
        params.set("search", searchState.search);
      }
      if (searchState.status !== "ALL") {
        params.set("status", searchState.status);
      }

      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch tournaments");
      }
      return response.json() as Promise<TournamentsResponse>;
    },
  });

  if (listQuery.isPending) {
    return <Loader />;
  }

  if (listQuery.error) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load tournaments</CardTitle>
            <CardDescription>
              {listQuery.error instanceof Error
                ? listQuery.error.message
                : "Please try again in a few moments."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const tournaments = listQuery.data?.items ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Tournaments</h1>
          <p className="text-muted-foreground">
            Browse every public event, see key dates at a glance, and jump into
            registration.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link search={{}} to="/score-profiles">
                <Sparkles className="mr-2 h-4 w-4" /> Score profiles
              </Link>
            </Button>
            <Button asChild>
              <Link search={{}} to="/tournaments/new">
                <Plus className="mr-2 h-4 w-4" /> Create tournament
              </Link>
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Search, sort, and filter the public tournament directory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-3 md:flex-row"
            onSubmit={commitSearch}
          >
            <div className="flex flex-1 items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search by name, location, or description"
                value={searchDraft}
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">Status</p>
              <Select
                onChange={(event) =>
                  updateStatus(event.target.value as StatusFilter)
                }
                value={searchState.status}
              >
                <option value="ALL">All statuses</option>
                {TOURNAMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getTournamentStatusMeta(status).label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">Sort</p>
              <Select
                onChange={(event) => updateSort(event.target.value)}
                value={`${searchState.sortField}:${searchState.sortDirection}`}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1 rounded-md border p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <Users className="h-4 w-4" /> Total tournaments
              </p>
              <p className="font-semibold text-2xl text-foreground">
                {pagination?.totalItems ?? 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Register deadline
                    </div>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Starts
                    </div>
                  </th>
                  <th className="px-4 py-3 font-medium">Teams</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-muted-foreground"
                      colSpan={7}
                    >
                      No tournaments have been published yet.
                    </td>
                  </tr>
                )}
                {tournaments.map((tournament) => {
                  const statusMeta = getTournamentStatusMeta(tournament.status);
                  return (
                    <tr className="border-b last:border-0" key={tournament.id}>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium">{tournament.name}</span>
                          <span className="text-muted-foreground text-xs">
                            /tournaments/{tournament.slug}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="line-clamp-2 text-muted-foreground text-xs md:text-sm">
                          {tournament.description || "No description"}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {formatDateTime(tournament.registrationDeadline)}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {formatDateTime(tournament.startDate)}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {tournament.registeredTeams}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={statusMeta.badgeVariant}>
                          {statusMeta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Button asChild size="icon" variant="ghost">
                            <Link
                              params={{ tournamentId: tournament.slug }}
                              search={{}}
                              to="/tournaments/$tournamentId"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button asChild size="icon" variant="ghost">
                            <Link
                              params={{ tournamentId: tournament.slug }}
                              search={{}}
                              to="/tournaments/$tournamentId/stages"
                            >
                              <Flag className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button asChild size="icon" variant="ghost">
                            <Link
                              params={{ tournamentId: tournament.slug }}
                              search={{}}
                              to="/tournaments/$tournamentId/register"
                            >
                              <UserPlus className="h-4 w-4" />
                            </Link>
                          </Button>
                          {isAdmin && (
                            <Button asChild size="icon" variant="ghost">
                              <Link
                                params={{ tournamentId: tournament.slug }}
                                search={{}}
                                to="/tournaments/$tournamentId/edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {pagination && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              disabled={pagination.page === 1}
              onClick={() => changePage(pagination.page - 1)}
              variant="outline"
            >
              Previous
            </Button>
            <Button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => changePage(pagination.page + 1)}
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
