import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { FieldErrors, FormField } from "@/components/form-field";
import Loader from "@/components/loader";
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
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { toDateTimeLocalValue } from "@/utils/date";
import { queryClient } from "@/utils/query-client";
import type { ScoreProfilesResponse } from "@/utils/score-profiles";
import {
  getResourceLabel,
  getTournamentStatusMeta,
  TOURNAMENT_RESOURCE_TYPES,
  TOURNAMENT_STATUSES,
  type TournamentResourceType,
  type TournamentStatus,
} from "@/utils/tournaments";
import {
  createResourceField,
  mapFormValuesToPayload,
  type TournamentFormValues,
  tournamentFormSchema,
} from "../form-utils";

type TournamentResource = {
  id: string;
  title: string;
  url: string;
  type: TournamentResourceType;
  description?: string | null;
};

type TournamentDetail = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: TournamentStatus;
  season?: string | null;
  organizer?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  registrationDeadline?: string | null;
  announcement?: string | null;
  resources: TournamentResource[];
  fieldCount: number;
  scoreProfile?: {
    id: string;
    name: string;
    description?: string | null;
  } | null;
};

export const Route = createFileRoute("/tournaments/$tournamentId/edit")({
  component: EditTournamentPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data || session.data.user.role !== "ADMIN") {
      throw redirect({ to: "/tournaments" });
    }
    return { session };
  },
});

function hydrateFormValues(tournament: TournamentDetail): TournamentFormValues {
  const fallbackDate = tournament.startDate || new Date().toISOString();
  return {
    name: tournament.name,
    description: tournament.description ?? "",
    organizer: tournament.organizer ?? "",
    location: tournament.location ?? "",
    season: tournament.season ?? "",
    status: tournament.status,
    startDate: toDateTimeLocalValue(tournament.startDate ?? fallbackDate),
    endDate: toDateTimeLocalValue(tournament.endDate ?? fallbackDate),
    registrationDeadline: toDateTimeLocalValue(
      tournament.registrationDeadline ?? fallbackDate
    ),
    announcement: tournament.announcement ?? "",
    fieldCount: tournament.fieldCount ?? 1,
    scoreProfileId: tournament.scoreProfile?.id ?? "",
    resources: (tournament.resources ?? []).map((resource) =>
      createResourceField({
        id: resource.id,
        title: resource.title,
        url: resource.url,
        type: resource.type,
        description: resource.description ?? "",
      })
    ),
  };
}

function EditTournamentPage() {
  const { tournamentId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const isAdmin = session.data?.user.role === "ADMIN";

  const detailQuery = useQuery<TournamentDetail>({
    queryKey: ["tournament", tournamentId, "edit"],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Tournament not found");
      }
      return response.json() as Promise<TournamentDetail>;
    },
  });

  if (detailQuery.isPending) {
    return <Loader />;
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load tournament</CardTitle>
            <CardDescription>
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : "Please try again later."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <TournamentEditForm
      isAdmin={isAdmin}
      navigate={navigate}
      tournament={detailQuery.data}
      tournamentId={tournamentId}
    />
  );
}

type TournamentEditFormProps = {
  tournament: TournamentDetail;
  isAdmin: boolean;
  tournamentId: string;
  navigate: ReturnType<typeof useNavigate>;
};

function TournamentEditForm({
  tournament,
  isAdmin,
  tournamentId,
  navigate,
}: TournamentEditFormProps) {
  const scoreProfilesQuery = useQuery<ScoreProfilesResponse>({
    queryKey: ["score-profiles"],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/score-profiles`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Unable to load score profiles.");
      }
      return response.json() as Promise<ScoreProfilesResponse>;
    },
    enabled: isAdmin,
  });

  const initialValues = useMemo(
    () => hydrateFormValues(tournament),
    [tournament]
  );

  const updateTournament = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/tournaments/${tournamentId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Unable to update tournament");
      }
      return response.json().catch(() => ({}));
    },
    onSuccess: async () => {
      toast.success("Tournament updated.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tournaments"] }),
        queryClient.invalidateQueries({
          queryKey: ["tournament", tournamentId],
        }),
      ]);
      await navigate({
        params: { tournamentId },
        to: "/tournaments/$tournamentId",
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to update tournament."
      );
    },
  });

  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onSubmit: tournamentFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (!isAdmin) {
        toast.error("Only admins can update tournaments.");
        return;
      }
      await updateTournament.mutateAsync(mapFormValuesToPayload(value));
    },
  });

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Edit tournament</h1>
          <p className="text-muted-foreground">
            Update the schedule, announcement, and shared resources.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link
            params={{ tournamentId }}
            search={{}}
            to="/tournaments/$tournamentId"
          >
            Cancel
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event details</CardTitle>
          <CardDescription>Changes take effect immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              form.handleSubmit();
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <form.Field name="name">
                {(field) => (
                  <FormField
                    disabled={!isAdmin || updateTournament.isPending}
                    htmlFor={field.name}
                    label="Tournament name"
                    required
                  >
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      value={field.state.value}
                    />
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>
              <form.Field name="status">
                {(field) => (
                  <FormField
                    disabled={!isAdmin || updateTournament.isPending}
                    htmlFor={field.name}
                    label="Status"
                    required
                  >
                    <Select
                      id={field.name}
                      onChange={(event) =>
                        field.handleChange(
                          event.target.value as TournamentStatus
                        )
                      }
                      value={field.state.value}
                    >
                      {TOURNAMENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {getTournamentStatusMeta(status).label}
                        </option>
                      ))}
                    </Select>
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>
            </div>

            <form.Field name="description">
              {(field) => (
                <FormField
                  disabled={!isAdmin || updateTournament.isPending}
                  htmlFor={field.name}
                  label="Description"
                >
                  <Textarea
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    rows={4}
                    value={field.state.value}
                  />
                  <FieldErrors errors={field.state.meta.errors} />
                </FormField>
              )}
            </form.Field>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <form.Field name="organizer">
                {(field) => (
                  <FormField
                    disabled={!isAdmin || updateTournament.isPending}
                    htmlFor={field.name}
                    label="Organizer"
                  >
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      value={field.state.value}
                    />
                  </FormField>
                )}
              </form.Field>
              <form.Field name="season">
                {(field) => (
                  <FormField
                    disabled={!isAdmin || updateTournament.isPending}
                    htmlFor={field.name}
                    label="Season"
                  >
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      value={field.state.value}
                    />
                  </FormField>
                )}
              </form.Field>
              <form.Field name="fieldCount">
                {(field) => (
                  <FormField
                    disabled={!isAdmin || updateTournament.isPending}
                    htmlFor={field.name}
                    label="Fields available"
                    required
                  >
                    <Input
                      id={field.name}
                      inputMode="numeric"
                      max={50}
                      min={1}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        field.handleChange(
                          Number.isNaN(nextValue) ? 1 : nextValue
                        );
                      }}
                      type="number"
                      value={field.state.value.toString()}
                    />
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>
              <form.Field name="scoreProfileId">
                {(field) => (
                  <FormField
                    description="Apply a reusable scoring model to every match."
                    disabled={
                      !isAdmin ||
                      updateTournament.isPending ||
                      scoreProfilesQuery.isPending ||
                      Boolean(scoreProfilesQuery.error)
                    }
                    htmlFor={field.name}
                    label="Score profile"
                  >
                    <Select
                      disabled={
                        !isAdmin ||
                        updateTournament.isPending ||
                        scoreProfilesQuery.isPending ||
                        Boolean(scoreProfilesQuery.error)
                      }
                      id={field.name}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      value={field.state.value}
                    >
                      <option value="">No score profile</option>
                      {(scoreProfilesQuery.data?.items ?? []).map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </Select>
                    {scoreProfilesQuery.isPending && (
                      <p className="text-muted-foreground text-xs">
                        Loading profiles&hellip;
                      </p>
                    )}
                    {scoreProfilesQuery.error && (
                      <p className="text-destructive text-xs">
                        Unable to load score profiles.
                      </p>
                    )}
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <form.Field name="startDate">
                {(field) => (
                  <FormField
                    disabled={!isAdmin || updateTournament.isPending}
                    htmlFor={field.name}
                    label="Start date"
                    required
                  >
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      type="datetime-local"
                      value={field.state.value}
                    />
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>
              <form.Field name="endDate">
                {(field) => (
                  <FormField
                    disabled={!isAdmin || updateTournament.isPending}
                    htmlFor={field.name}
                    label="End date"
                    required
                  >
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      type="datetime-local"
                      value={field.state.value}
                    />
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>
            </div>

            <form.Field name="registrationDeadline">
              {(field) => (
                <FormField
                  disabled={!isAdmin || updateTournament.isPending}
                  htmlFor={field.name}
                  label="Registration deadline"
                  required
                >
                  <Input
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    type="datetime-local"
                    value={field.state.value}
                  />
                  <FieldErrors errors={field.state.meta.errors} />
                </FormField>
              )}
            </form.Field>

            <form.Field name="announcement">
              {(field) => (
                <FormField
                  disabled={!isAdmin || updateTournament.isPending}
                  htmlFor={field.name}
                  label="Announcement"
                >
                  <Textarea
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    rows={3}
                    value={field.state.value}
                  />
                  <FieldErrors errors={field.state.meta.errors} />
                </FormField>
              )}
            </form.Field>

            <form.Field name="resources">
              {(field) => (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Resources</p>
                    <Button
                      disabled={!isAdmin || updateTournament.isPending}
                      onClick={() =>
                        field.handleChange([
                          ...field.state.value,
                          createResourceField(),
                        ])
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Add link
                    </Button>
                  </div>
                  {field.state.meta.errors.length > 0 && (
                    <FieldErrors errors={field.state.meta.errors} />
                  )}
                  {field.state.value.length === 0 && (
                    <p className="text-muted-foreground text-sm">
                      Add documents, manuals, or helpful videos.
                    </p>
                  )}
                  {field.state.value.map((resource, index) => (
                    <Card className="border-dashed" key={resource.id}>
                      <CardContent className="space-y-3 p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <LabelWithBadge label="Title" />
                            <Input
                              onChange={(event) => {
                                const next = [...field.state.value];
                                next[index] = {
                                  ...next[index],
                                  title: event.target.value,
                                };
                                field.handleChange(next);
                              }}
                              value={resource.title}
                            />
                          </div>
                          <div>
                            <LabelWithBadge label="Type" />
                            <Select
                              onChange={(event) => {
                                const next = [...field.state.value];
                                next[index] = {
                                  ...next[index],
                                  type: event.target
                                    .value as TournamentResourceType,
                                };
                                field.handleChange(next);
                              }}
                              value={resource.type}
                            >
                              {TOURNAMENT_RESOURCE_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {getResourceLabel(type)}
                                </option>
                              ))}
                            </Select>
                          </div>
                        </div>
                        <div>
                          <LabelWithBadge label="URL" />
                          <Input
                            onChange={(event) => {
                              const next = [...field.state.value];
                              next[index] = {
                                ...next[index],
                                url: event.target.value,
                              };
                              field.handleChange(next);
                            }}
                            placeholder="https://"
                            type="url"
                            value={resource.url}
                          />
                        </div>
                        <div>
                          <LabelWithBadge label="Summary" />
                          <Textarea
                            onChange={(event) => {
                              const next = [...field.state.value];
                              next[index] = {
                                ...next[index],
                                description: event.target.value,
                              };
                              field.handleChange(next);
                            }}
                            rows={2}
                            value={resource.description}
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button
                            disabled={updateTournament.isPending}
                            onClick={() => {
                              field.handleChange(
                                field.state.value.filter((_, i) => i !== index)
                              );
                            }}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Remove
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </form.Field>

            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Changes apply to the public listing immediately.
              </p>
              <Button
                disabled={!isAdmin || updateTournament.isPending}
                type="submit"
              >
                {updateTournament.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function LabelWithBadge({ label }: { label: string }) {
  return (
    <div className="mb-1 flex items-center justify-between">
      <p className="font-medium text-sm">{label}</p>
    </div>
  );
}
