import crypto from "node:crypto";
import { auth } from "@rms-modern/auth";
import { type AppDB, db } from "@rms-modern/db";
import { files } from "@rms-modern/db/schema/files";
import {
  organizationMembers,
  organizations,
  type TournamentRegistrationStepType,
  tournamentParticipations,
  tournamentRegistrationSteps,
  tournamentRegistrationSubmissions,
  type tournaments,
} from "@rms-modern/db/schema/organization";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
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
  | {
      kind: "INFO";
      responseText: string;
    }
  | {
      kind: "FILE_UPLOAD";
      fileId: string;
      fileName: string;
      fileUrl: string;
    }
  | {
      kind: "CONSENT";
      accepted: boolean;
      acceptedAt: string;
    };

function ensureAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null
): asserts session is NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
> & {
  user: { role?: string; id: string };
} {
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}

async function assertTeamManagerAccess(userId: string, organizationId: string) {
  const membership = await (db as AppDB)
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
        inArray(organizationMembers.role, ["TEAM_MENTOR", "TEAM_LEADER"])
      )
    )
    .limit(1);

  if (!membership.length) {
    throw new HTTPException(403, {
      message: "You do not have permission to manage this team.",
    });
  }
}

function parseMetadata(
  stepType: TournamentRegistrationStepType,
  metadata: string | null
) {
  if (!metadata) {
    return null;
  }
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    return parsed;
  } catch (error) {
    console.warn("Unable to parse registration metadata", {
      stepType,
      error,
    });
    return null;
  }
}

function parseSubmissionPayload(payload: string | null) {
  if (!payload) {
    return null;
  }
  try {
    const parsed = JSON.parse(payload) as RegistrationSubmissionPayload;
    if (!parsed.kind) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Unable to parse submission payload", error);
    return null;
  }
}

function deriveStepStatus(
  submission?: typeof tournamentRegistrationSubmissions.$inferSelect | null
) {
  if (!submission) {
    return "NOT_STARTED" as const;
  }
  return submission.status;
}

function formatSubmissionResponse(
  submission?: typeof tournamentRegistrationSubmissions.$inferSelect | null
) {
  if (!submission) {
    return null;
  }

  return {
    id: submission.id,
    status: submission.status,
    payload: parseSubmissionPayload(submission.payload),
    submittedAt: submission.submittedAt
      ? submission.submittedAt.toISOString()
      : null,
    reviewedAt: submission.reviewedAt
      ? submission.reviewedAt.toISOString()
      : null,
    reviewNotes: submission.reviewNotes,
  };
}

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;
type LoadedRegistration = NonNullable<
  Awaited<ReturnType<typeof loadRegistration>>
>;
type StepRecord = typeof tournamentRegistrationSteps.$inferSelect;

function isAdminSession(session: SessionResult | null) {
  return ((session?.user as { role?: string })?.role ?? "") === "ADMIN";
}

async function resolveRegistrationContext(
  c: Context,
  options?: { includeStep?: boolean }
): Promise<{
  session: SessionResult;
  isAdmin: boolean;
  tournament: typeof tournaments.$inferSelect;
  registration: LoadedRegistration;
  step?: StepRecord;
}> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  const { identifier, registrationId, stepId } = c.req.param();
  if (!(identifier && registrationId)) {
    throw new HTTPException(400, { message: "Missing parameters" });
  }

  const tournament = await getTournamentByIdentifier(identifier);
  if (!tournament) {
    throw new HTTPException(404, { message: "Tournament not found" });
  }

  const registration = await loadRegistration(tournament.id, registrationId);
  if (!registration) {
    throw new HTTPException(404, { message: "Registration not found" });
  }

  const isAdmin = isAdminSession(session);
  if (!isAdmin) {
    await assertTeamManagerAccess(session.user.id, registration.organizationId);
  }

  let step: StepRecord | undefined;
  if (options?.includeStep) {
    if (!stepId) {
      throw new HTTPException(400, { message: "Step ID is required" });
    }
    const existingStep = await (db as AppDB)
      .select()
      .from(tournamentRegistrationSteps)
      .where(
        and(
          eq(tournamentRegistrationSteps.id, stepId),
          eq(tournamentRegistrationSteps.tournamentId, tournament.id)
        )
      )
      .limit(1);

    step = existingStep[0];
    if (!step) {
      throw new HTTPException(404, { message: "Registration step not found" });
    }
  }

  return {
    session,
    isAdmin,
    tournament,
    registration,
    step,
  };
}

type SubmissionPayloadInput = z.infer<
  typeof registrationSubmissionPayloadSchema
>;

/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Centralized payload validation keeps each step type together. */
async function buildSubmissionPayload(options: {
  step: StepRecord;
  body: SubmissionPayloadInput;
  session: NonNullable<SessionResult>;
  registration: LoadedRegistration;
  isAdmin: boolean;
}): Promise<RegistrationSubmissionPayload> {
  if (options.step.stepType === "INFO") {
    const responseText = options.body.responseText?.trim() ?? "";
    if (responseText.length < 3) {
      throw new HTTPException(422, {
        message: "Provide more detail for this response.",
      });
    }
    const metadata = parseMetadata("INFO", options.step.metadata) as {
      maxLength?: number;
    } | null;
    if (metadata?.maxLength && responseText.length > metadata.maxLength) {
      throw new HTTPException(422, {
        message: `Response is too long. Limit to ${metadata.maxLength} characters.`,
      });
    }
    return {
      kind: "INFO",
      responseText,
    };
  }

  if (options.step.stepType === "FILE_UPLOAD") {
    if (!options.body.fileId) {
      throw new HTTPException(422, {
        message: "fileId is required for this step.",
      });
    }
    const [fileRecord] = await (db as AppDB)
      .select()
      .from(files)
      .where(eq(files.id, options.body.fileId))
      .limit(1);

    if (!fileRecord) {
      throw new HTTPException(404, { message: "Uploaded file was not found." });
    }

    if (!options.isAdmin && fileRecord.uploadedBy !== options.session.user.id) {
      const otherMember = await (db as AppDB)
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, fileRecord.uploadedBy),
            eq(
              organizationMembers.organizationId,
              options.registration.organizationId
            )
          )
        )
        .limit(1);

      if (!otherMember.length) {
        throw new HTTPException(403, {
          message: "You can only submit files uploaded by your team.",
        });
      }
    }

    return {
      kind: "FILE_UPLOAD",
      fileId: fileRecord.id,
      fileName: fileRecord.originalName,
      fileUrl: fileRecord.publicUrl,
    };
  }

  if (!options.body.consentAccepted) {
    throw new HTTPException(422, {
      message: "You must accept the statement to complete this step.",
    });
  }

  return {
    kind: "CONSENT",
    accepted: true,
    acceptedAt: new Date().toISOString(),
  };
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
  const existing = await (db as AppDB)
    .select({ id: tournamentRegistrationSubmissions.id })
    .from(tournamentRegistrationSubmissions)
    .where(
      and(
        eq(
          tournamentRegistrationSubmissions.participationId,
          params.participationId
        ),
        eq(tournamentRegistrationSubmissions.stepId, params.stepId)
      )
    )
    .limit(1);

  if (existing[0]) {
    await (db as AppDB)
      .update(tournamentRegistrationSubmissions)
      .set({
        payload: JSON.stringify(params.payload),
        status: "PENDING",
        submittedAt: now,
        submittedBy: params.session.user.id,
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
        updatedAt: now,
      })
      .where(eq(tournamentRegistrationSubmissions.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await (db as AppDB)
    .insert(tournamentRegistrationSubmissions)
    .values({
      id: crypto.randomUUID(),
      tournamentId: params.tournamentId,
      participationId: params.participationId,
      organizationId: params.organizationId,
      stepId: params.stepId,
      status: "PENDING",
      payload: JSON.stringify(params.payload),
      submittedAt: now,
      submittedBy: params.session.user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tournamentRegistrationSubmissions.id });

  return created?.id ?? null;
}

async function loadRegistration(tournamentId: string, registrationId: string) {
  const records = await (db as AppDB)
    .select({
      id: tournamentParticipations.id,
      tournamentId: tournamentParticipations.tournamentId,
      organizationId: tournamentParticipations.organizationId,
      status: tournamentParticipations.status,
      notes: tournamentParticipations.notes,
      consentAcceptedAt: tournamentParticipations.consentAcceptedAt,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
    })
    .from(tournamentParticipations)
    .innerJoin(
      organizations,
      eq(tournamentParticipations.organizationId, organizations.id)
    )
    .where(
      and(
        eq(tournamentParticipations.id, registrationId),
        eq(tournamentParticipations.tournamentId, tournamentId)
      )
    )
    .limit(1);

  return records[0] ?? null;
}

registrationRoute.get("/:identifier/registration/steps", async (c) => {
  try {
    const { identifier } = c.req.param();

    if (!identifier) {
      return c.json({ error: "Tournament identifier is required" }, 400);
    }

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const steps = await (db as AppDB)
      .select()
      .from(tournamentRegistrationSteps)
      .where(eq(tournamentRegistrationSteps.tournamentId, tournament.id))
      .orderBy(
        asc(tournamentRegistrationSteps.stepOrder),
        asc(tournamentRegistrationSteps.createdAt)
      );

    return c.json({
      steps: steps.map((step: StepRecord) => ({
        id: step.id,
        title: step.title,
        description: step.description,
        stepType: step.stepType,
        isRequired: Boolean(step.isRequired),
        stepOrder: step.stepOrder,
        metadata: parseMetadata(step.stepType, step.metadata),
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
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { identifier } = c.req.param();
    if (!identifier) {
      return c.json({ error: "Tournament identifier is required" }, 400);
    }

    const rawBody = await c.req.json().catch(() => ({}));
    const body = registrationSchema.parse({
      ...rawBody,
      organizationId: rawBody.organizationId ?? rawBody.teamId,
    });

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    await assertTeamManagerAccess(session.user.id, body.organizationId);

    const existingRegistration = await (db as AppDB)
      .select({ id: tournamentParticipations.id })
      .from(tournamentParticipations)
      .where(
        and(
          eq(tournamentParticipations.tournamentId, tournament.id),
          eq(tournamentParticipations.organizationId, body.organizationId)
        )
      )
      .limit(1);

    if (existingRegistration.length) {
      return c.json(
        { error: "Team already registered for this tournament" },
        409
      );
    }

    const now = new Date();
    const [created] = await (db as AppDB)
      .insert(tournamentParticipations)
      .values({
        id: crypto.randomUUID(),
        tournamentId: tournament.id,
        organizationId: body.organizationId,
        registeredBy: session.user.id,
        notes: body.notes?.trim(),
        status: "IN_PROGRESS",
        consentAcceptedAt: now,
        consentAcceptedBy: session.user.id,
      })
      .returning({
        id: tournamentParticipations.id,
        status: tournamentParticipations.status,
        organizationId: tournamentParticipations.organizationId,
      });

    return c.json(
      {
        registration: {
          id: created.id,
          status: created.status,
          organizationId: created.organizationId,
        },
      },
      201
    );
  } catch (error) {
    console.error("Failed to start registration", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    if (error instanceof HTTPException) {
      throw error;
    }
    return c.json({ error: "Unable to register team" }, 500);
  }
});

registrationRoute.post("/:identifier/registration/steps", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    ensureAdmin(session);

    const { identifier } = c.req.param();
    if (!identifier) {
      return c.json({ error: "Tournament identifier is required" }, 400);
    }

    const body = registrationStepPayloadSchema.parse(await c.req.json());

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const now = new Date();
    const [created] = await (db as AppDB)
      .insert(tournamentRegistrationSteps)
      .values({
        id: crypto.randomUUID(),
        tournamentId: tournament.id,
        title: body.title,
        description: body.description,
        stepType: body.stepType,
        isRequired: body.isRequired ?? true,
        stepOrder: body.stepOrder ?? 1,
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
        createdBy: session.user.id,
        updatedBy: session.user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const createdStep = created as typeof created & {
      metadata: string | null;
    };

    return c.json(
      {
        step: {
          id: createdStep.id,
          title: createdStep.title,
          description: createdStep.description,
          stepType: createdStep.stepType,
          isRequired: Boolean(createdStep.isRequired),
          stepOrder: createdStep.stepOrder,
          metadata: parseMetadata(createdStep.stepType, createdStep.metadata),
        },
      },
      201
    );
  } catch (error) {
    console.error("Failed to create registration step", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to create registration step" }, 500);
  }
});

registrationRoute.patch(
  "/:identifier/registration/steps/:stepId",
  async (c) => {
    try {
      const rawSession = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
      ensureAdmin(rawSession as SessionResult);
      const session = rawSession as NonNullable<SessionResult>;

      const { identifier, stepId } = c.req.param();
      if (!(identifier && stepId)) {
        return c.json({ error: "Missing identifier or step ID" }, 400);
      }

      const payload = registrationStepUpdateSchema.parse(await c.req.json());

      const tournament = await getTournamentByIdentifier(identifier);
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const existing = await (db as AppDB)
        .select()
        .from(tournamentRegistrationSteps)
        .where(
          and(
            eq(tournamentRegistrationSteps.id, stepId),
            eq(tournamentRegistrationSteps.tournamentId, tournament.id)
          )
        )
        .limit(1);

      const current = existing[0];
      if (!current) {
        return c.json({ error: "Registration step not found" }, 404);
      }

      const metadata =
        payload.metadata !== undefined
          ? JSON.stringify(payload.metadata)
          : current.metadata;

      await (db as AppDB)
        .update(tournamentRegistrationSteps)
        .set({
          title: payload.title ?? current.title,
          description: payload.description ?? current.description,
          isRequired: payload.isRequired ?? Boolean(current.isRequired ?? true),
          stepOrder: payload.stepOrder ?? current.stepOrder,
          stepType: payload.stepType ?? current.stepType,
          metadata,
          updatedAt: new Date(),
          updatedBy: session.user.id,
        })
        .where(eq(tournamentRegistrationSteps.id, current.id));

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to update registration step", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      return c.json({ error: "Unable to update registration step" }, 500);
    }
  }
);

registrationRoute.delete(
  "/:identifier/registration/steps/:stepId",
  async (c) => {
    try {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
      ensureAdmin(session);

      const { identifier, stepId } = c.req.param();
      if (!(identifier && stepId)) {
        return c.json({ error: "Missing identifier or step ID" }, 400);
      }

      const tournament = await getTournamentByIdentifier(identifier);
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      await (db as AppDB)
        .delete(tournamentRegistrationSteps)
        .where(
          and(
            eq(tournamentRegistrationSteps.id, stepId),
            eq(tournamentRegistrationSteps.tournamentId, tournament.id)
          )
        );

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to delete registration step", error);
      return c.json({ error: "Unable to delete registration step" }, 500);
    }
  }
);

registrationRoute.get("/:identifier/registrations", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    ensureAdmin(session);

    const { identifier } = c.req.param();
    if (!identifier) {
      return c.json({ error: "Tournament identifier is required" }, 400);
    }

    const tournament = await getTournamentByIdentifier(identifier);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const steps = await (db as AppDB)
      .select({
        id: tournamentRegistrationSteps.id,
        isRequired: tournamentRegistrationSteps.isRequired,
      })
      .from(tournamentRegistrationSteps)
      .where(eq(tournamentRegistrationSteps.tournamentId, tournament.id))
      .orderBy(asc(tournamentRegistrationSteps.stepOrder));

    const totalSteps = steps.length;
    const requiredSteps = steps.filter(
      (step: StepRecord) => step.isRequired
    ).length;

    const registrations = await (db as AppDB)
      .select({
        id: tournamentParticipations.id,
        organizationId: tournamentParticipations.organizationId,
        status: tournamentParticipations.status,
        notes: tournamentParticipations.notes,
        consentAcceptedAt: tournamentParticipations.consentAcceptedAt,
        createdAt: tournamentParticipations.createdAt,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
      })
      .from(tournamentParticipations)
      .innerJoin(
        organizations,
        eq(tournamentParticipations.organizationId, organizations.id)
      )
      .where(eq(tournamentParticipations.tournamentId, tournament.id))
      .orderBy(desc(tournamentParticipations.createdAt));

    const submissions = await (db as AppDB)
      .select({
        participationId: tournamentRegistrationSubmissions.participationId,
        status: tournamentRegistrationSubmissions.status,
        updatedAt: tournamentRegistrationSubmissions.updatedAt,
      })
      .from(tournamentRegistrationSubmissions)
      .where(eq(tournamentRegistrationSubmissions.tournamentId, tournament.id));

    const submissionMap = new Map<
      string,
      {
        pending: number;
        approved: number;
        rejected: number;
        lastActivity: Date | null;
      }
    >();

    for (const submission of submissions) {
      const summary = submissionMap.get(submission.participationId) ?? {
        pending: 0,
        approved: 0,
        rejected: 0,
        lastActivity: null,
      };

      if (submission.status === "APPROVED") {
        summary.approved += 1;
      } else if (submission.status === "REJECTED") {
        summary.rejected += 1;
      } else {
        summary.pending += 1;
      }

      if (
        !summary.lastActivity ||
        submission.updatedAt > summary.lastActivity
      ) {
        summary.lastActivity = submission.updatedAt;
      }

      submissionMap.set(submission.participationId, summary);
    }

    return c.json({
      requiredSteps,
      totalSteps,
      registrations: registrations.map(
        (registration: (typeof registrations)[number]) => {
          const summary = submissionMap.get(registration.id) ?? {
            pending: 0,
            approved: 0,
            rejected: 0,
            lastActivity: null,
          };
          return {
            id: registration.id,
            organization: {
              id: registration.organizationId,
              name: registration.organizationName,
              slug: registration.organizationSlug,
            },
            status: registration.status,
            notes: registration.notes,
            consentAcceptedAt: registration.consentAcceptedAt
              ? registration.consentAcceptedAt.toISOString()
              : null,
            lastActivityAt: summary.lastActivity
              ? summary.lastActivity.toISOString()
              : null,
            counts: {
              pending: summary.pending,
              approved: summary.approved,
              rejected: summary.rejected,
            },
          };
        }
      ),
    });
  } catch (error) {
    console.error("Failed to load registrations", error);
    return c.json({ error: "Unable to load registrations" }, 500);
  }
});

registrationRoute.get(
  "/:identifier/registrations/:registrationId",
  async (c) => {
    try {
      const { registration, tournament } = await resolveRegistrationContext(c);

      const steps = await (db as AppDB)
        .select()
        .from(tournamentRegistrationSteps)
        .where(eq(tournamentRegistrationSteps.tournamentId, tournament.id))
        .orderBy(
          asc(tournamentRegistrationSteps.stepOrder),
          asc(tournamentRegistrationSteps.createdAt)
        );

      const submissions = await (db as AppDB)
        .select()
        .from(tournamentRegistrationSubmissions)
        .where(
          and(
            eq(
              tournamentRegistrationSubmissions.participationId,
              registration.id
            ),
            eq(tournamentRegistrationSubmissions.tournamentId, tournament.id)
          )
        );

      const submissionMap = new Map<
        string,
        typeof tournamentRegistrationSubmissions.$inferSelect
      >();
      for (const submission of submissions) {
        submissionMap.set(submission.stepId, submission);
      }

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
        steps: steps.map((step: StepRecord) => {
          const submission = submissionMap.get(step.id) ?? null;
          return {
            id: step.id,
            title: step.title,
            description: step.description,
            stepType: step.stepType,
            isRequired: Boolean(step.isRequired),
            stepOrder: step.stepOrder,
            metadata: parseMetadata(step.stepType, step.metadata),
            status: deriveStepStatus(submission),
            submission: formatSubmissionResponse(submission),
          };
        }),
      });
    } catch (error) {
      console.error("Failed to load registration detail", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      return c.json({ error: "Unable to load registration detail" }, 500);
    }
  }
);

registrationRoute.post(
  "/:identifier/registrations/:registrationId/steps/:stepId",
  async (c) => {
    try {
      const context = await resolveRegistrationContext(c, {
        includeStep: true,
      });
      const body = registrationSubmissionPayloadSchema.parse(
        await c.req.json()
      );
      const payload = await buildSubmissionPayload({
        step: context.step as StepRecord,
        body,
        session: context.session as NonNullable<SessionResult>,
        registration: context.registration,
        isAdmin: context.isAdmin,
      });

      await upsertRegistrationSubmission({
        tournamentId: context.tournament.id,
        participationId: context.registration.id,
        organizationId: context.registration.organizationId,
        stepId: (context.step as StepRecord).id,
        session: context.session as NonNullable<SessionResult>,
        payload,
      });

      const [updatedSubmission] = await (db as AppDB)
        .select()
        .from(tournamentRegistrationSubmissions)
        .where(
          and(
            eq(
              tournamentRegistrationSubmissions.participationId,
              context.registration.id
            ),
            eq(
              tournamentRegistrationSubmissions.stepId,
              (context.step as StepRecord).id
            )
          )
        )
        .limit(1);

      return c.json({
        step: {
          id: (context.step as StepRecord).id,
          status: deriveStepStatus(updatedSubmission ?? null),
          submission: formatSubmissionResponse(updatedSubmission ?? null),
        },
      });
    } catch (error) {
      console.error("Failed to submit registration step", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      if (error instanceof HTTPException) {
        throw error;
      }
      return c.json({ error: "Unable to submit registration step" }, 500);
    }
  }
);

registrationRoute.post(
  "/:identifier/registrations/:registrationId/submit",
  async (c) => {
    try {
      const context = await resolveRegistrationContext(c);

      const steps = await (db as AppDB)
        .select({
          id: tournamentRegistrationSteps.id,
          isRequired: tournamentRegistrationSteps.isRequired,
        })
        .from(tournamentRegistrationSteps)
        .where(
          eq(tournamentRegistrationSteps.tournamentId, context.tournament.id)
        );

      const requiredSteps = steps.filter((step: StepRecord) => step.isRequired);
      if (!requiredSteps.length) {
        await (db as AppDB)
          .update(tournamentParticipations)
          .set({ status: "SUBMITTED" })
          .where(eq(tournamentParticipations.id, context.registration.id));
        return c.json({ status: "SUBMITTED" });
      }

      const submissions = await (db as AppDB)
        .select({
          stepId: tournamentRegistrationSubmissions.stepId,
          status: tournamentRegistrationSubmissions.status,
        })
        .from(tournamentRegistrationSubmissions)
        .where(
          and(
            eq(
              tournamentRegistrationSubmissions.participationId,
              context.registration.id
            ),
            eq(
              tournamentRegistrationSubmissions.tournamentId,
              context.tournament.id
            )
          )
        );

      const submittedStepIds = new Set(
        submissions
          .filter(
            (submission: (typeof submissions)[number]) =>
              submission.status !== "REJECTED"
          )
          .map((submission: (typeof submissions)[number]) => submission.stepId)
      );

      const missingSteps = requiredSteps.filter(
        (step: (typeof steps)[number]) => !submittedStepIds.has(step.id)
      );

      if (missingSteps.length) {
        return c.json(
          {
            error: "Complete all required steps before submitting.",
            missingSteps: missingSteps.map((step: (typeof steps)[number]) => ({
              id: step.id,
            })),
          },
          400
        );
      }

      await (db as AppDB)
        .update(tournamentParticipations)
        .set({ status: "SUBMITTED" })
        .where(eq(tournamentParticipations.id, context.registration.id));

      return c.json({ status: "SUBMITTED" });
    } catch (error) {
      console.error("Failed to finalize registration", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      return c.json({ error: "Unable to submit registration" }, 500);
    }
  }
);

registrationRoute.patch(
  "/:identifier/registrations/:registrationId/steps/:stepId/review",
  async (c) => {
    try {
      const context = await resolveRegistrationContext(c, {
        includeStep: true,
      });
      if (!context.isAdmin) {
        return c.json({ error: "Forbidden" }, 403);
      }

      const body = registrationSubmissionReviewSchema.parse(await c.req.json());

      const existingSubmission = await (db as AppDB)
        .select()
        .from(tournamentRegistrationSubmissions)
        .where(
          and(
            eq(
              tournamentRegistrationSubmissions.participationId,
              context.registration.id
            ),
            eq(
              tournamentRegistrationSubmissions.stepId,
              (context.step as StepRecord).id
            )
          )
        )
        .limit(1);

      const currentSubmission = existingSubmission[0];
      if (!currentSubmission) {
        return c.json({ error: "Submission not found for this step" }, 404);
      }

      const now = new Date();
      const sessionUser = context.session as NonNullable<SessionResult>;
      await (db as AppDB)
        .update(tournamentRegistrationSubmissions)
        .set({
          status: body.status,
          reviewNotes: body.reviewNotes ?? null,
          reviewedAt: now,
          reviewedBy: sessionUser.user.id,
          updatedAt: now,
        })
        .where(eq(tournamentRegistrationSubmissions.id, currentSubmission.id));

      if (body.status === "REJECTED") {
        await (db as AppDB)
          .update(tournamentParticipations)
          .set({ status: "REJECTED" })
          .where(eq(tournamentParticipations.id, context.registration.id));
      } else if (body.status === "APPROVED") {
        const requiredSteps = await (db as AppDB)
          .select({ id: tournamentRegistrationSteps.id })
          .from(tournamentRegistrationSteps)
          .where(
            and(
              eq(
                tournamentRegistrationSteps.tournamentId,
                context.tournament.id
              ),
              eq(tournamentRegistrationSteps.isRequired, true)
            )
          );

        if (requiredSteps.length) {
          const approvals = await (db as AppDB)
            .select({ stepId: tournamentRegistrationSubmissions.stepId })
            .from(tournamentRegistrationSubmissions)
            .where(
              and(
                eq(
                  tournamentRegistrationSubmissions.participationId,
                  context.registration.id
                ),
                eq(tournamentRegistrationSubmissions.status, "APPROVED")
              )
            );

          const approvedStepIds = new Set(
            approvals.map(
              (submission: (typeof approvals)[number]) => submission.stepId
            )
          );

          const allApproved = requiredSteps.every(
            (step: (typeof requiredSteps)[number]) =>
              approvedStepIds.has(step.id)
          );

          if (allApproved) {
            await (db as AppDB)
              .update(tournamentParticipations)
              .set({ status: "APPROVED" })
              .where(eq(tournamentParticipations.id, context.registration.id));
          }
        }
      }

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to review submission", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      if (error instanceof HTTPException) {
        throw error;
      }
      return c.json({ error: "Unable to review submission" }, 500);
    }
  }
);

registrationRoute.patch(
  "/:identifier/registrations/:registrationId/status",
  async (c) => {
    try {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
      ensureAdmin(session);

      const { identifier, registrationId } = c.req.param();
      if (!(identifier && registrationId)) {
        return c.json({ error: "Missing parameters" }, 400);
      }

      const body = registrationStatusUpdateSchema.parse(await c.req.json());

      const tournament = await getTournamentByIdentifier(identifier);
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      const registration = await loadRegistration(
        tournament.id,
        registrationId
      );
      if (!registration) {
        return c.json({ error: "Registration not found" }, 404);
      }

      await (db as AppDB)
        .update(tournamentParticipations)
        .set({ status: body.status })
        .where(eq(tournamentParticipations.id, registration.id));

      return c.json({ status: body.status });
    } catch (error) {
      console.error("Failed to update registration status", error);
      if (error instanceof z.ZodError) {
        return c.json({ error: error.flatten() }, 422);
      }
      return c.json({ error: "Unable to update registration status" }, 500);
    }
  }
);

export { registrationRoute };
