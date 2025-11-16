import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import {
  createEmptyScoreProfileValues,
  mapFormValuesToPayload,
  type ScoreProfileFormValues,
} from "./form-utils";
import { ScoreProfileForm } from "./score-profile-form";

export const Route = createFileRoute("/score-profiles/new")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data || session.data.user.role !== "ADMIN") {
      throw redirect({ to: "/tournaments" });
    }
    return { session };
  },
  component: CreateScoreProfilePage,
});

function CreateScoreProfilePage() {
  const { session } = Route.useRouteContext();
  const isAdmin = session.data?.user.role === "ADMIN";
  const navigate = useNavigate({ from: "/score-profiles/new" });
  const queryClient = useQueryClient();

  const createProfile = useMutation({
    mutationFn: async (payload: ReturnType<typeof mapFormValuesToPayload>) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/score-profiles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? "Unable to create score profile.");
      }
      return response.json() as Promise<{
        id: string;
        name: string;
      }>;
    },
    onSuccess: async (profile) => {
      toast.success(`Score profile "${profile.name}" created.`);
      await queryClient.invalidateQueries({
        queryKey: ["score-profiles"],
      });
      await navigate({
        params: { scoreProfileId: profile.id },
        search: {},
        to: "/score-profiles/$scoreProfileId",
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to save profile."
      );
    },
  });

  if (!isAdmin) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>
              You need the ADMIN role to configure score profiles.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (values: ScoreProfileFormValues) => {
    await createProfile.mutateAsync(mapFormValuesToPayload(values));
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Create score profile</h1>
          <p className="text-muted-foreground">
            Describe how points, cooperative bonuses, and penalties are
            calculated.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link search={{}} to="/score-profiles">
            Cancel
          </Link>
        </Button>
      </div>

      <ScoreProfileForm
        initialValues={createEmptyScoreProfileValues()}
        isSubmitting={createProfile.isPending}
        onSubmit={handleSubmit}
        submitLabel="Create profile"
      />
    </div>
  );
}
