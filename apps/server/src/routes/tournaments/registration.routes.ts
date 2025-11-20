import crypto from "node:crypto";
import { auth } from "@rms-modern/auth";
import { Prisma } from "@rms-modern/prisma";
import { prisma } from "../../lib/prisma";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  registrationSchema,
  registrationStatusUpdateSchema,
  registrationStepPayloadSchema,
  registrationStepUpdateSchema,
  registrationSubmissionPayloadSchema,
  registrationSubmissionReviewSchema,
} from "./schemas";
import { getTournamentByIdentifier } from "./utils";

const registrationRoute = new Hono();

type RegistrationSubmissionPayload =
  | { kind: "INFO"; responseText: string }
  | { kind: "FILE_UPLOAD"; fileId: string; fileName: string; fileUrl: string }
  | { kind: "CONSENT"; accepted: boolean; acceptedAt: string };

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

function ensureAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null
): asserts session is NonNullable<SessionResult> & { user: { id: string; role?: string } } {
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}

async function assertTeamManagerAccess(userId: string, organizationId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: {
      organizationId,
      userId,
      role: { in: ["TEAM_MENTOR", "TEAM_LEADER"] },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new HTTPException(403, {
      message: "You do not have permission to manage this team.",
    });
  }
}

function parseMetadata(metadata: unknown) {
  if (!metadata) return null;
  try {
    if (typeof metadata === "string") return JSON.parse(metadata);
    if (typeof metadata === "object") return metadata as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function parseSubmissionPayload(payload: unknown) {
  if (!payload) return null;
  try {
    if (typeof payload === "string") return JSON.parse(payload) as RegistrationSubmissionPayload;
    if (typeof payload === "object") return payload as RegistrationSubmissionPayload;
    return null;
  } catch {
    return null;
  }
}

function deriveStepStatus(submission?: { status: string } | null) {
  if (!submission) return "NOT_STARTED" as const;
  return submission.status;
}

async function buildSubmissionPayload({
  step,
  body,
  session,
  isAdmin,
}: {
  step: NonNullable<Awaited<ReturnType<typeof resolveRegistrationContext>>["step"]>;
  body: z.infer<typeof registrationSubmissionPayloadSchema>;
  session: NonNullable<SessionResult>;
  isAdmin: boolean;
}): Promise<RegistrationSubmissionPayload> {
  switch (step.stepType) {
    case "INFO": {
      const responseText = body.responseText?.trim();
      if (!responseText) {
        throw new HTTPException(400, {
          message: "Response text is required for this step.",
        });
      }
      return { kind: "INFO", responseText };
    }
    case "FILE_UPLOAD": {
      if (!body.fileId) {
        throw new HTTPException(400, {
          message: "fileId is required for file upload steps.",
        });
      }
      const file = await prisma.file.findUnique({
        where: { id: body.fileId },
        select: {
          id: true,
          originalName: true,
          publicUrl: true,
          uploadedBy: true,
        },
      });
      if (!file) {
        throw new HTTPException(404, {
          message: "Uploaded file not found.",
        });
      }
      if (!isAdmin && file.uploadedBy !== session.user.id) {
        throw new HTTPException(403, {
          message: "You can only submit files that you uploaded.",
        });
      }
      return {
        kind: "FILE_UPLOAD",
        fileId: file.id,
        fileName: file.originalName,
        fileUrl: file.publicUrl ?? "",
      };
    }
    case "CONSENT": {
      if (!body.consentAccepted) {
        throw new HTTPException(400, {
          message: "Consent must be accepted to continue.",
        });
      }
      return {
        kind: "CONSENT",
        accepted: true,
        acceptedAt: new Date().toISOString(),
      };
    }
    default:
      throw new HTTPException(400, {
        message: `Unsupported registration step type: ${step.stepType}`,
      });
  }
}

type LoadedRegistration = {
  id: string;
  tournamentId: string;
  organizationId: string;
  status: string;
  notes: string | null;
  consentAcceptedAt: Date | null;
  organizationName: string;
  organizationSlug: string;
};

async function loadRegistration(tournamentId: string, registrationId: string) {
  const rec = await prisma.tournamentParticipation.findFirst({
    where: { id: registrationId, tournamentId },
    select: {
      id: true,
      tournamentId: true,
      organizationId: true,
      status: true,
      notes: true,
      consentAcceptedAt: true,
      organization: { select: { name: true, slug: true } },
    },
  });
  if (!rec) return null;
  return {
    id: rec.id,
    tournamentId: rec.tournamentId,
    organizationId: rec.organizationId,
    status: rec.status,
    notes: rec.notes,
    consentAcceptedAt: rec.consentAcceptedAt,
    organizationName: rec.organization?.name ?? "",
    organizationSlug: rec.organization?.slug ?? "",
  } satisfies LoadedRegistration;
}

function isAdminSession(session: SessionResult | null) {
  return ((session?.user as { role?: string })?.role ?? "") === "ADMIN";
}

async function resolveRegistrationContext(
  c: Context,
  options?: { includeStep?: boolean }
): Promise<{
  session: SessionResult;
  isAdmin: boolean;
  tournament: NonNullable<Awaited<ReturnType<typeof getTournamentByIdentifier>>>;
  registration: LoadedRegistration;
  step?: {
    id: string;
    title: string;
    description: string | null;
    stepType: string;
    isRequired: boolean;
    stepOrder: number;
    metadata: unknown;
  };
}> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new HTTPException(401, { message: "Unauthorized" });

  const { identifier, registrationId, stepId } = c.req.param();
  if (!(identifier && registrationId)) throw new HTTPException(400, { message: "Missing parameters" });

  const tournament = await getTournamentByIdentifier(identifier);
  if (!tournament) throw new HTTPException(404, { message: "Tournament not found" });

  const registration = await loadRegistration(tournament.id, registrationId);
  if (!registration) throw new HTTPException(404, { message: "Registration not found" });

  const isAdmin = isAdminSession(session);
  if (!isAdmin) await assertTeamManagerAccess(session.user.id, registration.organizationId);

  let step: {
    id: string;
    title: string;
    description: string | null;
    stepType: string;
    isRequired: boolean;
    stepOrder: number;
    metadata: unknown;
  } | undefined;

  if (options?.includeStep) {
    if (!stepId) throw new HTTPException(400, { message: "Step ID is required" });
    const s = await prisma.tournamentRegistrationStep.findFirst({
      where: { id: stepId, tournamentId: tournament.id },
    });
    if (!s) throw new HTTPException(404, { message: "Registration step not found" });
    step = {
      id: s.id,
      title: s.title,
      description: s.description,
      stepType: s.stepType,
      isRequired: Boolean(s.isRequired),
      stepOrder: s.stepOrder,
      metadata: s.metadata,
    };
  }

  return { session, isAdmin, tournament, registration, step };
}

async function upsertRegistrationSubmission(params: {
  tournamentId: string;
  participationId: string;
  organizationId: string;
  stepId: string;
  session: NonNullable<SessionResult>;
  payload: RegistrationSubmissionPayload;
}) {
  const now = new Date();
  const existing = await prisma.tournamentRegistrationSubmission.findFirst({
    where: { participationId: params.participationId, stepId: params.stepId },
    select: { id: true },
  });

  if (existing) {
    await prisma.tournamentRegistrationSubmission.update({
      where: { id: existing.id },
      data: {
        payload: params.payload as Prisma.InputJsonValue,
        status: "PENDING",
        submittedAt: now,
        submittedBy: params.session.user.id,
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
        updatedAt: now,
      },
    });
    return existing.id;
  }

  const created = await prisma.tournamentRegistrationSubmission.create({
    data: {
      id: crypto.randomUUID(),
      tournamentId: params.tournamentId,
      participationId: params.participationId,
      organizationId: params.organizationId,
      stepId: params.stepId,
      status: "PENDING",
      payload: params.payload as Prisma.InputJsonValue,
      submittedAt: now,
      submittedBy: params.session.user.id,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
  return created.id;
}

registrationRoute.get("/:identifier/registration/steps", async (c) => {
  try {
    const { identifier } = c.req.param();
    if (!identifier) return c.json({ error: "Tournament identifier is required" }, 400);

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const steps = await prisma.tournamentRegistrationStep.findMany({
      where: { tournamentId: tournament.id },
      orderBy: [{ stepOrder: "asc" }, { createdAt: "asc" }],
    });

    return c.json({
      steps: steps.map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description,
        stepType: step.stepType,
        isRequired: Boolean(step.isRequired),
        stepOrder: step.stepOrder,
        metadata: parseMetadata(step.metadata as any),
      })),
    });
  } catch (error) {
    console.error("Failed to load registration steps", error);
    return c.json({ error: "Unable to load registration steps" }, 500);
  }
});

registrationRoute.post("/:identifier/register", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const { identifier } = c.req.param();
    if (!identifier) return c.json({ error: "Tournament identifier is required" }, 400);

    const rawBody = await c.req.json().catch(() => ({}));
    const body = registrationSchema.parse({ ...rawBody, organizationId: rawBody.organizationId ?? rawBody.teamId });

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    await assertTeamManagerAccess(session.user.id, body.organizationId);

    const existing = await prisma.tournamentParticipation.findFirst({
      where: { tournamentId: tournament.id, organizationId: body.organizationId },
      select: { id: true },
    });
    if (existing) return c.json({ error: "Team already registered for this tournament" }, 409);

    const now = new Date();
    const created = await prisma.tournamentParticipation.create({
      data: {
        id: crypto.randomUUID(),
        tournamentId: tournament.id,
        organizationId: body.organizationId,
        registeredBy: session.user.id,
        notes: body.notes?.trim(),
        status: "IN_PROGRESS",
        consentAcceptedAt: now,
        consentAcceptedBy: session.user.id,
      },
      select: { id: true, status: true, organizationId: true },
    });

    return c.json({ registration: created }, 201);
  } catch (error) {
    console.error("Failed to start registration", error);
    if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
    if (error instanceof HTTPException) throw error;
    return c.json({ error: "Unable to register team" }, 500);
  }
});

registrationRoute.post("/:identifier/registration/steps", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    ensureAdmin(session);

    const { identifier } = c.req.param();
    if (!identifier) return c.json({ error: "Tournament identifier is required" }, 400);

    const body = registrationStepPayloadSchema.parse(await c.req.json());

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const now = new Date();
    const created = await prisma.tournamentRegistrationStep.create({
      data: {
        id: crypto.randomUUID(),
        tournamentId: tournament.id,
        title: body.title,
        description: body.description,
        stepType: body.stepType,
        isRequired: body.isRequired ?? true,
        stepOrder: body.stepOrder ?? 1,
        metadata:
          body.metadata === undefined
            ? Prisma.JsonNull
            : ((body.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue),
        createdBy: session!.user.id,
        updatedBy: session!.user.id,
        createdAt: now,
        updatedAt: now,
      },
    });

    return c.json(
      {
        step: {
          id: created.id,
          title: created.title,
          description: created.description,
          stepType: created.stepType,
          isRequired: Boolean(created.isRequired),
          stepOrder: created.stepOrder,
          metadata: parseMetadata(created.metadata as any),
        },
      },
      201
    );
  } catch (error) {
    console.error("Failed to create registration step", error);
    if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
    return c.json({ error: "Unable to create registration step" }, 500);
  }
});

registrationRoute.patch("/:identifier/registration/steps/:stepId", async (c) => {
  try {
    const rawSession = await auth.api.getSession({ headers: c.req.raw.headers });
    ensureAdmin(rawSession);
    const session = rawSession!;

    const { identifier, stepId } = c.req.param();
    if (!(identifier && stepId)) return c.json({ error: "Missing identifier or step ID" }, 400);

    const payload = registrationStepUpdateSchema.parse(await c.req.json());

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const current = await prisma.tournamentRegistrationStep.findFirst({
      where: { id: stepId, tournamentId: tournament.id },
    });
    if (!current) return c.json({ error: "Registration step not found" }, 404);

    await prisma.tournamentRegistrationStep.update({
      where: { id: current.id },
      data: {
        title: payload.title ?? current.title,
        description: payload.description ?? current.description,
        isRequired: payload.isRequired ?? Boolean(current.isRequired ?? true),
        stepOrder: payload.stepOrder ?? current.stepOrder,
        stepType: payload.stepType ?? current.stepType,
        metadata:
          payload.metadata === undefined
            ? (current.metadata === null
                ? Prisma.JsonNull
                : (current.metadata as Prisma.InputJsonValue))
            : ((payload.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue),
        updatedAt: new Date(),
        updatedBy: session.user.id,
      },
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to update registration step", error);
    if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
    return c.json({ error: "Unable to update registration step" }, 500);
  }
});

registrationRoute.delete("/:identifier/registration/steps/:stepId", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    ensureAdmin(session);

    const { identifier, stepId } = c.req.param();
    if (!(identifier && stepId)) return c.json({ error: "Missing identifier or step ID" }, 400);

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    await prisma.tournamentRegistrationStep.deleteMany({
      where: { id: stepId, tournamentId: tournament.id },
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to delete registration step", error);
    return c.json({ error: "Unable to delete registration step" }, 500);
  }
});

registrationRoute.get("/:identifier/registrations", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    ensureAdmin(session);

    const { identifier } = c.req.param();
    if (!identifier) return c.json({ error: "Tournament identifier is required" }, 400);

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) return c.json({ error: "Tournament not found" }, 404);

    const steps = await prisma.tournamentRegistrationStep.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { stepOrder: "asc" },
      select: { id: true, isRequired: true },
    });

    const totalSteps = steps.length;
    const requiredSteps = steps.filter((s) => Boolean(s.isRequired)).length;

    const registrations = await prisma.tournamentParticipation.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        organizationId: true,
        status: true,
        notes: true,
        consentAcceptedAt: true,
        createdAt: true,
        organization: { select: { name: true, slug: true } },
      },
    });

    const submissions = await prisma.tournamentRegistrationSubmission.findMany({
      where: { tournamentId: tournament.id },
      select: { participationId: true, status: true, updatedAt: true },
    });

    const submissionMap = new Map<string, { pending: number; approved: number; rejected: number; lastActivity: Date | null }>();
    for (const s of submissions) {
      const cur = submissionMap.get(s.participationId) ?? {
        pending: 0,
        approved: 0,
        rejected: 0,
        lastActivity: null,
      };
      if (s.status === "APPROVED") cur.approved += 1;
      else if (s.status === "REJECTED") cur.rejected += 1;
      else cur.pending += 1;
      if (!cur.lastActivity || s.updatedAt > cur.lastActivity) cur.lastActivity = s.updatedAt;
      submissionMap.set(s.participationId, cur);
    }

    return c.json({
      requiredSteps,
      totalSteps,
      registrations: registrations.map((r) => {
        const summary = submissionMap.get(r.id) ?? { pending: 0, approved: 0, rejected: 0, lastActivity: null };
        return {
          id: r.id,
          organization: { id: r.organizationId, name: r.organization?.name, slug: r.organization?.slug },
          status: r.status,
          notes: r.notes,
          consentAcceptedAt: r.consentAcceptedAt ? r.consentAcceptedAt.toISOString() : null,
          lastActivityAt: summary.lastActivity ? summary.lastActivity.toISOString() : null,
          counts: { pending: summary.pending, approved: summary.approved, rejected: summary.rejected },
        };
      }),
    });
  } catch (error) {
    console.error("Failed to load registrations", error);
    return c.json({ error: "Unable to load registrations" }, 500);
  }
});

registrationRoute.get("/:identifier/registrations/:registrationId", async (c) => {
  try {
    const { registration, tournament } = await resolveRegistrationContext(c);

    const steps = await prisma.tournamentRegistrationStep.findMany({
      where: { tournamentId: tournament.id },
      orderBy: [{ stepOrder: "asc" }, { createdAt: "asc" }],
    });

    const submissions = await prisma.tournamentRegistrationSubmission.findMany({
      where: { participationId: registration.id, tournamentId: tournament.id },
    });

    const submissionMap = new Map<string, (typeof submissions)[number]>();
    for (const submission of submissions) submissionMap.set(submission.stepId, submission);

    return c.json({
      registration: {
        id: registration.id,
        status: registration.status,
        notes: registration.notes,
        organization: {
          id: registration.organizationId,
          name: registration.organizationName,
          slug: registration.organizationSlug,
        },
        consentAcceptedAt: registration.consentAcceptedAt
          ? registration.consentAcceptedAt.toISOString()
          : null,
      },
      steps: steps.map((step) => {
        const submission = submissionMap.get(step.id) ?? null;
        return {
          id: step.id,
          title: step.title,
          description: step.description,
          stepType: step.stepType,
          isRequired: Boolean(step.isRequired),
          stepOrder: step.stepOrder,
          metadata: parseMetadata(step.metadata as any),
          status: deriveStepStatus(submission),
          submission: submission
            ? {
                id: submission.id,
                status: submission.status,
                payload: parseSubmissionPayload(submission.payload as any),
                submittedAt: submission.submittedAt?.toISOString() ?? null,
                reviewedAt: submission.reviewedAt?.toISOString() ?? null,
                reviewNotes: submission.reviewNotes,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("Failed to load registration detail", error);
    if (error instanceof HTTPException) throw error;
    return c.json({ error: "Unable to load registration detail" }, 500);
  }
});

registrationRoute.post(
  "/:identifier/registrations/:registrationId/steps/:stepId",
  async (c) => {
    try {
      const context = await resolveRegistrationContext(c, { includeStep: true });
      const body = registrationSubmissionPayloadSchema.parse(await c.req.json());
      const payload = await buildSubmissionPayload({
        step: context.step!,
        body,
        session: context.session as NonNullable<SessionResult>,
        isAdmin: context.isAdmin,
      });

      await upsertRegistrationSubmission({
        tournamentId: context.tournament.id,
        participationId: context.registration.id,
        organizationId: context.registration.organizationId,
        stepId: context.step!.id,
        session: context.session as NonNullable<SessionResult>,
        payload,
      });

      const updatedSubmission = await prisma.tournamentRegistrationSubmission.findFirst({
        where: { participationId: context.registration.id, stepId: context.step!.id },
      });

      return c.json({
        step: {
          id: context.step!.id,
          status: deriveStepStatus(updatedSubmission ?? null),
          submission: updatedSubmission
            ? {
                id: updatedSubmission.id,
                status: updatedSubmission.status,
                payload: parseSubmissionPayload(updatedSubmission.payload as any),
                submittedAt: updatedSubmission.submittedAt?.toISOString() ?? null,
                reviewedAt: updatedSubmission.reviewedAt?.toISOString() ?? null,
                reviewNotes: updatedSubmission.reviewNotes,
              }
            : null,
        },
      });
    } catch (error) {
      console.error("Failed to submit registration step", error);
      if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
      if (error instanceof HTTPException) throw error;
      return c.json({ error: "Unable to submit registration step" }, 500);
    }
  }
);

registrationRoute.post(
  "/:identifier/registrations/:registrationId/submit",
  async (c) => {
    try {
      const context = await resolveRegistrationContext(c);

      const steps = await prisma.tournamentRegistrationStep.findMany({
        where: { tournamentId: context.tournament.id },
        select: { id: true, isRequired: true },
      });

      const requiredSteps = steps.filter((s) => Boolean(s.isRequired));
      if (!requiredSteps.length) {
        await prisma.tournamentParticipation.update({
          where: { id: context.registration.id },
          data: { status: "SUBMITTED" },
        });
        return c.json({ status: "SUBMITTED" });
      }

      const submissions = await prisma.tournamentRegistrationSubmission.findMany({
        where: { participationId: context.registration.id, tournamentId: context.tournament.id },
        select: { stepId: true, status: true },
      });

      const submittedStepIds = new Set(
        submissions
          .filter((s) => s.status !== "REJECTED")
          .map((s) => s.stepId)
      );

      const missingSteps = requiredSteps.filter((s) => !submittedStepIds.has(s.id));
      if (missingSteps.length) {
        return c.json(
          {
            error: "Complete all required steps before submitting.",
            missingSteps: missingSteps.map((s) => ({ id: s.id })),
          },
          400
        );
      }

      await prisma.tournamentParticipation.update({
        where: { id: context.registration.id },
        data: { status: "SUBMITTED" },
      });

      return c.json({ status: "SUBMITTED" });
    } catch (error) {
      console.error("Failed to finalize registration", error);
      if (error instanceof HTTPException) throw error;
      return c.json({ error: "Unable to submit registration" }, 500);
    }
  }
);

registrationRoute.patch(
  "/:identifier/registrations/:registrationId/steps/:stepId/review",
  async (c) => {
    try {
      const context = await resolveRegistrationContext(c, { includeStep: true });
      if (!context.isAdmin) return c.json({ error: "Forbidden" }, 403);

      const body = registrationSubmissionReviewSchema.parse(await c.req.json());

      const currentSubmission = await prisma.tournamentRegistrationSubmission.findFirst({
        where: { participationId: context.registration.id, stepId: context.step!.id },
      });
      if (!currentSubmission) return c.json({ error: "Submission not found for this step" }, 404);

      const now = new Date();
      await prisma.tournamentRegistrationSubmission.update({
        where: { id: currentSubmission.id },
        data: {
          status: body.status,
          reviewNotes: body.reviewNotes ?? null,
          reviewedAt: now,
          reviewedBy: (context.session as NonNullable<SessionResult>).user.id,
          updatedAt: now,
        },
      });

      if (body.status === "REJECTED") {
        await prisma.tournamentParticipation.update({
          where: { id: context.registration.id },
          data: { status: "REJECTED" },
        });
      } else if (body.status === "APPROVED") {
        const requiredSteps = await prisma.tournamentRegistrationStep.findMany({
          where: { tournamentId: context.tournament.id, isRequired: true },
          select: { id: true },
        });
        if (requiredSteps.length) {
          const approvals = await prisma.tournamentRegistrationSubmission.findMany({
            where: { participationId: context.registration.id, status: "APPROVED" },
            select: { stepId: true },
          });
          const approvedStepIds = new Set(approvals.map((a) => a.stepId));
          const allApproved = requiredSteps.every((s) => approvedStepIds.has(s.id));
          if (allApproved) {
            await prisma.tournamentParticipation.update({
              where: { id: context.registration.id },
              data: { status: "APPROVED" },
            });
          }
        }
      }

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to review submission", error);
      if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
      if (error instanceof HTTPException) throw error;
      return c.json({ error: "Unable to review submission" }, 500);
    }
  }
);

registrationRoute.patch(
  "/:identifier/registrations/:registrationId/status",
  async (c) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      ensureAdmin(session);

      const { identifier, registrationId } = c.req.param();
      if (!(identifier && registrationId)) return c.json({ error: "Missing parameters" }, 400);

      const body = registrationStatusUpdateSchema.parse(await c.req.json());

      const tournament = await getTournamentByIdentifier(identifier);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const registration = await loadRegistration(tournament.id, registrationId);
      if (!registration) return c.json({ error: "Registration not found" }, 404);

      await prisma.tournamentParticipation.update({
        where: { id: registration.id },
        data: { status: body.status },
      });

      return c.json({ status: body.status });
    } catch (error) {
      console.error("Failed to update registration status", error);
      if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
      return c.json({ error: "Unable to update registration status" }, 500);
    }
  }
);

export { registrationRoute };
