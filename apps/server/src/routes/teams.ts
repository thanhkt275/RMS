import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "node:process";
import {
  auth,
  sendTeamMemberAddedEmail,
  sendTeamMemberWelcomeEmail,
} from "@rms-modern/auth";
import type { Context } from "hono";
import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { formatS3Path, isS3Enabled, uploadFileToS3 } from "../utils/s3";

const teamsRoute = new Hono();

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB for avatars
const MAX_COVER_SIZE = 15 * 1024 * 1024; // 15MB for cover images
const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

// Determine if we're using local storage or cloud storage
const USE_LOCAL_STORAGE = !isS3Enabled();
const UPLOAD_DIR = join(process.cwd(), "uploads");
const BASE_URL = env.BETTER_AUTH_URL || "http://localhost:3000";

const sanitizeFileName = (name: string): string => {
  const trimmed = name?.trim();
  if (!trimmed) {
    return "team-image";
  }
  return trimmed.replace(/[^\w.-]/g, "_");
};

/**
 * Save team image (avatar/cover) to local filesystem (development)
 */
async function saveTeamImageLocally(
  file: File,
  fileId: string
): Promise<{ url: string; path: string }> {
  // Ensure upload directory exists
  await mkdir(UPLOAD_DIR, { recursive: true });

  // Generate filename with original extension
  const extension = file.name.split(".").pop() || "";
  const fileName = extension ? `${fileId}.${extension}` : fileId;
  const filePath = join(UPLOAD_DIR, fileName);

  // Convert File to ArrayBuffer and write to disk
  const arrayBuffer = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));

  // Return URL and path
  return {
    url: `${BASE_URL}/api/files/serve/${fileName}`,
    path: filePath,
  };
}

type TeamImageUploadConfig = {
  file: File;
  fileId: string;
  storageFolder: "avatars" | "covers";
  safeOriginalName: string;
};

async function uploadTeamImage({
  file,
  fileId,
  storageFolder,
  safeOriginalName,
}: TeamImageUploadConfig): Promise<{ url: string; path: string }> {
  if (USE_LOCAL_STORAGE) {
    return saveTeamImageLocally(file, fileId);
  }

  const storageKey = `${storageFolder}/${fileId}-${safeOriginalName}`;
  const { url, key } = await uploadFileToS3({
    file,
    key: storageKey,
    acl: "public-read",
  });

  return {
    url,
    path: formatS3Path(key),
  };
}

type MatchRow = {
  id: string;
  tournamentId: string | null;
  tournamentName: string | null;
  scheduledAt: Date | null;
  status: string;
  round: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homePlaceholder: string | null;
  awayPlaceholder: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamName: string | null;
  homeTeamLogo: string | null;
  awayTeamName: string | null;
  awayTeamLogo: string | null;
};

function mapMatchForTeam(match: MatchRow, teamId: string) {
  const isHome = match.homeTeamId === teamId;
  const knownOpponentId = isHome ? match.awayTeamId : match.homeTeamId;
  const opponentPlaceholder = isHome
    ? match.awayPlaceholder
    : match.homePlaceholder;
  const scoreFor = isHome ? match.homeScore : match.awayScore;
  const scoreAgainst = isHome ? match.awayScore : match.homeScore;
  let outcome: "WIN" | "LOSS" | "DRAW" | "PENDING" = "PENDING";

  if (
    scoreFor !== null &&
    scoreFor !== undefined &&
    scoreAgainst !== null &&
    scoreAgainst !== undefined
  ) {
    if (scoreFor > scoreAgainst) {
      outcome = "WIN";
    } else if (scoreFor < scoreAgainst) {
      outcome = "LOSS";
    } else {
      outcome = "DRAW";
    }
  }

  return {
    id: match.id,
    tournamentId: match.tournamentId,
    tournamentName: match.tournamentName,
    scheduledAt: match.scheduledAt?.toISOString() ?? null,
    round: match.round,
    status: match.status,
    opponent: isHome
      ? {
          id: knownOpponentId,
          name: match.awayTeamName ?? opponentPlaceholder ?? "TBD",
          logo: match.awayTeamLogo,
        }
      : {
          id: knownOpponentId,
          name: match.homeTeamName ?? opponentPlaceholder ?? "TBD",
          logo: match.homeTeamLogo,
        },
    scoreFor,
    scoreAgainst,
    outcome,
  };
}

// GET /api/teams - List all teams
teamsRoute.get("/", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = session.user.id;

    const [teams, totalCount] = await Promise.all([
      prisma.organization.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          logo: true,
          coverImage: true,
          teamNumber: true,
          location: true,
          description: true,
          createdAt: true,
          members: {
            where: { userId },
            select: { role: true, createdAt: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.organization.count(),
    ]);

    return c.json({
      items: teams.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        logo: t.logo,
        coverImage: t.coverImage,
        teamNumber: t.teamNumber ?? null,
        location: t.location ?? null,
        description: t.description ?? null,
        createdAt: t.createdAt,
        isMember: t.members.length > 0,
        memberRole: t.members[0]?.role ?? null,
        memberJoinedAt: t.members[0]?.createdAt ?? null,
      })),
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / 20),
        hasMore: false,
      },
      appliedFilters: { statuses: [], search: "" },
      sort: { field: "createdAt", direction: "desc" },
      meta: { availableStatuses: ["DRAFT", "ACTIVE", "ARCHIVED"] },
    });
  } catch (error) {
    console.error("Error fetching teams:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/teams/mine - teams current user is member of
teamsRoute.get("/mine", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const items = await prisma.organizationMember.findMany({
      where: { userId: session.user.id },
      select: {
        role: true,
        createdAt: true,
        organization: {
          select: { id: true, name: true, slug: true, logo: true },
        },
      },
      orderBy: { organization: { name: "asc" } },
    });

    return c.json({
      items: items.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        logo: m.organization.logo,
        role: m.role,
        joinedAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching member teams:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/teams - Create a new team
teamsRoute.post("/", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const { name, description, location, teamNumber } = body;

    const teamId = crypto.randomUUID();
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;

    await prisma.$transaction(async (tx) => {
      await tx.organization.create({
        data: {
          id: teamId,
          name,
          slug,
          description,
          location,
          teamNumber,
          logo: body.logo,
          coverImage: body.coverImage,
          status: "ACTIVE",
          createdBy: session.user.id,
        },
      });

      await tx.organizationMember.create({
        data: {
          id: crypto.randomUUID(),
          organizationId: teamId,
          userId: session.user.id,
          role: "TEAM_MENTOR",
        },
      });
    });

    return c.json({
      id: teamId,
      name,
      slug,
      status: "ACTIVE",
      description,
      location,
      teamNumber,
    });
  } catch (error) {
    console.error("Error creating team:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/teams/:slug - Get team details
teamsRoute.get("/:slug", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const slug = c.req.param("slug");
    if (!slug) {
      return c.json({ error: "Team slug is required" }, 400);
    }

    const userId = session.user.id;

    const team = await prisma.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        logo: true,
        coverImage: true,
        teamNumber: true,
        location: true,
        description: true,
        createdAt: true,
        members: {
          where: { userId },
          select: { role: true, createdAt: true },
          take: 1,
        },
      },
    });

    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    const [members, tournamentHistory, matchesRaw, achievements] =
      await Promise.all([
        prisma.organizationMember.findMany({
          where: { organizationId: team.id },
          select: {
            id: true,
            userId: true,
            role: true,
            createdAt: true,
            user: { select: { name: true, email: true } },
          },
        }),
        prisma.tournamentParticipation.findMany({
          where: { organizationId: team.id },
          select: {
            id: true,
            placement: true,
            result: true,
            status: true,
            tournament: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                location: true,
                startDate: true,
                endDate: true,
                season: true,
                createdAt: true,
              },
            },
          },
          orderBy: [
            { tournament: { startDate: "desc" } },
            { tournament: { createdAt: "desc" } },
          ],
        }),
        prisma.tournamentMatch.findMany({
          where: {
            OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
          },
          select: {
            id: true,
            tournamentId: true,
            scheduledAt: true,
            status: true,
            round: true,
            homeTeamId: true,
            awayTeamId: true,
            homePlaceholder: true,
            awayPlaceholder: true,
            homeScore: true,
            awayScore: true,
            tournament: { select: { name: true } },
            homeTeam: { select: { name: true, logo: true } },
            awayTeam: { select: { name: true, logo: true } },
            createdAt: true,
          },
          orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
        }),
        prisma.tournamentAchievement.findMany({
          where: { organizationId: team.id },
          select: {
            id: true,
            title: true,
            description: true,
            position: true,
            awardedAt: true,
            tournamentId: true,
            tournament: { select: { name: true } },
            createdAt: true,
          },
          orderBy: [{ awardedAt: "desc" }, { createdAt: "desc" }],
        }),
      ]);

    const matches = matchesRaw.map<ReturnType<typeof mapMatchForTeam>>((m) =>
      mapMatchForTeam(
        {
          id: m.id,
          tournamentId: m.tournamentId ?? null,
          tournamentName: m.tournament?.name ?? null,
          scheduledAt: m.scheduledAt,
          status: m.status,
          round: m.round ?? null,
          homeTeamId: m.homeTeamId ?? null,
          awayTeamId: m.awayTeamId ?? null,
          homePlaceholder: m.homePlaceholder ?? null,
          awayPlaceholder: m.awayPlaceholder ?? null,
          homeScore: m.homeScore ?? null,
          awayScore: m.awayScore ?? null,
          homeTeamName: m.homeTeam?.name ?? null,
          homeTeamLogo: m.homeTeam?.logo ?? null,
          awayTeamName: m.awayTeam?.name ?? null,
          awayTeamLogo: m.awayTeam?.logo ?? null,
        },
        team.id
      )
    );

    return c.json({
      id: team.id,
      name: team.name,
      slug: team.slug,
      status: team.status,
      logo: team.logo,
      coverImage: team.coverImage,
      teamNumber: team.teamNumber,
      location: team.location,
      description: team.description,
      createdAt: team.createdAt,
      isMember: team.members.length > 0,
      memberRole: team.members[0]?.role,
      memberJoinedAt: team.members[0]?.createdAt ?? null,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.createdAt,
        name: m.user?.name ?? null,
        email: m.user?.email ?? null,
      })),
      tournaments: tournamentHistory.map((entry) => ({
        id: entry.tournament.id,
        name: entry.tournament.name,
        slug: entry.tournament.slug,
        status: entry.tournament.status,
        location: entry.tournament.location,
        season: entry.tournament.season,
        startDate: entry.tournament.startDate?.toISOString() ?? null,
        endDate: entry.tournament.endDate?.toISOString() ?? null,
        placement: entry.placement,
        result: entry.result,
        registrationId: entry.id,
        registrationStatus: entry.status,
      })),
      matches,
      achievements: achievements.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        position: a.position,
        awardedAt: a.awardedAt?.toISOString() ?? null,
        tournamentId: a.tournamentId ?? null,
        tournamentName: a.tournament?.name ?? null,
      })),
      invitations: [],
    });
  } catch (error) {
    console.error("Error fetching team:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PATCH /api/teams/:slug - Update team
teamsRoute.patch("/:slug", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const slug = c.req.param("slug");
    if (!slug) {
      return c.json({ error: "Team slug is required" }, 400);
    }

    const userId = session.user.id;
    const body = await c.req.json();

    const team = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: team.id, userId },
      select: { role: true },
    });

    if (!membership || membership.role !== "TEAM_MENTOR") {
      return c.json({ error: "Only team mentors can edit team settings" }, 403);
    }

    await prisma.organization.update({
      where: { slug },
      data: {
        name: body.name,
        description: body.description,
        location: body.location,
        teamNumber: body.teamNumber,
        status: body.status,
        logo: body.logo,
        coverImage: body.coverImage,
        updatedAt: new Date(),
      },
    });

    const updated = await prisma.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        logo: true,
        coverImage: true,
        teamNumber: true,
        location: true,
        description: true,
        createdAt: true,
      },
    });

    if (!updated) {
      return c.json({ error: "Team not found after update" }, 404);
    }

    return c.json(updated);
  } catch (error) {
    console.error("Error updating team:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/teams/:slug/invite/bulk - Invite multiple members to team
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Legacy invite flow pending refactor.
teamsRoute.post("/:slug/invite/bulk", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const slug = c.req.param("slug");
    if (!slug) {
      return c.json({ error: "Team slug is required" }, 400);
    }

    type MemberPayload = { email: string; fullName?: string };
    const body = (await c.req.json()) as { members: MemberPayload[] };
    const members: MemberPayload[] = body.members ?? [];

    const team = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });

    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: team.id, userId: session.user.id },
      select: { role: true },
    });

    if (!membership) {
      return c.json({ error: "You are not a member of this team" }, 403);
    }

    const canInvite =
      membership.role === "TEAM_MENTOR" || membership.role === "TEAM_LEADER";
    if (!canInvite) {
      return c.json({ error: "Only team mentors and leaders can invite members" }, 403);
    }

    type InviteResult = { email: string; success: boolean; message: string };
    const results: InviteResult[] = [];

    for (const member of members) {
      const emailInput = member.email ?? "";
      const normalizedEmail: string = (emailInput ?? "").trim();
      let fullName = member.fullName?.trim();

      if (!normalizedEmail) {
        results.push({ email: emailInput || "unknown", success: false, message: "Email is required" });
        continue;
      }

      if (!fullName) {
        const localPart = normalizedEmail.split("@")[0] ?? normalizedEmail;
        fullName = localPart
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (l: string) => l.toUpperCase());
      }

      try {
        const emailLower = normalizedEmail.toLowerCase();

        const existingUser = await prisma.user.findUnique({
          where: { email: emailLower },
          select: { id: true, name: true, email: true },
        });

        if (existingUser) {
          const alreadyMember = await prisma.organizationMember.findFirst({
            where: { organizationId: team.id, userId: existingUser.id },
            select: { id: true },
          });

          if (alreadyMember) {
            results.push({ email: emailLower, success: false, message: "Already a member" });
            continue;
          }

          await prisma.organizationMember.create({
            data: {
              id: crypto.randomUUID(),
              organizationId: team.id,
              userId: existingUser.id,
              role: "TEAM_MEMBER",
            },
          });

          sendTeamMemberAddedEmail({
            email: existingUser.email,
            userName: existingUser.name,
            teamName: team.name,
            inviterName: session.user.name,
          }).catch(console.error);

          results.push({ email: emailLower, success: true, message: "Added to team" });
        } else {
          const temporaryPassword = crypto.randomBytes(8).toString("hex");

          const signUpResult = await auth.api.signUpEmail({
            body: { name: fullName.trim(), email: emailLower, password: temporaryPassword },
          });

          if (!signUpResult) {
            results.push({ email: emailLower, success: false, message: "Failed to create account" });
            continue;
          }

          const newUser = await prisma.user.findUnique({
            where: { email: emailLower },
            select: { id: true },
          });

          if (!newUser) {
            results.push({ email: emailLower, success: false, message: "Failed to retrieve user" });
            continue;
          }

          await prisma.organizationMember.create({
            data: {
              id: crypto.randomUUID(),
              organizationId: team.id,
              userId: newUser.id,
              role: "TEAM_MEMBER",
            },
          });

          sendTeamMemberWelcomeEmail({
            email: emailLower,
            userName: fullName.trim(),
            teamName: team.name,
            inviterName: session.user.name,
            temporaryPassword,
          }).catch(console.error);

          results.push({ email: emailLower, success: true, message: "Account created and added to team" });
        }
      } catch (error) {
        console.error(`Error processing member ${normalizedEmail}:`, error);
        results.push({ email: normalizedEmail.toLowerCase(), success: false, message: "Internal error" });
      }
    }

    return c.json({ results });
  } catch (error) {
    console.error("Bulk invite error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/teams/:slug/invite - Invite member to team
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Legacy invite flow pending refactor.
teamsRoute.post("/:slug/invite", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const slug = c.req.param("slug");
    if (!slug) {
      return c.json({ error: "Team slug is required" }, 400);
    }

    const body = (await c.req.json()) as { email: string; fullName?: string };
    const emailInput = body.email ?? "";
    const normalizedEmail: string = (emailInput ?? "").trim();
    let fullName = body.fullName?.trim();

    if (!normalizedEmail) {
      return c.json({ error: "Email is required" }, 400);
    }

    if (!fullName) {
      const localPart = normalizedEmail.split("@")[0] ?? normalizedEmail;
      fullName = localPart
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (l: string) => l.toUpperCase());
    }

    const team = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });

    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: team.id, userId: session.user.id },
      select: { role: true },
    });

    if (!membership) {
      return c.json({ error: "You are not a member of this team" }, 403);
    }

    const canInvite =
      membership.role === "TEAM_MENTOR" || membership.role === "TEAM_LEADER";
    if (!canInvite) {
      return c.json({ error: "Only team mentors and leaders can invite members" }, 403);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail.toLowerCase() },
      select: { id: true, name: true, email: true },
    });

    if (existingUser) {
      const alreadyMember = await prisma.organizationMember.findFirst({
        where: { organizationId: team.id, userId: existingUser.id },
        select: { id: true },
      });

      if (alreadyMember) {
        return c.json({ error: "This user is already a member of the team" }, 409);
      }

      await prisma.organizationMember.create({
        data: {
          id: crypto.randomUUID(),
          organizationId: team.id,
          userId: existingUser.id,
          role: "TEAM_MEMBER",
        },
      });

      await sendTeamMemberAddedEmail({
        email: existingUser.email,
        userName: existingUser.name,
        teamName: team.name,
        inviterName: session.user.name,
      });

      return c.json({ message: `${existingUser.name} has been added to the team`, userExists: true });
    }

    const temporaryPassword = crypto.randomBytes(8).toString("hex");

      const signUpResult = await auth.api.signUpEmail({
        body: { name: fullName.trim(), email: normalizedEmail.toLowerCase(), password: temporaryPassword },
    });

    if (!signUpResult) {
      return c.json({ error: "Failed to create user account" }, 500);
    }

      const newUser = await prisma.user.findUnique({
        where: { email: normalizedEmail.toLowerCase() },
      select: { id: true },
    });

    if (!newUser) {
      return c.json({ error: "Failed to retrieve new user" }, 500);
    }

      await prisma.organizationMember.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: team.id,
        userId: newUser.id,
        role: "TEAM_MEMBER",
      },
    });

      await sendTeamMemberWelcomeEmail({
        email: normalizedEmail.toLowerCase(),
      userName: fullName.trim(),
      teamName: team.name,
      inviterName: session.user.name,
      temporaryPassword,
    });

    return c.json({ message: `Account created for ${fullName} and added to team`, userExists: false }, 201);
  } catch (error) {
    console.error("Invite error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/teams/:slug/avatar - Upload team avatar
teamsRoute.post("/:slug/avatar", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = session.user.id;
    const slug = c.req.param("slug");

    const team = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    const member = await prisma.organizationMember.findFirst({
      where: { organizationId: team.id, userId, role: "TEAM_MENTOR" },
      select: { id: true },
    });

    if (!member) {
      return c.json({ error: "Only team mentors can upload avatars" }, 403);
    }

    const body = await c.req.parseBody();
    const file = (body as any).file as File | undefined;

    if (!(file instanceof File)) {
      return c.json({ error: "A file must be provided" }, 400);
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return c.json({ error: `File size exceeds maximum allowed size of ${MAX_AVATAR_SIZE / 1024 / 1024}MB` }, 400);
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      return c.json({ error: "File type not supported. Please upload an image (JPEG, PNG, GIF, or WebP)" }, 400);
    }

    const fileId = crypto.randomUUID();
    const safeOriginalName = sanitizeFileName(file.name);
    const storageData = await uploadTeamImage({ file, fileId, storageFolder: "avatars", safeOriginalName });

    await prisma.organization.update({
      where: { id: team.id },
      data: { logo: storageData.url, updatedAt: new Date(), updatedBy: userId },
    });

    return c.json({ id: fileId, url: storageData.url, fileName: file.name, size: file.size, mimeType: file.type });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/teams/:slug/cover - Upload team cover image
teamsRoute.post("/:slug/cover", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = session.user.id;
    const slug = c.req.param("slug");

    const team = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    const member = await prisma.organizationMember.findFirst({
      where: { organizationId: team.id, userId, role: "TEAM_MENTOR" },
      select: { id: true },
    });

    if (!member) {
      return c.json({ error: "Only team mentors can upload cover images" }, 403);
    }

    const body = await c.req.parseBody();
    const file = (body as any).file as File | undefined;

    if (!(file instanceof File)) {
      return c.json({ error: "A file must be provided" }, 400);
    }

    if (file.size > MAX_COVER_SIZE) {
      return c.json({ error: `File size exceeds maximum allowed size of ${MAX_COVER_SIZE / 1024 / 1024}MB` }, 400);
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      return c.json({ error: "Invalid image type. Use JPEG, PNG, GIF, or WebP files." }, 400);
    }

    const fileId = crypto.randomUUID();
    const safeOriginalName = sanitizeFileName(file.name);

    const storageData = await uploadTeamImage({ file, fileId, storageFolder: "covers", safeOriginalName });

    await prisma.organization.update({
      where: { id: team.id },
      data: { coverImage: storageData.url, updatedAt: new Date(), updatedBy: userId },
    });

    return c.json({ id: fileId, url: storageData.url, fileName: file.name, size: file.size, mimeType: file.type });
  } catch (error) {
    console.error("Cover upload error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PATCH /api/teams/:slug/members/:memberId/role - Update member role
teamsRoute.patch("/:slug/members/:memberId/role", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = session.user.id;
    const { slug, memberId } = c.req.param();
    const { role: newRole } = await c.req.json();

    const validRoles = ["TEAM_MEMBER", "TEAM_LEADER", "TEAM_MENTOR"] as const;
    if (!validRoles.includes(newRole)) {
      return c.json({ error: "Invalid role" }, 400);
    }

    const team = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    const currentMembership = await prisma.organizationMember.findFirst({
      where: { organizationId: team.id, userId },
      select: { role: true },
    });

    if (!currentMembership) {
      return c.json({ error: "You are not a member of this team" }, 403);
    }

    const currentUserRole = currentMembership.role;

    if (currentUserRole !== "TEAM_MENTOR" && currentUserRole !== "TEAM_LEADER") {
      return c.json({ error: "Insufficient permissions" }, 403);
    }

    if (currentUserRole === "TEAM_LEADER" && newRole !== "TEAM_MEMBER") {
      return c.json({ error: "Leaders can only change roles to Member" }, 403);
    }

    if (memberId === userId) {
      return c.json({ error: "Cannot change your own role" }, 403);
    }

    const targetMembership = await prisma.organizationMember.findFirst({
      where: { organizationId: team.id, userId: memberId as string },
      select: { id: true },
    });

    if (!targetMembership) {
      return c.json({ error: "Member not found in this team" }, 404);
    }

    await prisma.organizationMember.update({
      where: { id: targetMembership.id },
      data: { role: newRole },
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Update member role error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// DELETE /api/teams/:slug/members/:memberId - Remove member from team
teamsRoute.delete("/:slug/members/:memberId", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = session.user.id;
    const { slug, memberId } = c.req.param();

    if (memberId === userId) {
      return c.json({ error: "Cannot remove yourself from the team" }, 403);
    }

    const team = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!team) {
      return c.json({ error: "Team not found" }, 404);
    }

    const currentMembership = await prisma.organizationMember.findFirst({
      where: { organizationId: team.id, userId },
      select: { role: true },
    });

    if (!currentMembership) {
      return c.json({ error: "You are not a member of this team" }, 403);
    }

    if (currentMembership.role !== "TEAM_MENTOR") {
      return c.json({ error: "Only mentors can remove team members" }, 403);
    }

    if (memberId === userId) {
      return c.json({ error: "Cannot remove yourself from the team" }, 403);
    }

    const targetMembership = await prisma.organizationMember.findFirst({
      where: { organizationId: team.id, userId: memberId as string },
      select: { id: true },
    });

    if (!targetMembership) {
      return c.json({ error: "Member not found in this team" }, 404);
    }

    await prisma.organizationMember.delete({ where: { id: targetMembership.id } });

    return c.json({ success: true });
  } catch (error) {
    console.error("Remove member error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default teamsRoute;

