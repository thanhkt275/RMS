import crypto from "node:crypto";
import { auth } from "@rms-modern/auth";
import { prisma } from "../../lib/prisma";
import { type Context, Hono } from "hono";
import { z } from "zod";

import { tournamentResourceSchema } from "./schemas";
import { getTournamentByIdentifier } from "./utils";

const resourcesRoute = new Hono();

const tournamentResourceTypes = ["DOCUMENT", "LAW", "MANUAL", "TUTORIAL", "OTHER"] as const;

function ensureAdmin(
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null
): asserts session is NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
> & {
  user: { role: string };
} {
  if (!session) {
    throw new Error("Forbidden");
  }
  if ((session.user as { role?: string }).role !== "ADMIN") {
    throw new Error("Forbidden");
  }
}

resourcesRoute.get("/:tournamentId/resources", async (c: Context) => {
  try {
    const { tournamentId } = c.req.param() as { tournamentId: string };

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const resources = await prisma.tournamentResource.findMany({
      where: { tournamentId: tournament.id },
    });

    return c.json(resources);
  } catch (error) {
    console.error("Failed to fetch resources:", error);
    return c.json({ error: "Unable to fetch resources" }, 500);
  }
});

resourcesRoute.post("/:tournamentId/resources", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    try {
      ensureAdmin(session);
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { tournamentId } = c.req.param() as { tournamentId: string };
    const body = tournamentResourceSchema.parse(await c.req.json());

    const tournament = await getTournamentByIdentifier(tournamentId);
    if (!tournament) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const created = await prisma.tournamentResource.create({
      data: {
        id: crypto.randomUUID(),
        tournamentId: tournament.id,
        type: body.type,
        title: body.title,
        url: body.url,
        description: body.description,
      },
    });

    return c.json(created, 201);
  } catch (error) {
    console.error("Failed to create resource:", error);
    if (error instanceof z.ZodError) {
      return c.json({ error: error.flatten() }, 422);
    }
    return c.json({ error: "Unable to create resource" }, 500);
  }
});

resourcesRoute.patch(
  "/:tournamentId/resources/:resourceId",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, resourceId } = c.req.param() as {
        tournamentId: string;
        resourceId: string;
      };
      const body = tournamentResourceSchema.partial().parse(await c.req.json());

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) return c.json({ error: "Tournament not found" }, 404);

      const existing = await prisma.tournamentResource.findFirst({
        where: { id: resourceId, tournamentId: tournament.id },
      });
      if (!existing) return c.json({ error: "Resource not found" }, 404);

      const updated = await prisma.tournamentResource.update({
        where: { id: resourceId },
        data: {
          title: body.title ?? undefined,
          url: body.url ?? undefined,
          description: body.description ?? undefined,
          type: (body.type as any) ?? undefined,
        },
      });

      return c.json(updated);
    } catch (error) {
      console.error("Failed to update resource:", error);
      if (error instanceof z.ZodError) return c.json({ error: error.flatten() }, 422);
      return c.json({ error: "Unable to update resource" }, 500);
    }
  }
);

resourcesRoute.delete(
  "/:tournamentId/resources/:resourceId",
  async (c: Context) => {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      try {
        ensureAdmin(session);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { tournamentId, resourceId } = c.req.param() as {
        tournamentId: string;
        resourceId: string;
      };

      const tournament = await getTournamentByIdentifier(tournamentId);
      if (!tournament) {
        return c.json({ error: "Tournament not found" }, 404);
      }

      await prisma.tournamentResource.deleteMany({
        where: { tournamentId: tournament.id, id: resourceId },
      });

      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to delete resource:", error);
      return c.json({ error: "Unable to delete resource" }, 500);
    }
  }
);

resourcesRoute.get("/resource-types", (c: Context) => {
  try {
    // tournamentResourceTypes is an array of strings, not a Drizzle table
    return c.json(tournamentResourceTypes);
  } catch (error) {
    console.error("Failed to fetch resource types:", error);
    return c.json({ error: "Unable to fetch resource types" }, 500);
  }
});

export { resourcesRoute };
