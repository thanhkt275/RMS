/* biome-ignore lint/style/useFilenamingConvention: Dynamic route segment preserves TanStack Router naming. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileUpload, type UploadedFile } from "@/components/file-upload";
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
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import type {
  RegistrationDetail,
  RegistrationStep,
} from "@/types/registration";
import { formatDateTime } from "@/utils/date";
import { queryClient } from "@/utils/query-client";
import {
  getRegistrationStatusMeta,
  getStepStatusMeta,
  getStepTypeLabel,
} from "@/utils/registrations";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

export const Route = createFileRoute(
  "/tournaments/$tournamentId/registration/$registrationId"
)({
  component: RegistrationTaskPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({
        to: "/sign-in",
      });
    }
    return { session: session.data };
  },
});

type RegistrationDetailQuery = RegistrationDetail;

type SubmitStepVariables = {
  stepId: string;
  body: Record<string, unknown>;
};

function RegistrationTaskPage() {
  const { tournamentId, registrationId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const detailQuery = useQuery<RegistrationDetailQuery>({
    queryKey: ["registration-detail", tournamentId, registrationId],
    queryFn: async () => {
      const response = await fetch(
        `${SERVER_URL}/api/tournaments/${tournamentId}/registrations/${registrationId}`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Unable to load registration");
      }
      return response.json() as Promise<RegistrationDetailQuery>;
    },
  });

  const steps = detailQuery.data?.steps ?? [];
  const summary = useMemo(() => {
    const requiredSteps = steps.filter((step) => step.isRequired);
    const approvedSteps = requiredSteps.filter(
      (step) => step.status === "APPROVED"
    );
    const readyToSubmit = requiredSteps.every(
      (step) =>
        step.status &&
        step.status !== "NOT_STARTED" &&
        step.status !== "REJECTED"
    );
    return {
      requiredCount: requiredSteps.length,
      approvedCount: approvedSteps.length,
      readyToSubmit,
    };
  }, [steps]);

  const [infoResponses, setInfoResponses] = useState<Record<string, string>>(
    {}
  );
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [uploadingStepId, setUploadingStepId] = useState<string | null>(null);

  useEffect(() => {
    if (!detailQuery.data) {
      setInfoResponses({});
      setReviewNotes({});
      return;
    }
    const infoDefaults: Record<string, string> = {};
    const reviewDefaults: Record<string, string> = {};
    for (const step of detailQuery.data.steps) {
      if (
        step.stepType === "INFO" &&
        step.submission?.payload?.kind === "INFO"
      ) {
        infoDefaults[step.id] = step.submission.payload.responseText;
      }
      if (step.submission?.reviewNotes) {
        reviewDefaults[step.id] = step.submission.reviewNotes;
      }
    }
    setInfoResponses(infoDefaults);
    setReviewNotes(reviewDefaults);
  }, [detailQuery.data]);

  const submitStep = useMutation({
    mutationFn: async ({ stepId, body }: SubmitStepVariables) => {
      const response = await fetch(
        `${SERVER_URL}/api/tournaments/${tournamentId}/registrations/${registrationId}/steps/${stepId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Unable to update step");
      }
      return response.json() as Promise<{ step: { id: string } }>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["registration-detail", tournamentId, registrationId],
      });
    },
  });

  const reviewStep = useMutation({
    mutationFn: async ({
      stepId,
      body,
    }: {
      stepId: string;
      body: { status: "APPROVED" | "REJECTED"; reviewNotes?: string };
    }) => {
      const response = await fetch(
        `${SERVER_URL}/api/tournaments/${tournamentId}/registrations/${registrationId}/steps/${stepId}/review`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Unable to review submission");
      }
      return response.json() as Promise<{ success: boolean }>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["registration-detail", tournamentId, registrationId],
      });
      toast.success("Review saved");
    },
  });

  const finalizeRegistration = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${SERVER_URL}/api/tournaments/${tournamentId}/registrations/${registrationId}/submit`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Unable to submit registration");
      }
      return response.json() as Promise<{ status: string }>;
    },
    onSuccess: async () => {
      toast.success("Registration submitted for review");
      await queryClient.invalidateQueries({
        queryKey: ["registration-detail", tournamentId, registrationId],
      });
    },
  });

  if (detailQuery.isPending) {
    return <Loader />;
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load registration</CardTitle>
            <CardDescription>
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : "Please try again later."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary">
              <Link params={{ tournamentId }} to="/tournaments/$tournamentId">
                Back to tournament
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const detail = detailQuery.data;
  const statusMeta = getRegistrationStatusMeta(detail.registration.status);

  const handleInfoSubmit = async (step: RegistrationStep) => {
    const value = infoResponses[step.id]?.trim() ?? "";
    if (!value.length) {
      toast.error("Please add a response before submitting.");
      return;
    }
    try {
      await submitStep.mutateAsync({
        stepId: step.id,
        body: { responseText: value },
      });
      toast.success("Response saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save response"
      );
    }
  };

  const handleFileUploadSuccess = async (
    stepId: string,
    file: UploadedFile
  ) => {
    try {
      setUploadingStepId(stepId);
      await submitStep.mutateAsync({
        stepId,
        body: { fileId: file.id },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to submit step"
      );
    } finally {
      setUploadingStepId(null);
    }
  };

  const handleConsentSubmit = async (step: RegistrationStep) => {
    try {
      await submitStep.mutateAsync({
        stepId: step.id,
        body: { consentAccepted: true },
      });
      toast.success("Consent saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to confirm consent"
      );
    }
  };

  const handleReview = async (
    step: RegistrationStep,
    status: "APPROVED" | "REJECTED"
  ) => {
    const notes = reviewNotes[step.id];
    if (status === "REJECTED" && !notes?.trim()) {
      toast.error("Provide notes when requesting changes.");
      return;
    }
    try {
      await reviewStep.mutateAsync({
        stepId: step.id,
        body: { status, reviewNotes: notes?.trim() || undefined },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update review"
      );
    }
  };

  const finalizeDisabled =
    isAdmin ||
    detail.registration.status === "APPROVED" ||
    detail.registration.status === "SUBMITTED" ||
    detail.registration.status === "UNDER_REVIEW" ||
    !summary.readyToSubmit;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">
            {detail.registration.organization.name}
          </p>
          <h1 className="font-bold text-3xl">Registration checklist</h1>
          <p className="text-muted-foreground">
            Complete each step to secure your spot in the tournament.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link
              className="gap-2"
              params={{ tournamentId }}
              to="/tournaments/$tournamentId"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          {isAdmin && (
            <Button asChild variant="secondary">
              <Link
                params={{ tournamentId }}
                to="/tournaments/$tournamentId/registrations"
              >
                Manage registrations
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Current status
              <Badge variant={statusMeta.badgeVariant}>
                {statusMeta.label}
              </Badge>
            </CardTitle>
            <CardDescription>{statusMeta.description}</CardDescription>
          </div>
          {!isAdmin && (
            <Button
              disabled={finalizeDisabled || finalizeRegistration.isPending}
              onClick={() => finalizeRegistration.mutate()}
              variant="secondary"
            >
              {finalizeRegistration.isPending
                ? "Submitting..."
                : "Submit registration"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-sm">Required steps</p>
            <p className="font-semibold text-2xl">
              {summary.approvedCount}/{summary.requiredCount} approved
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Organization</p>
            <p className="font-semibold">
              {detail.registration.organization.name}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Last consent</p>
            <p className="font-semibold">
              {formatDateTime(detail.registration.consentAcceptedAt)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Each step card aggregates multiple input states. */}
        {detail.steps.map((step) => (
          <Card key={step.id}>
            <CardHeader className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {step.stepOrder}. {step.title}
                  <Badge variant="outline">
                    {getStepTypeLabel(step.stepType)}
                  </Badge>
                  {!step.isRequired && (
                    <Badge variant="secondary">Optional</Badge>
                  )}
                </CardTitle>
                {step.description && (
                  <CardDescription>{step.description}</CardDescription>
                )}
              </div>
              <Badge variant={getStepStatusMeta(step.status).badgeVariant}>
                {getStepStatusMeta(step.status).label}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {step.stepType === "INFO" && (
                <div className="space-y-2">
                  <Textarea
                    className="min-h-[150px]"
                    disabled={submitStep.isPending}
                    maxLength={step.metadata?.maxLength}
                    onChange={(event) =>
                      setInfoResponses((prev) => ({
                        ...prev,
                        [step.id]: event.target.value,
                      }))
                    }
                    value={infoResponses[step.id] ?? ""}
                  />
                  {step.metadata?.helperText && (
                    <p className="text-muted-foreground text-sm">
                      {step.metadata.helperText}
                    </p>
                  )}
                  <Button
                    disabled={submitStep.isPending}
                    onClick={() => handleInfoSubmit(step)}
                  >
                    {submitStep.isPending ? "Saving..." : "Save response"}
                  </Button>
                </div>
              )}

              {step.stepType === "FILE_UPLOAD" && (
                <FileUpload
                  config={{
                    acceptedTypes: step.metadata?.acceptedTypes || undefined,
                    helperText: step.metadata?.helperText || undefined,
                  }}
                  currentFile={
                    step.submission?.payload?.kind === "FILE_UPLOAD"
                      ? {
                          fileName: step.submission.payload.fileName,
                          url: step.submission.payload.fileUrl,
                        }
                      : undefined
                  }
                  disabled={submitStep.isPending}
                  onUploadSuccess={(file) =>
                    handleFileUploadSuccess(step.id, file)
                  }
                  uploadButtonText="Upload document"
                  uploading={uploadingStepId === step.id}
                />
              )}

              {step.stepType === "CONSENT" && (
                <div className="space-y-2">
                  <p>{step.metadata?.statement}</p>
                  <Button
                    disabled={
                      submitStep.isPending || step.status === "APPROVED"
                    }
                    onClick={() => handleConsentSubmit(step)}
                    variant="secondary"
                  >
                    {step.status === "APPROVED"
                      ? "Consent confirmed"
                      : "Confirm consent"}
                  </Button>
                </div>
              )}

              {step.submission?.payload?.kind === "FILE_UPLOAD" && (
                <a
                  className="inline-flex items-center gap-2 text-primary text-sm"
                  href={step.submission.payload.fileUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <FileText className="h-4 w-4" />
                  View uploaded document
                </a>
              )}
              {step.submission?.payload?.kind === "INFO" && (
                <p className="text-muted-foreground text-sm">
                  Last submitted:{" "}
                  {formatDateTime(step.submission.submittedAt ?? null)}
                </p>
              )}
              {step.submission?.reviewNotes && (
                <p className="text-destructive text-sm">
                  Review notes: {step.submission.reviewNotes}
                </p>
              )}

              {isAdmin && (
                <div className="space-y-2 rounded-lg border p-4">
                  <p className="font-semibold text-sm">Reviewer notes</p>
                  <Textarea
                    disabled={reviewStep.isPending}
                    onChange={(event) =>
                      setReviewNotes((prev) => ({
                        ...prev,
                        [step.id]: event.target.value,
                      }))
                    }
                    value={reviewNotes[step.id] ?? ""}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={reviewStep.isPending}
                      onClick={() => handleReview(step, "APPROVED")}
                      variant="secondary"
                    >
                      {reviewStep.isPending ? "Saving..." : "Approve"}
                    </Button>
                    <Button
                      disabled={reviewStep.isPending}
                      onClick={() => handleReview(step, "REJECTED")}
                      variant="destructive"
                    >
                      Request changes
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default RegistrationTaskPage;
