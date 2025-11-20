import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  ACCESS_RULES,
  type AccessControlUser,
  meetsAccessRule,
} from "@/utils/access-control";
import { queryClient } from "@/utils/query-client";
import { canCreateTeam, MIN_TEAM_CREATION_AGE } from "@/utils/teams";

type TeamFormData = {
  name: string;
  description: string;
  location: string;
  teamNumber: string;
  consent: boolean;
};

const teamFormSchema = z.object({
  name: z.string().min(3, "Team name must be at least 3 characters").max(120),
  description: z.string().max(2000),
  location: z.string().max(255),
  teamNumber: z.string().max(32),
  consent: z.boolean().refine((val) => val === true, {
    message: "You must accept the consent statement.",
  }),
}) satisfies z.ZodType<TeamFormData>;

export const Route = createFileRoute("/teams/new")({
  component: CreateTeamPage,
  validateSearch: (): Record<string, never> => ({}),
  beforeLoad: async () => {
    const session = await authClient.getSession();
    const user = session.data?.user as AccessControlUser | undefined;
    if (!meetsAccessRule(user, ACCESS_RULES.registeredOnly)) {
      throw redirect({
        to: "/sign-in",
      });
    }
    return { session };
  },
});

function CreateTeamPage() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  type UserWithMeta = { role?: string; dateOfBirth?: Date } & Record<
    string,
    unknown
  >;
  const user = session.data?.user as UserWithMeta | undefined;
  const canCreate = !!user && canCreateTeam(user);

  const createTeam = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      location?: string;
      teamNumber?: string;
    }) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/teams`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(data),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to create team");
      }
      return response.json();
    },
    onSuccess: async (team) => {
      toast.success(`Team "${team.name}" created.`);
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      await navigate({
        to: "/teams/$slug",
        params: { slug: team.slug },
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Unable to create team.";
      toast.error(message);
    },
  });

  const form = useForm({
    defaultValues: {
      name: "",
      description: "",
      location: "",
      teamNumber: "",
      consent: false,
    } as TeamFormData,
    validators: {
      onSubmit: teamFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (!canCreate) {
        toast.error("You are not allowed to create a team.");
        return;
      }
      await createTeam.mutateAsync({
        name: value.name.trim(),
        description: value.description?.trim() || undefined,
        location: value.location?.trim() || undefined,
        teamNumber: value.teamNumber?.trim() || undefined,
      });
    },
  });

  if (!session.data) {
    return <Loader />;
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Create a Team</h1>
          <p className="text-muted-foreground">
            Provide a few details so others can discover and join your team.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link
            search={{
              page: 1,
              search: "",
              sortField: "createdAt",
              sortDirection: "desc",
            }}
            to="/teams"
          >
            Cancel
          </Link>
        </Button>
      </div>

      {!canCreate && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle>You are not eligible yet</CardTitle>
            <CardDescription className="text-foreground">
              To create a team, you must meet these requirements:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ul className="list-disc space-y-1 pl-6 text-muted-foreground text-sm">
              <li>
                Have a role of <strong>COMMON</strong> or{" "}
                <strong>TEAM_MENTOR</strong>
              </li>
              <li>
                Be at least <strong>{MIN_TEAM_CREATION_AGE} years old</strong>
              </li>
              <li>Have a verified email address</li>
            </ul>
            <p className="pt-2 text-muted-foreground text-sm">
              Current role: <strong>{user?.role || "Unknown"}</strong>
            </p>
            <p className="text-muted-foreground text-sm">
              If you believe this is incorrect, please update your profile or
              contact support.
            </p>
          </CardContent>
        </Card>
      )}

      {canCreate && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="text-emerald-700 dark:text-emerald-400">
              You can create a team!
            </CardTitle>
            <CardDescription className="text-foreground">
              As a {user?.role}, you'll automatically become the team's mentor
              with full management permissions. You can invite other leaders and
              members after creation.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team details</CardTitle>
          <CardDescription>
            Provide basic information about your team.
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
            <div className="grid gap-4">
              <form.Field name="name">
                {(field) => (
                  <FormField
                    disabled={!canCreate || createTeam.isPending}
                    htmlFor={field.name}
                    label="Team name"
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

              <form.Field name="description">
                {(field) => (
                  <FormField
                    description="Share your mission, focus, or anything that would help others."
                    disabled={!canCreate || createTeam.isPending}
                    htmlFor={field.name}
                    label="Description"
                  >
                    <Textarea
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      rows={4}
                      value={field.state.value}
                    />
                    <FieldErrors errors={field.state.meta.errors} />
                  </FormField>
                )}
              </form.Field>

              <form.Field name="location">
                {(field) => (
                  <FormField
                    disabled={!canCreate || createTeam.isPending}
                    htmlFor={field.name}
                    label="Location"
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

              <form.Field name="teamNumber">
                {(field) => (
                  <FormField
                    disabled={!canCreate || createTeam.isPending}
                    htmlFor={field.name}
                    label="Team number"
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
            </div>

            <form.Field name="consent">
              {(field) => (
                <div
                  className={cn(
                    "flex items-start gap-3 rounded-md border p-4 text-sm",
                    field.state.meta.errors.length > 0 &&
                      "border-destructive bg-destructive/5"
                  )}
                >
                  <Checkbox
                    checked={field.state.value}
                    disabled={!canCreate || createTeam.isPending}
                    id={field.name}
                    onCheckedChange={(checked) =>
                      field.handleChange(Boolean(checked))
                    }
                  />
                  <div>
                    <Label htmlFor={field.name}>
                      I confirm that everyone on this team has accepted the code
                      of conduct and that I have permission to onboard them.
                    </Label>
                    <FieldErrors errors={field.state.meta.errors} />
                  </div>
                </div>
              )}
            </form.Field>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">
                Team mentors can invite leaders and members after creation.
              </p>
              <Button
                disabled={!canCreate || createTeam.isPending}
                type="submit"
              >
                {createTeam.isPending ? "Creating..." : "Create team"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
