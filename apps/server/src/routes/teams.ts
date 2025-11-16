import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "node:process";
import {
  auth,
  sendTeamMemberAddedEmail,
  sendTeamMemberWelcomeEmail,
} from "@rms-modern/auth";
import { db } from "@rms-modern/db";
import { user } from "@rms-modern/db/schema/auth";
import {
  organizationMembers,
  organizations,
  tournamentAchievements,
  tournamentMatches,
  tournamentParticipations,
  tournaments,
} from "@rms-modern/db/schema/organization";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Context } from "hono";
import { Hono } from "hono";
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

const homeTeamAlias = alias(organizations, "home_team");
const awayTeamAlias = alias(organizations, "away_team");

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

    const teams = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        logo: organizations.logo,
        coverImage: organizations.coverImage,
        teamNumber: organizations.teamNumber,
        location: organizations.location,
        description: organizations.description,
        createdAt: organizations.createdAt,
        memberRole: organizationMembers.role,
        memberJoinedAt: organizationMembers.createdAt,
      })
      .from(organizations)
      .leftJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, organizations.id),
          eq(organizationMembers.userId, userId)
        )
      )
      .limit(20);

    const totalCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(organizations);
    const totalCount = totalCountResult[0]?.count ?? 0;

    return c.json({
      items: teams.map((team: (typeof teams)[0]) => ({
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
        isMember: !!team.memberRole,
        memberRole: team.memberRole,
        memberJoinedAt: team.memberJoinedAt,
      })),
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / 20),
        hasMore: false,
      },
      appliedFilters: {
        statuses: [],
        search: "",
      },
      sort: {
        field: "createdAt",
        direction: "desc",
      },
      meta: {
        availableStatuses: ["DRAFT", "ACTIVE", "ARCHIVED"],
      },
    });
  } catch (error) {
    console.error("Error fetching teams:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

teamsRoute.get("/mine", async (c: Context) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const memberships = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        logo: organizations.logo,
        memberRole: organizationMembers.role,
        joinedAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(
        organizations,
        eq(organizationMembers.organizationId, organizations.id)
      )
      .where(eq(organizationMembers.userId, session.user.id))
      .orderBy(asc(organizations.name));

    return c.json({
      items: memberships.map((membership) => ({
        id: membership.id,
        name: membership.name,
        slug: membership.slug,
        logo: membership.logo,
        role: membership.memberRole,
        joinedAt: membership.joinedAt,
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

    // Create team directly in database
    const teamId = crypto.randomUUID();
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;

    await db.insert(organizations).values({
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
    });

    // Add creator as a member
    await db.insert(organizationMembers).values({
      id: crypto.randomUUID(),
      organizationId: teamId,
      userId: session.user.id,
      role: "TEAM_MENTOR",
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

    const team = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        logo: organizations.logo,
        coverImage: organizations.coverImage,
        teamNumber: organizations.teamNumber,
        location: organizations.location,
        description: organizations.description,
        createdAt: organizations.createdAt,
        memberRole: organizationMembers.role,
        memberJoinedAt: organizationMembers.createdAt,
      })
      .from(organizations)
      .leftJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, organizations.id),
          eq(organizationMembers.userId, userId)
        )
      )
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!team.length) {
      return c.json({ error: "Team not found" }, 404);
    }

    const teamData = team[0]!;
    if (!teamData) {
      // Explicit check for teamData
      return c.json({ error: "Team data not found" }, 404);
    }

    // Get team members
    const members = await db
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        joinedAt: organizationMembers.createdAt,
        name: user.name,
        email: user.email,
      })
      .from(organizationMembers)
      .leftJoin(user, eq(organizationMembers.userId, user.id))
      .where(eq(organizationMembers.organizationId, teamData.id));

    const tournamentHistory = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        slug: tournaments.slug,
        status: tournaments.status,
        location: tournaments.location,
        startDate: tournaments.startDate,
        endDate: tournaments.endDate,
        season: tournaments.season,
        placement: tournamentParticipations.placement,
        result: tournamentParticipations.result,
      })
      .from(tournamentParticipations)
      .innerJoin(
        tournaments,
        eq(tournamentParticipations.tournamentId, tournaments.id)
      )
      .where(eq(tournamentParticipations.organizationId, teamData.id))
      .orderBy(desc(tournaments.startDate), desc(tournaments.createdAt));

    const matchesRaw: MatchRow[] = await db
      .select({
        id: tournamentMatches.id,
        tournamentId: tournamentMatches.tournamentId,
        tournamentName: tournaments.name,
        scheduledAt: tournamentMatches.scheduledAt,
        status: tournamentMatches.status,
        round: tournamentMatches.round,
        homeTeamId: tournamentMatches.homeTeamId,
        awayTeamId: tournamentMatches.awayTeamId,
        homePlaceholder: tournamentMatches.homePlaceholder,
        awayPlaceholder: tournamentMatches.awayPlaceholder,
        homeScore: tournamentMatches.homeScore,
        awayScore: tournamentMatches.awayScore,
        homeTeamName: homeTeamAlias.name,
        homeTeamLogo: homeTeamAlias.logo,
        awayTeamName: awayTeamAlias.name,
        awayTeamLogo: awayTeamAlias.logo,
      })
      .from(tournamentMatches)
      .leftJoin(tournaments, eq(tournamentMatches.tournamentId, tournaments.id))
      .leftJoin(
        homeTeamAlias,
        eq(tournamentMatches.homeTeamId, homeTeamAlias.id)
      )
      .leftJoin(
        awayTeamAlias,
        eq(tournamentMatches.awayTeamId, awayTeamAlias.id)
      )
      .where(
        or(
          eq(tournamentMatches.homeTeamId, teamData.id),
          eq(tournamentMatches.awayTeamId, teamData.id)
        )
      )
      .orderBy(
        desc(tournamentMatches.scheduledAt),
        desc(tournamentMatches.createdAt)
      );

    const achievements = await db
      .select({
        id: tournamentAchievements.id,
        title: tournamentAchievements.title,
        description: tournamentAchievements.description,
        position: tournamentAchievements.position,
        awardedAt: tournamentAchievements.awardedAt,
        tournamentId: tournamentAchievements.tournamentId,
        tournamentName: tournaments.name,
      })
      .from(tournamentAchievements)
      .leftJoin(
        tournaments,
        eq(tournamentAchievements.tournamentId, tournaments.id)
      )
      .where(eq(tournamentAchievements.organizationId, teamData.id))
      .orderBy(
        desc(tournamentAchievements.awardedAt),
        desc(tournamentAchievements.createdAt)
      );

    const matches = matchesRaw.map((match) =>
      mapMatchForTeam(match, teamData.id)
    );

    return c.json({
      id: teamData.id,
      name: teamData.name,
      slug: teamData.slug,
      status: teamData.status,
      logo: teamData.logo,
      coverImage: teamData.coverImage,
      teamNumber: teamData.teamNumber,
      location: teamData.location,
      description: teamData.description,
      createdAt: teamData.createdAt,
      isMember: !!teamData.memberRole,
      memberRole: teamData.memberRole,
      memberJoinedAt: teamData.memberJoinedAt,
      members,
      tournaments: tournamentHistory.map((entry) => ({
        id: entry.id,
        name: entry.name,
        slug: entry.slug,
        status: entry.status,
        location: entry.location,
        season: entry.season,
        startDate: entry.startDate?.toISOString() ?? null,
        endDate: entry.endDate?.toISOString() ?? null,
        placement: entry.placement,
        result: entry.result,
      })),
      matches,
      achievements: achievements.map((achievement) => ({
        id: achievement.id,
        title: achievement.title,
        description: achievement.description,
        position: achievement.position,
        awardedAt: achievement.awardedAt?.toISOString() ?? null,
        tournamentId: achievement.tournamentId,
        tournamentName: achievement.tournamentName,
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

    // First get the team to check membership
    const teamResult = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!teamResult.length) {
      return c.json({ error: "Team not found" }, 404);
    }

    const teamId = teamResult[0]!.id;

    // Check if user is a mentor
    const membership = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, teamId),
          eq(organizationMembers.userId, userId)
        )
      )
      .limit(1);

    if (!membership.length || membership[0]?.role !== "TEAM_MENTOR") {
      return c.json({ error: "Only team mentors can edit team settings" }, 403);
    }

    // Update the team
    await db
      .update(organizations)
      .set({
        name: body.name,
        description: body.description,
        location: body.location,
        teamNumber: body.teamNumber,
        status: body.status,
        logo: body.logo,
        coverImage: body.coverImage,
        updatedAt: new Date(),
      })
      .where(eq(organizations.slug, slug));

    // Fetch updated team
    const updatedTeam = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        logo: organizations.logo,
        coverImage: organizations.coverImage,
        teamNumber: organizations.teamNumber,
        location: organizations.location,
        description: organizations.description,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!updatedTeam.length) {
      return c.json({ error: "Team not found after update" }, 404);
    }

    return c.json(updatedTeam[0]);
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

    const body = await c.req.json();
    const { members } = body;

    const teamResult = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!teamResult.length) {
      return c.json({ error: "Team not found" }, 404);
    }

    const team = teamResult[0]!;
    if (!team) {
      // Explicit check for team
      return c.json({ error: "Team data not found" }, 404);
    }

    // Check if user is a team mentor or leader
    const memberships = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, team.id),
          eq(organizationMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (!memberships.length) {
      return c.json({ error: "You are not a member of this team" }, 403);
    }

    const memberRole = memberships[0]?.role;
    if (memberRole !== "TEAM_MENTOR" && memberRole !== "TEAM_LEADER") {
      return c.json(
        { error: "Only team mentors and leaders can invite members" },
        403
      );
    }

    type InviteResult = {
      email: string;
      success: boolean;
      message: string;
    };

    const results: InviteResult[] = [];

    // Process each member
    for (const member of members) {
      const { email } = member;
      let { fullName } = member;

      if (!email?.trim()) {
        results.push({
          email: email || "unknown",
          success: false,
          message: "Email is required",
        });
        continue;
      }

      if (!fullName?.trim()) {
        fullName = email
          .split("@")[0]
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (l: string) => l.toUpperCase());
      }

      try {
        // Check if user exists
        const existingUsers = await db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
          })
          .from(user)
          .where(eq(user.email, email.toLowerCase()))
          .limit(1);

        if (existingUsers.length > 0) {
          // User exists - add to team
          const existingUser = existingUsers[0];
          if (!existingUser) {
            // Explicit check for existingUser
            results.push({
              email: email.toLowerCase(),
              success: false,
              message: "Failed to retrieve existing user",
            });
            continue;
          }

          // Check if already a member
          const existingMemberships = await db
            .select()
            .from(organizationMembers)
            .where(
              and(
                eq(organizationMembers.organizationId, team!.id),
                eq(organizationMembers.userId, existingUser.id)
              )
            )
            .limit(1);

          if (existingMemberships.length > 0) {
            results.push({
              email: email.toLowerCase(),
              success: false,
              message: "Already a member",
            });
            continue;
          }

          // Add user to team
          await db.insert(organizationMembers).values({
            id: crypto.randomUUID(),
            organizationId: team.id,
            userId: existingUser.id,
            role: "TEAM_MEMBER",
          });

          // Send notification email (don't await to speed up)
          sendTeamMemberAddedEmail({
            email: existingUser.email,
            userName: existingUser.name,
            teamName: team.name,
            inviterName: session.user.name,
          }).catch(console.error);

          results.push({
            email: email.toLowerCase(),
            success: true,
            message: "Added to team",
          });
        } else {
          // User doesn't exist - create account
          const temporaryPassword = crypto.randomBytes(8).toString("hex");

          // Create user account
          const signUpResult = await auth.api.signUpEmail({
            body: {
              name: fullName.trim(),
              email: email.toLowerCase().trim(),
              password: temporaryPassword,
            },
          });

          if (!signUpResult) {
            results.push({
              email: email.toLowerCase(),
              success: false,
              message: "Failed to create account",
            });
            continue;
          }

          // Get newly created user
          const newUsers = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, email.toLowerCase()))
            .limit(1);

          if (!newUsers.length) {
            results.push({
              email: email.toLowerCase(),
              success: false,
              message: "Failed to retrieve user",
            });
            continue;
          }

          const newUser = newUsers[0];
          if (!newUser) {
            results.push({
              email: email.toLowerCase(),
              success: false,
              message: "Failed to retrieve user",
            });
            continue;
          }

          // Add to team
          await db.insert(organizationMembers).values({
            id: crypto.randomUUID(),
            organizationId: team!.id,
            userId: newUser.id,
            role: "TEAM_MEMBER",
          });

          // Send welcome email (don't await to speed up)
          sendTeamMemberWelcomeEmail({
            email: email.toLowerCase(),
            userName: fullName.trim(),
            teamName: team.name,
            inviterName: session.user.name,
            temporaryPassword,
          }).catch(console.error);

          results.push({
            email: email.toLowerCase(),
            success: true,
            message: "Account created and added to team",
          });
        }
      } catch (error) {
        console.error(`Error processing member ${email}:`, error);
        results.push({
          email: email.toLowerCase(),
          success: false,
          message: "Internal error",
        });
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

    const body = await c.req.json();
    const { email } = body;
    let { fullName } = body;

    // Validate required fields
    if (!email?.trim()) {
      return c.json({ error: "Email is required" }, 400);
    }

    if (!fullName?.trim()) {
      fullName = email
        .split("@")[0]
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (l: string) => l.toUpperCase());
    }

    // Get team
    const teamResult = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!teamResult.length) {
      return c.json({ error: "Team not found" }, 404);
    }

    const team = teamResult[0]!;

    // Check if user is a team mentor or leader
    const memberships = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, team!.id),
          eq(organizationMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (!memberships.length) {
      return c.json({ error: "You are not a member of this team" }, 403);
    }

    const memberRole = memberships[0]?.role;
    if (memberRole !== "TEAM_MENTOR" && memberRole !== "TEAM_LEADER") {
      return c.json(
        { error: "Only team mentors and leaders can invite members" },
        403
      );
    }

    // Check if user already exists
    const existingUsers = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    if (existingUsers.length > 0) {
      // Scenario A: User exists
      const existingUser = existingUsers[0];
      if (!existingUser) {
        return c.json({ error: "Failed to retrieve existing user" }, 500);
      }

      // Check if user is already a member
      const existingMemberships = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, team.id),
            eq(organizationMembers.userId, existingUser.id)
          )
        )
        .limit(1);

      if (existingMemberships.length > 0) {
        return c.json(
          { error: "This user is already a member of the team" },
          409
        );
      }

      // Add user to team
      await db.insert(organizationMembers).values({
        id: crypto.randomUUID(),
        organizationId: team.id,
        userId: existingUser.id,
        role: "TEAM_MEMBER",
      });

      // Send notification email
      await sendTeamMemberAddedEmail({
        email: existingUser.email,
        userName: existingUser.name,
        teamName: team.name,
        inviterName: session.user.name,
      });

      return c.json({
        message: `${existingUser.name} has been added to the team`,
        userExists: true,
      });
    }

    // Scenario B: User doesn't exist - auto-provision
    const temporaryPassword = crypto.randomBytes(8).toString("hex");

    // Create user account using better-auth
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: fullName.trim(),
        email: email.toLowerCase().trim(),
        password: temporaryPassword,
      },
    });

    if (!signUpResult) {
      return c.json({ error: "Failed to create user account" }, 500);
    }

    // Get the newly created user
    const newUsers = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    if (!newUsers.length) {
      return c.json({ error: "Failed to retrieve new user" }, 500);
    }

    const newUser = newUsers[0];
    if (!newUser) {
      return c.json({ error: "Failed to retrieve new user" }, 500);
    }

    // Add user to team
    await db.insert(organizationMembers).values({
                id: crypto.randomUUID(),
                organizationId: team!.id,
                userId: newUser.id,
                role: "TEAM_MEMBER",
              });
    // Send welcome email with credentials
    await sendTeamMemberWelcomeEmail({
      email: email.toLowerCase(),
      userName: fullName.trim(),
      teamName: team.name,
      inviterName: session.user.name,
      temporaryPassword,
    });

    return c.json(
      {
        message: `Account created for ${fullName} and added to team`,
        userExists: false,
      },
      201
    );
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

    // Get team and check membership
    const teamResult = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (teamResult.length === 0) {
      return c.json({ error: "Team not found" }, 404);
    }

    const team = teamResult[0];

    // Check if user is a mentor of this team
    const memberResult = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, team.id),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.role, "TEAM_MENTOR")
        )
      )
      .limit(1);

    if (memberResult.length === 0) {
      return c.json({ error: "Only team mentors can upload avatars" }, 403);
    }

    // Parse the uploaded file
    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      return c.json({ error: "A file must be provided" }, 400);
    }

    // Validate file size
    if (file.size > MAX_AVATAR_SIZE) {
      return c.json(
        {
          error: `File size exceeds maximum allowed size of ${MAX_AVATAR_SIZE / 1024 / 1024}MB`,
        },
        400
      );
    }

    // Validate file type
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      return c.json(
        {
          error:
            "File type not supported. Please upload an image (JPEG, PNG, GIF, or WebP)",
        },
        400
      );
    }

    // Generate unique file ID & key
    const fileId = crypto.randomUUID();
    const safeOriginalName = sanitizeFileName(file.name);
    const storageData = await uploadTeamImage({
      file,
      fileId,
      storageFolder: "avatars",
      safeOriginalName,
    });

    // Update team logo in database
    await db
      .update(organizations)
      .set({
        logo: storageData.url,
        updatedAt: sql`(unixepoch('now'))`,
        updatedBy: userId,
      })
      .where(eq(organizations.id, team.id));

    return c.json({
      id: fileId,
      url: storageData.url,
      fileName: file.name,
      size: file.size,
      mimeType: file.type,
    });
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

    const teamResult = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!teamResult.length) {
      return c.json({ error: "Team not found" }, 404);
    }

    const teamData = teamResult[0]!;

    const memberResult = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, team.id),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.role, "TEAM_MENTOR")
        )
      )
      .limit(1);

    if (!memberResult.length) {
      return c.json(
        { error: "Only team mentors can upload cover images" },
        403
      );
    }

    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      return c.json({ error: "A file must be provided" }, 400);
    }

    if (file.size > MAX_COVER_SIZE) {
      return c.json(
        {
          error: `File size exceeds maximum allowed size of ${MAX_COVER_SIZE / 1024 / 1024}MB`,
        },
        400
      );
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      return c.json(
        { error: "Invalid image type. Use JPEG, PNG, GIF, or WebP files." },
        400
      );
    }

    const fileId = crypto.randomUUID();
    const safeOriginalName = sanitizeFileName(file.name);

    const storageData = await uploadTeamImage({
      file,
      fileId,
      storageFolder: "covers",
      safeOriginalName,
    });

    await db
      .update(organizations)
      .set({
        coverImage: storageData.url,
        updatedAt: sql`(unixepoch('now'))`,
        updatedBy: userId,
      })
      .where(eq(organizations.id, team.id));

    return c.json({
      id: fileId,
      url: storageData.url,
      fileName: file.name,
      size: file.size,
      mimeType: file.type,
    });
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

    // Validate role
    const validRoles = ["TEAM_MEMBER", "TEAM_LEADER", "TEAM_MENTOR"];
    if (!validRoles.includes(newRole)) {
      return c.json({ error: "Invalid role" }, 400);
    }

    // Get team
    const team = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug as string))
      .limit(1);

    if (!team.length) {
      return c.json({ error: "Team not found" }, 404);
    }

    // Check if current user is a member of the team
    const currentUserMembership = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, team[0]!.id),
          eq(organizationMembers.userId, userId)
        )
      )
      .limit(1);

    if (!currentUserMembership.length) {
      return c.json({ error: "You are not a member of this team" }, 403);
    }

    const currentUserRole = currentUserMembership[0]!.role;

    // Check permissions
    if (
      currentUserRole !== "TEAM_MENTOR" &&
      currentUserRole !== "TEAM_LEADER"
    ) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }

    // Leaders can only demote to member
    if (currentUserRole === "TEAM_LEADER" && newRole !== "TEAM_MEMBER") {
      return c.json({ error: "Leaders can only change roles to Member" }, 403);
    }

    // Cannot change your own role
    if (memberId === userId) {
      return c.json({ error: "Cannot change your own role" }, 403);
    }

    // Check if target member exists in the team
    const targetMembership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, team[0]!.id),
          eq(organizationMembers.userId, memberId as string)
        )
      )
      .limit(1);

    if (!targetMembership.length) {
      return c.json({ error: "Member not found in this team" }, 404);
    }

    // Update member role
    await db
      .update(organizationMembers)
      .set({
        role: newRole,
      })
      .where(
        and(
          eq(organizationMembers.organizationId, team[0]!.id),
          eq(organizationMembers.userId, memberId as string)
        )
      );

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

    // Cannot remove yourself
    if (memberId === userId) {
      return c.json({ error: "Cannot remove yourself from the team" }, 403);
    }

    // Get team
    const team = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug as string))
      .limit(1);

    if (!team.length) {
      return c.json({ error: "Team not found" }, 404);
    }

    const currentUserMembership = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, team[0]!.id),
          eq(organizationMembers.userId, userId)
        )
      )
      .limit(1);

    if (!currentUserMembership.length) {
      return c.json({ error: "You are not a member of this team" }, 403);
    }

    const currentUserRole = currentUserMembership[0]!.role;

    // Only mentors can remove members
    if (currentUserRole !== "TEAM_MENTOR") {
      return c.json({ error: "Only mentors can remove team members" }, 403);
    }

    // Cannot remove yourself
    if (memberId === userId) {
      return c.json({ error: "Cannot remove yourself from the team" }, 403);
    }

    // Check if target member exists in the team
    const targetMembership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, team[0]!.id),
          eq(organizationMembers.userId, memberId as string)
        )
      )
      .limit(1);

    if (!targetMembership.length) {
      return c.json({ error: "Member not found in this team" }, 404);
    }

    // Remove member from team
    await db
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, team[0]!.id),
          eq(organizationMembers.userId, memberId as string)
        )
      );

    return c.json({ success: true });
  } catch (error) {
    console.error("Remove member error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default teamsRoute;
