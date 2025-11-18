import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { FieldErrors, FormField } from "@/components/form-field";
import Loader from "@/components/loader";
import TeamMembersList from "@/components/team-members-list";
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
import { queryClient } from "@/utils/query-client";
import {
  formatStatus,
  getAllowedTeamStatuses,
  type TeamStatus,
} from "@/utils/teams";

const teamEditSchema = z.object({
  name: z.string().min(3, "Team name must be at least 3 characters").max(120),
  description: z.string().max(2000).optional(),
  location: z.string().max(255).optional(),
  teamNumber: z.string().max(32).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

type TeamDetail = {
  id: string;
  name: string;
  slug: string;
  status: TeamStatus;
  logo?: string;
  teamNumber?: string;
  location?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  memberRole?: string | null;
  isMember: boolean;
  members: Array<{
    id: string;
    userId: string;
    role: string;
    joinedAt: string;
    name: string;
    email: string;
  }>;
};

type FormValues = {
  name: string;
  description?: string;
  location?: string;
  teamNumber?: string;
  status: TeamStatus;
};

async function fetchTeamForEdit(slug: string): Promise<{ session: unknown }> {
  const session = await authClient.getSession();
  if (!session.data) {
    throw redirect({
      to: "/sign-in",
    });
  }

  const response = await fetch(
    `${import.meta.env.VITE_SERVER_URL}/api/teams/${slug}`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw redirect({
      to: "/teams",
      search: {
        page: 1,
        search: "",
        sortField: "createdAt",
        sortDirection: "desc",
      },
    });
  }

  const teamData = await response.json();

  if (teamData.memberRole !== "TEAM_MENTOR") {
    toast.error("Only team mentors can edit team settings");
    if (typeof window !== "undefined") {
      window.location.href = `/teams/${slug}`;
    }
    throw new Error("Unauthorized");
  }

  return { session };
}

export const Route = createFileRoute("/teams/$slug/edit")({
  component: EditTeamPage,
  beforeLoad: ({ params }: { params: { slug: string } }) =>
    fetchTeamForEdit(params.slug),
});

function TeamNotFound({ error }: { error: unknown }) {
  const errorMessage =
    error instanceof Error ? error.message : "Failed to load team details.";

  return (
    <div className="container mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div>
        <h1 className="font-bold text-3xl">Team Not Found</h1>
        <p className="text-destructive">{errorMessage}</p>
      </div>
      <Button asChild variant="outline">
        <Link
          search={{
            page: 1,
            search: "",
            sortField: "createdAt",
            sortDirection: "desc",
          }}
          to="/teams"
        >
          Back to Teams
        </Link>
      </Button>
    </div>
  );
}

function useTeamMutation(
  slug: string,
  navigate: ReturnType<typeof useNavigate>
) {
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      location?: string;
      teamNumber?: string;
      status: string;
    }) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/teams/${slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(data),
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update team");
      }
      return response.json();
    },
    onSuccess: async (updatedTeam: TeamDetail) => {
      toast.success(`Team "${updatedTeam.name}" updated successfully.`);
      await queryClient.invalidateQueries({ queryKey: ["team", slug] });
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      await navigate({
        to: "/teams/$slug",
        params: { slug: updatedTeam.slug },
        search: {},
      });
    },
    onError: (error: Error) => {
      const message =
        error instanceof Error ? error.message : "Unable to update team.";
      toast.error(message);
    },
  });
}

function EditTeamPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"settings" | "members">(
    "settings"
  );

  const teamQuery = useQuery<TeamDetail>({
    queryKey: ["team", slug],
    queryFn: async (): Promise<TeamDetail> => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/teams/${slug}`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch team details");
      }
      return response.json();
    },
  });

  const updateTeam = useTeamMutation(slug, navigate);

  const form = useForm({
    defaultValues: {
      name: teamQuery.data?.name ?? "",
      description: teamQuery.data?.description ?? "",
      location: teamQuery.data?.location ?? "",
      teamNumber: teamQuery.data?.teamNumber ?? "",
      status: teamQuery.data?.status ?? "DRAFT",
    },
    onSubmit: ({ value }: { value: FormValues }) => {
      updateTeam.mutate({
        name: value.name,
        description: value.description || undefined,
        location: value.location || undefined,
        teamNumber: value.teamNumber || undefined,
        status: value.status,
      });
    },
  });

  if (teamQuery.isPending) {
    return <Loader />;
  }

  if (teamQuery.error || !teamQuery.data) {
    return <TeamNotFound error={teamQuery.error} />;
  }

  const allowedStatuses = getAllowedTeamStatuses();

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Edit Team</h1>
          <p className="text-muted-foreground">
            Update your team's information and settings
          </p>
        </div>
        <Button asChild variant="outline">
          <Link params={{ slug }} to="/teams/$slug">
            Cancel
          </Link>
        </Button>
      </div>

      <div className="flex space-x-2 border-b">
        <Button
          onClick={() => setActiveTab("settings")}
          variant={activeTab === "settings" ? "secondary" : "ghost"}
        >
          Settings
        </Button>
        <Button
          onClick={() => setActiveTab("members")}
          variant={activeTab === "members" ? "secondary" : "ghost"}
        >
          Members
        </Button>
      </div>

      {activeTab === "settings" && (
        <Card>
          <CardHeader>
            <CardTitle>Team Information</CardTitle>
            <CardDescription>
              Make changes to your team's public profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                form.handleSubmit();
              }}
            >
              <form.Field
                name="name"
                validators={{
                  onChange: teamEditSchema.shape.name,
                }}
              >
                {(field) => (
                  <FormField label="Team Name" required>
                    <Input
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder="Enter team name"
                      value={String(field.state.value ?? "")}
                    />
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>

              <form.Field name="teamNumber">
                {(field) => (
                  <FormField label="Team Number">
                    <Input
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder="e.g., 12345"
                      value={String(field.state.value ?? "")}
                    />
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>

              <form.Field name="location">
                {(field) => (
                  <FormField label="Location">
                    <Input
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder="City, State/Country"
                      value={String(field.state.value ?? "")}
                    />
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>

              <form.Field name="description">
                {(field) => (
                  <FormField label="Description">
                    <Textarea
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder="Tell others about your team..."
                      rows={4}
                      value={String(field.state.value ?? "")}
                    />
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>

              <form.Field
                name="status"
                validators={{
                  onChange: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
                }}
              >
                {(field) => (
                  <FormField label="Status" required>
                    <Select
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value as TeamStatus)
                      }
                      value={String(field.state.value ?? "DRAFT")}
                    >
                      {allowedStatuses.map((status) => {
                        const meta = formatStatus(status);
                        return (
                          <option key={status} value={status}>
                            {meta.label}
                          </option>
                        );
                      })}
                    </Select>
                    <p className="text-muted-foreground text-xs">
                      {(() => {
                        const statusMeta = formatStatus(
                          field.state.value as TeamStatus
                        );
                        return "description" in statusMeta
                          ? statusMeta.description
                          : "";
                      })()}
                    </p>
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>

              <div className="flex flex-wrap gap-3">
                <Button disabled={updateTeam.isPending} type="submit">
                  {updateTeam.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <Button asChild type="button" variant="outline">
                  <Link params={{ slug }} to="/teams/$slug">
                    Cancel
                  </Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === "members" && (
        <TeamMembersList
          currentUserRole={teamQuery.data.memberRole ?? undefined}
          members={teamQuery.data.members}
          teamSlug={slug}
        />
      )}

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible and destructive actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Team deletion and other dangerous operations will be available here
            in the future.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
