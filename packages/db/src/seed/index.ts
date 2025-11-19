import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import type { ScoreProfileConfiguration } from "../schema/organization";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = resolve(__dirname, "../../../../");
config({ path: resolve(projectRoot, "apps/server/.env") });

const { db } = await import("../index");
const {
  organizations,
  scoreProfiles,
  tournamentParticipations,
  tournamentStages,
  tournamentStageTeams,
  tournaments,
  tournamentRegistrationSteps,
} = await import("../schema/organization");
const { user, orgRoles } = await import("../schema/auth");

type SeedTeam = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE";
  location: string;
  teamNumber: string;
};

async function seed() {
  console.log("🌱 Seeding database...");

  // Create 32 teams
  const teams: SeedTeam[] = [];
  for (let i = 1; i <= 32; i++) {
    teams.push({
      id: `team-${i}`,
      name: `Team ${i}`,
      slug: `team-${i}`,
      status: "ACTIVE" as const,
      location: `City ${i}`,
      teamNumber: `T${i.toString().padStart(3, "0")}`,
    });
  }

  const tournamentId = "tournament-2025";
  const stageId = "stage-1";
  const defaultScoreProfileId = "score-profile-default";
  const defaultScoreProfile: ScoreProfileConfiguration = {
    version: 1,
    parts: [
      {
        id: "auto-bonus",
        label: "Autonomous Bonus",
        description: "Bonus points per successful autonomous task",
        type: "NUMBER",
        pointsPerUnit: 5,
        maxValue: 10,
        cooperativeBonus: {
          requiredTeamCount: 2,
          bonusPoints: 10,
          appliesTo: "PER_TEAM",
          description:
            "If both teams reach the target, each earns 10 bonus points.",
        },
      },
      {
        id: "driver-mission",
        label: "Driver Mission",
        description:
          "Counts missions completed during driver-controlled period.",
        type: "NUMBER",
        pointsPerUnit: 3,
        maxValue: 20,
      },
      {
        id: "endgame-perch",
        label: "Endgame Perch",
        description: "Grant 20 points if the robot perches successfully.",
        type: "BOOLEAN",
        truePoints: 20,
        cooperativeBonus: {
          requiredTeamCount: 4,
          bonusPoints: 15,
          appliesTo: "ALL_TEAMS",
          description: "All four teams perched for a global celebration bonus.",
        },
      },
    ],
    penalties: [
      {
        id: "minor-penalty",
        label: "Minor Penalty",
        description: "Subtract 5 points from the infringing team.",
        points: 5,
        target: "SELF",
        direction: "SUBTRACT",
      },
      {
        id: "major-penalty",
        label: "Major Penalty",
        description: "Award 10 points to the opposing alliance.",
        points: 10,
        target: "OPPONENT",
        direction: "ADD",
      },
    ],
    totalFormula:
      "auto-bonus + driver-mission + endgame-perch - minor-penalty + major-penalty",
    notes:
      "Demo score profile used by the seed script. Adjust or replace in production.",
  };

  await db.transaction(async (tx) => {
    console.log("Cleaning up previous seed data (if any)...");
    await tx
      .delete(tournamentStageTeams)
      .where(eq(tournamentStageTeams.stageId, stageId));
    await tx.delete(tournamentStages).where(eq(tournamentStages.id, stageId));
    await tx
      .delete(tournamentParticipations)
      .where(eq(tournamentParticipations.tournamentId, tournamentId));
    await tx.delete(tournaments).where(eq(tournaments.id, tournamentId));
    await tx.delete(organizations).where(
      inArray(
        organizations.id,
        teams.map((team) => team.id)
      )
    );
    await tx
      .delete(scoreProfiles)
      .where(eq(scoreProfiles.id, defaultScoreProfileId));

    console.log("Creating 32 teams...");
    await tx.insert(organizations).values(teams);

    // Create a tournament
    const tournament = {
      id: tournamentId,
      name: "RMS Modern Championship 2026",
      slug: "rms-modern-championship-2026",
      status: "UPCOMING" as const,
      season: "2025",
      location: "Virtual",
      organizer: "RMS Organization",
      description: "The premier tournament for RMS Modern teams",
      registrationDeadline: new Date("2025-11-15"),
      startDate: new Date("2025-11-10"),
      endDate: new Date("2026-01-01"),
    };

    console.log("Seeding score profile...");
    await tx.insert(scoreProfiles).values({
      id: defaultScoreProfileId,
      name: "Default League Profile",
      description:
        "Sample profile demonstrating number, boolean, penalty, and cooperative bonuses.",
      definition: defaultScoreProfile,
    });

    console.log("Creating tournament...");
    await tx.insert(tournaments).values({
      ...tournament,
      scoreProfileId: defaultScoreProfileId,
    });

    console.log("Creating registration steps...");
    await tx.insert(tournamentRegistrationSteps).values([
      {
        id: "step-basic-info",
        tournamentId,
        title: "Team information",
        description: "Share your organization contacts and pit details.",
        stepType: "INFO",
        isRequired: true,
        stepOrder: 1,
        metadata: JSON.stringify({
          inputLabel: "Organization overview",
          helperText:
            "Include the primary contact, pit requirements, and robot summary.",
          maxLength: 1200,
        }),
      },
      {
        id: "step-safety-plan",
        tournamentId,
        title: "Safety documentation",
        description: "Upload your latest safety plan PDF.",
        stepType: "FILE_UPLOAD",
        isRequired: true,
        stepOrder: 2,
        metadata: JSON.stringify({
          acceptedTypes: ["application/pdf"],
          helperText: "PDF only. Maximum size 10MB.",
          maxFiles: 1,
        }),
      },
      {
        id: "step-consent",
        tournamentId,
        title: "Consent & policies",
        description: "Confirm that your team agrees to tournament policies.",
        stepType: "CONSENT",
        isRequired: true,
        stepOrder: 3,
        metadata: JSON.stringify({
          statement:
            "I confirm that our team has reviewed the event policies and waivers.",
        }),
      },
    ]);

    // Register all teams for the tournament
    const participations = teams.map((team, index) => ({
      id: `participation-${team.id}`,
      tournamentId,
      organizationId: team.id,
      seed: index + 1,
      status: "APPROVED" as const,
    }));

    console.log("Registering teams for tournament...");
    await tx.insert(tournamentParticipations).values(participations);

    // Create first stage with all 32 teams
    const stage = {
      id: stageId,
      tournamentId,
      name: "Round 1",
      type: "FIRST_ROUND" as const,
      stageOrder: 1,
      status: "PENDING" as const,
    };

    console.log("Creating first stage...");
    await tx.insert(tournamentStages).values(stage);

    // Assign all teams to the stage
    const stageTeams = teams.map((team, index) => ({
      id: `stage-team-${team.id}`,
      stageId,
      organizationId: team.id,
      seed: index + 1,
    }));

    console.log("Assigning teams to stage...");
    await tx.insert(tournamentStageTeams).values(stageTeams);

    const roleNames = orgRoles.filter((role) => role !== "ADMIN");
    const timestamp = new Date();

    const orgStaff = roleNames.flatMap((role) => {
      const normalizedRole = role.replace(/_/g, "-").toLowerCase();
      return Array.from({ length: 10 }, (_, index) => {
        const serial = String(index + 1).padStart(2, "0");
        const id = `org-${normalizedRole}-${serial}`;
        const email = `org-${normalizedRole}-${serial}@example.com`;
        const username = `org-${normalizedRole}-${serial}`;

        return {
          id,
          name: `Org ${role.replace("_", " ")} ${serial}`,
          email,
          emailVerified: 1,
          username,
          displayUsername: username,
          type: "ORG" as const,
          role,
          phone: "555-0123",
          dateOfBirth: new Date(1990, 0, 1),
          image: null,
          banned: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      });
    });

    const existingEmails = orgStaff.map((staff) => staff.email);
    await tx.delete(user).where(inArray(user.email, existingEmails));

    console.log("Seeding organization staff accounts...");
    await tx.insert(user).values(orgStaff);
  });

  console.log("✅ Seeding completed successfully!");
}

seed()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
