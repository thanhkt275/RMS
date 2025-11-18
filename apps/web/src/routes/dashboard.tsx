import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarDays,
  ListChecks,
  Users,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { formatDate } from "@/utils/date";
import {
  getTournamentStatusMeta,
  TOURNAMENT_FIELD_ROLE_LABELS,
  TOURNAMENT_FIELD_ROLES,
  type TournamentFieldRoleKey,
  type TournamentStatus,
} from "@/utils/tournaments";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

type AdminOverviewStats = {
  totalTournaments: number;
  upcoming: number;
  ongoing: number;
  completed: number;
  totalRegistrations: number;
};

type AdminOverviewTournament = {
  id: string;
  name: string;
  status: TournamentStatus;
  startDate?: string | null;
  fieldCount: number;
  registeredTeams: number;
};

type AdminOverviewResponse = {
  stats: AdminOverviewStats;
  recentTournaments: AdminOverviewTournament[];
};

type StaffMember = {
  id: string;
  name: string;
  email?: string | null;
  role: TournamentFieldRoleKey;
};

type TournamentListItem = {
  id: string;
  name: string;
  status: TournamentStatus;
  startDate?: string | null;
  fieldCount?: number | null;
};

type TournamentListResponse = {
  items: TournamentListItem[];
  pagination: {
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
};

type FieldRoleUser = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string | null;
};

type FieldRolesResponse = {
  tournament: {
    id: string;
    name: string;
    status: TournamentStatus;
    fieldCount: number;
  };
  fields: Array<{
    fieldNumber: number;
    roles: Record<TournamentFieldRoleKey, FieldRoleUser | null>;
  }>;
};

type FieldAssignmentState = {
  fieldNumber: number;
  roles: Record<TournamentFieldRoleKey, string | null>;
};

export const Route = createFileRoute("/dashboard")({
  component: AdminDashboardPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: "/sign-in",
        throw: true,
      });
    }
    return { session };
  },
});

function toAssignmentState(fields: FieldRolesResponse["fields"]) {
  return fields.map((field) => {
    const roles: Record<TournamentFieldRoleKey, string | null> =
      TOURNAMENT_FIELD_ROLES.reduce(
        (acc, role) => {
          acc[role] = field.roles[role]?.userId ?? null;
          return acc;
        },
        {} as Record<TournamentFieldRoleKey, string | null>
      );
    return {
      fieldNumber: field.fieldNumber,
      roles,
    };
  });
}

function buildAssignmentsPayload(assignments: FieldAssignmentState[]) {
  return {
    assignments: assignments.map((field) => ({
      fieldNumber: field.fieldNumber,
      roles: TOURNAMENT_FIELD_ROLES.reduce(
        (acc, role) => {
          acc[role] = field.roles[role];
          return acc;
        },
        {} as Record<TournamentFieldRoleKey, string | null>
      ),
    })),
  };
}

type OverviewSectionProps = {
  overviewQuery: ReturnType<typeof useQuery<AdminOverviewResponse>>;
};

function OverviewSection({ overviewQuery }: OverviewSectionProps) {
  if (overviewQuery.isPending) {
    return <Loader />;
  }

  if (overviewQuery.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unable to load overview</CardTitle>
          <CardDescription>Please refresh to try again.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const data = overviewQuery.data;
  if (!data) {
    return null;
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="h-5 w-5 text-muted-foreground" />}
          label="Total tournaments"
          value={data.stats.totalTournaments}
        />
        <StatCard
          icon={<CalendarDays className="h-5 w-5 text-muted-foreground" />}
          label="Upcoming"
          value={data.stats.upcoming}
        />
        <StatCard
          icon={<ListChecks className="h-5 w-5 text-muted-foreground" />}
          label="Ongoing"
          value={data.stats.ongoing}
        />
        <StatCard
          icon={<Users className="h-5 w-5 text-muted-foreground" />}
          label="Registered teams"
          value={data.stats.totalRegistrations}
        />
      </div>
      {data.recentTournaments.length > 0 ? (
        <RecentTournamentsCard tournaments={data.recentTournaments} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recent tournaments</CardTitle>
            <CardDescription>
              Quick snapshot of the latest events.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No tournaments found.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

type RecentTournamentsCardProps = {
  tournaments: AdminOverviewTournament[];
};

function RecentTournamentsCard({ tournaments }: RecentTournamentsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent tournaments</CardTitle>
          <CardDescription>
            Quick snapshot of the latest events.
          </CardDescription>
        </div>
        <Button asChild variant="outline">
          <Link
            search={{
              page: 1,
              search: "",
              sortDirection: "asc",
              sortField: "name",
              status: "ALL",
            }}
            to="/tournaments"
          >
            Manage tournaments
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2">Name</th>
                <th className="pb-2">Start date</th>
                <th className="pb-2">Teams</th>
                <th className="pb-2">Fields</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tournaments.map((tournament) => {
                const statusMeta = getTournamentStatusMeta(tournament.status);
                return (
                  <tr className="h-12" key={tournament.id}>
                    <td className="font-medium">
                      <div className="flex flex-col">
                        <span>{tournament.name}</span>
                        <Badge
                          className="w-fit"
                          variant={statusMeta.badgeVariant}
                        >
                          {statusMeta.label}
                        </Badge>
                      </div>
                    </td>
                    <td>
                      {tournament.startDate
                        ? formatDate(tournament.startDate)
                        : "TBD"}
                    </td>
                    <td>{tournament.registeredTeams}</td>
                    <td>{tournament.fieldCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

type FieldStaffingFormProps = {
  displayOptions: TournamentListItem[];
  selectedTournamentId: string;
  onTournamentChange: (id: string) => void;
  tournamentsQuery: ReturnType<typeof useInfiniteQuery<TournamentListResponse>>;
  tournamentSearchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onSearchSubmit: (event: React.FormEvent) => void;
};

function getLoadMoreButtonText(isLoading: boolean, hasMore: boolean): string {
  if (isLoading) {
    return "Loading...";
  }
  return hasMore ? "Load more" : "All loaded";
}

function FieldStaffingForm({
  displayOptions,
  onSearchDraftChange,
  onSearchSubmit,
  onTournamentChange,
  selectedTournamentId,
  tournamentsQuery,
  tournamentSearchDraft,
}: FieldStaffingFormProps) {
  const isLoading = tournamentsQuery.isFetchingNextPage;
  const hasMore = tournamentsQuery.hasNextPage;
  const buttonText = getLoadMoreButtonText(isLoading, hasMore);

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr_auto]">
      <div className="space-y-1">
        <label className="font-medium text-sm" htmlFor="tournament-select">
          Tournament
        </label>
        <Select
          id="tournament-select"
          onChange={(event) => {
            onTournamentChange(event.target.value);
          }}
          value={selectedTournamentId}
        >
          <option value="">Select a tournament</option>
          {displayOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      </div>
      <form className="space-y-1" onSubmit={onSearchSubmit}>
        <label className="font-medium text-sm" htmlFor="tournament-search">
          Search
        </label>
        <Input
          id="tournament-search"
          onChange={(event) => onSearchDraftChange(event.target.value)}
          placeholder="Search tournaments"
          value={tournamentSearchDraft}
        />
        <Button className="w-full" type="submit" variant="secondary">
          Apply search
        </Button>
        {tournamentsQuery.error && (
          <p className="text-destructive text-xs">
            {(tournamentsQuery.error as Error).message}
          </p>
        )}
      </form>
      <div className="flex items-end">
        <Button
          className="w-full"
          disabled={isLoading || !hasMore}
          onClick={() => tournamentsQuery.fetchNextPage()}
          type="button"
          variant="secondary"
        >
          {buttonText}
        </Button>
      </div>
    </div>
  );
}

type StaffingAssignmentProps = {
  fieldAssignments: FieldAssignmentState[];
  staffByRole: Record<TournamentFieldRoleKey, StaffMember[]>;
  selectedTournamentStatus: ReturnType<typeof getTournamentStatusMeta> | null;
  fieldRolesQuery: ReturnType<typeof useQuery<FieldRolesResponse>>;
  staffQuery: ReturnType<typeof useQuery<{ staff: StaffMember[] }>>;
  assignmentsChanged: boolean;
  updateFieldRoles: ReturnType<
    typeof useMutation<FieldRolesResponse, Error, FieldAssignmentState[]>
  >;
  onAssignmentChange: (
    fieldNumber: number,
    role: TournamentFieldRoleKey,
    userId: string
  ) => void;
  onResetAssignments: () => void;
};

function StaffingAssignment({
  assignmentsChanged,
  fieldAssignments,
  fieldRolesQuery,
  onAssignmentChange,
  onResetAssignments,
  selectedTournamentStatus,
  staffByRole,
  staffQuery,
  updateFieldRoles,
}: StaffingAssignmentProps) {
  if (fieldRolesQuery.isPending) {
    return <Loader />;
  }

  if (fieldRolesQuery.error) {
    return (
      <p className="text-destructive text-sm">
        {(fieldRolesQuery.error as Error).message}
      </p>
    );
  }

  if (staffQuery.isPending) {
    return <Loader />;
  }

  if (!staffQuery.data?.staff.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No staff accounts available. Add staff users with TSO, Head Referee,
        Scorekeeper, or Queuer roles first.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={selectedTournamentStatus?.badgeVariant}>
          {selectedTournamentStatus?.label ?? "Status"}
        </Badge>
        <span className="text-muted-foreground text-sm">
          {fieldRolesQuery.data?.tournament.fieldCount} fields
        </span>
      </div>

      <div className="space-y-4">
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2">Field</th>
                {TOURNAMENT_FIELD_ROLES.map((role) => (
                  <th className="px-3 py-2" key={role}>
                    {TOURNAMENT_FIELD_ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fieldAssignments.map((field) => (
                <tr className="border-t last:border-b" key={field.fieldNumber}>
                  <td className="px-3 py-3 font-medium">
                    Field {field.fieldNumber}
                  </td>
                  {TOURNAMENT_FIELD_ROLES.map((role) => (
                    <td className="px-3 py-3" key={role}>
                      <Select
                        className="min-w-[180px]"
                        disabled={!staffByRole[role].length}
                        onChange={(event) =>
                          onAssignmentChange(
                            field.fieldNumber,
                            role,
                            event.target.value
                          )
                        }
                        value={field.roles[role] ?? ""}
                      >
                        <option value="">Unassigned</option>
                        {staffByRole[role].map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                            {member.email ? ` (${member.email})` : ""}
                          </option>
                        ))}
                      </Select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={!assignmentsChanged || updateFieldRoles.isPending}
            onClick={() => updateFieldRoles.mutate(fieldAssignments)}
          >
            {updateFieldRoles.isPending ? "Saving..." : "Save assignments"}
          </Button>
          <Button
            disabled={!assignmentsChanged}
            onClick={onResetAssignments}
            type="button"
            variant="outline"
          >
            Reset changes
          </Button>
        </div>
      </div>
    </>
  );
}

function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const { session } = Route.useRouteContext();
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [tournamentSearch, setTournamentSearch] = useState("");
  const [tournamentSearchDraft, setTournamentSearchDraft] = useState("");
  const [fieldAssignments, setFieldAssignments] = useState<
    FieldAssignmentState[]
  >([]);
  const [initialAssignments, setInitialAssignments] = useState<
    FieldAssignmentState[]
  >([]);

  const overviewQuery = useQuery<AdminOverviewResponse>({
    queryFn: async () => {
      const response = await fetch(
        `${SERVER_URL}/api/tournaments/admin/overview`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Unable to load overview");
      }
      return response.json() as Promise<AdminOverviewResponse>;
    },
    queryKey: ["admin-overview"],
  });

  const staffQuery = useQuery<{ staff: StaffMember[] }>({
    queryFn: async () => {
      const response = await fetch(
        `${SERVER_URL}/api/tournaments/admin/staff`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Unable to load staff roster");
      }
      const data = (await response.json()) as { staff?: StaffMember[] };
      return { staff: data.staff ?? [] };
    },
    queryKey: ["admin-staff"],
  });

  const tournamentsQuery = useInfiniteQuery({
    getNextPageParam: (lastPage: TournamentListResponse) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<TournamentListResponse> => {
      const params = new URLSearchParams();
      params.set("page", pageParam.toString());
      params.set("sortField", "name");
      params.set("sortDirection", "asc");
      if (tournamentSearch.trim()) {
        params.set("search", tournamentSearch.trim());
      }
      const response = await fetch(
        `${SERVER_URL}/api/tournaments?${params.toString()}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Unable to load tournaments");
      }
      return response.json() as Promise<TournamentListResponse>;
    },
    queryKey: ["admin-tournament-options", tournamentSearch],
  });

  const fieldRolesQuery = useQuery<FieldRolesResponse>({
    enabled: Boolean(selectedTournamentId),
    queryFn: async () => {
      const response = await fetch(
        `${SERVER_URL}/api/tournaments/${selectedTournamentId}/field-roles`,
        { credentials: "include" }
      );
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.error || "Unable to load tournament field roles"
        );
      }
      return response.json() as Promise<FieldRolesResponse>;
    },
    queryKey: ["field-roles", selectedTournamentId],
  });

  useEffect(() => {
    if (fieldRolesQuery.data?.fields) {
      const normalized = toAssignmentState(fieldRolesQuery.data.fields);
      setFieldAssignments(normalized);
      setInitialAssignments(normalized);
    } else if (!selectedTournamentId) {
      setFieldAssignments([]);
      setInitialAssignments([]);
    }
  }, [fieldRolesQuery.data, selectedTournamentId]);

  useEffect(() => {
    if (selectedTournamentId) {
      return;
    }
    const recentFirst =
      overviewQuery.data?.recentTournaments?.[0]?.id ??
      tournamentsQuery.data?.pages[0]?.items[0]?.id ??
      "";
    if (recentFirst) {
      setSelectedTournamentId(recentFirst);
    }
  }, [overviewQuery.data, tournamentsQuery.data, selectedTournamentId]);

  const staffByRole = useMemo(() => {
    const grouped: Record<TournamentFieldRoleKey, StaffMember[]> =
      TOURNAMENT_FIELD_ROLES.reduce(
        (acc, role) => {
          acc[role] = [];
          return acc;
        },
        {} as Record<TournamentFieldRoleKey, StaffMember[]>
      );
    for (const member of staffQuery.data?.staff ?? []) {
      if (grouped[member.role]) {
        grouped[member.role] = [...grouped[member.role], member];
      }
    }
    for (const role of TOURNAMENT_FIELD_ROLES) {
      grouped[role] = grouped[role].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    }
    return grouped;
  }, [staffQuery.data]);

  const tournamentOptions = useMemo(() => {
    if (!tournamentsQuery.data) {
      return [];
    }
    const map = new Map<string, TournamentListItem>();
    for (const page of tournamentsQuery.data.pages) {
      for (const item of page.items) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [tournamentsQuery.data]);

  const selectedOptionExists = selectedTournamentId
    ? tournamentOptions.some((option) => option.id === selectedTournamentId)
    : true;

  const displayOptions = useMemo(() => {
    if (selectedOptionExists || !fieldRolesQuery.data) {
      return tournamentOptions;
    }
    const fallback: TournamentListItem = {
      fieldCount: fieldRolesQuery.data.tournament.fieldCount,
      id: fieldRolesQuery.data.tournament.id,
      name: fieldRolesQuery.data.tournament.name,
      startDate: null,
      status: fieldRolesQuery.data.tournament.status,
    };
    return [fallback, ...tournamentOptions];
  }, [fieldRolesQuery.data, selectedOptionExists, tournamentOptions]);

  const assignmentsChanged =
    JSON.stringify(initialAssignments) !== JSON.stringify(fieldAssignments);

  const updateFieldRoles = useMutation({
    mutationFn: async (payload: FieldAssignmentState[]) => {
      if (!selectedTournamentId) {
        throw new Error("Please choose a tournament first.");
      }
      const response = await fetch(
        `${SERVER_URL}/api/tournaments/${selectedTournamentId}/field-roles`,
        {
          body: JSON.stringify(buildAssignmentsPayload(payload)),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        }
      );
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error || "Failed to update assignments");
      }
      return response.json() as Promise<FieldRolesResponse>;
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSuccess: (data) => {
      const normalized = toAssignmentState(data.fields);
      setFieldAssignments(normalized);
      setInitialAssignments(normalized);
      queryClient.setQueryData(["field-roles", data.tournament.id], data);
      toast.success("Field roles updated");
    },
  });

  const handleAssignmentChange = (
    fieldNumber: number,
    role: TournamentFieldRoleKey,
    userId: string
  ) => {
    setFieldAssignments((prev) =>
      prev.map((field) => {
        if (field.fieldNumber !== fieldNumber) {
          return field;
        }
        return {
          ...field,
          roles: {
            ...field.roles,
            [role]: userId || null,
          },
        };
      })
    );
  };

  const handleTournamentSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setTournamentSearch(tournamentSearchDraft.trim());
  };

  const handleResetAssignments = () => {
    setFieldAssignments(initialAssignments);
  };

  const selectedTournamentStatus = fieldRolesQuery.data
    ? getTournamentStatusMeta(fieldRolesQuery.data.tournament.status)
    : null;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="space-y-1">
        <h1 className="font-bold text-3xl">Tournament Control Center</h1>
        <p className="text-muted-foreground">
          Welcome back {session.data?.user.name}. Track tournaments and assign
          field crews from a single place.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-lg">Overview</h2>
        </div>
        <OverviewSection overviewQuery={overviewQuery} />
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Field staffing</CardTitle>
            <CardDescription>
              Assign TSO, referees, scorekeepers, and queuers per field.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Wrench className="h-4 w-4" />
            Manage operational roles
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <FieldStaffingForm
            displayOptions={displayOptions}
            onSearchDraftChange={setTournamentSearchDraft}
            onSearchSubmit={handleTournamentSearch}
            onTournamentChange={setSelectedTournamentId}
            selectedTournamentId={selectedTournamentId}
            tournamentSearchDraft={tournamentSearchDraft}
            tournamentsQuery={tournamentsQuery}
          />

          {selectedTournamentId ? (
            <StaffingAssignment
              assignmentsChanged={assignmentsChanged}
              fieldAssignments={fieldAssignments}
              fieldRolesQuery={fieldRolesQuery}
              onAssignmentChange={handleAssignmentChange}
              onResetAssignments={handleResetAssignments}
              selectedTournamentStatus={selectedTournamentStatus}
              staffByRole={staffByRole}
              staffQuery={staffQuery}
              updateFieldRoles={updateFieldRoles}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              Select a tournament to manage staffing.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: number;
};

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-sm">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="font-bold text-3xl">{value}</div>
      </CardContent>
    </Card>
  );
}
