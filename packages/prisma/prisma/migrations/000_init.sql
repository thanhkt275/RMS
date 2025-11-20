-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('REGULAR', 'ORG');

-- CreateEnum
CREATE TYPE "AnyUserRole" AS ENUM ('TEAM_MENTOR', 'TEAM_LEADER', 'TEAM_MEMBER', 'COMMON', 'ADMIN', 'TSO', 'HEAD_REFEREE', 'SCORE_KEEPER', 'QUEUER');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrganizationMemberRole" AS ENUM ('TEAM_MENTOR', 'TEAM_LEADER', 'TEAM_MEMBER');

-- CreateEnum
CREATE TYPE "OrganizationInvitationStatus" AS ENUM ('pending', 'accepted', 'rejected', 'canceled');

-- CreateEnum
CREATE TYPE "ScoreProfilePartType" AS ENUM ('NUMBER', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('UPCOMING', 'ONGOING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TournamentStageStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TournamentStageType" AS ENUM ('FIRST_ROUND', 'SEMI_FINAL_ROUND_ROBIN', 'FINAL_DOUBLE_ELIMINATION');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MatchRobotStatus" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('NORMAL', 'SURROGATE');

-- CreateEnum
CREATE TYPE "MatchFormat" AS ENUM ('ROUND_ROBIN', 'DOUBLE_ELIMINATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TournamentFieldRole" AS ENUM ('TSO', 'HEAD_REFEREE', 'SCORE_KEEPER', 'QUEUER');

-- CreateEnum
CREATE TYPE "TournamentRegistrationStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TournamentRegistrationStepType" AS ENUM ('INFO', 'FILE_UPLOAD', 'CONSENT');

-- CreateEnum
CREATE TYPE "TournamentRegistrationSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('AVATAR', 'TEAM_LOGO', 'DOCUMENT', 'IMAGE', 'OTHER');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "username" TEXT,
    "displayUsername" TEXT,
    "type" "UserType" NOT NULL DEFAULT 'REGULAR',
    "role" "AnyUserRole" NOT NULL DEFAULT 'COMMON',
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "image" TEXT,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "activeOrganizationId" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "thumbnailPath" TEXT,
    "thumbnailUrl" TEXT,
    "category" "FileCategory" NOT NULL DEFAULT 'OTHER',
    "uploadedBy" TEXT NOT NULL,
    "relatedEntityId" TEXT,
    "relatedEntityType" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "coverImage" TEXT,
    "description" TEXT,
    "location" TEXT,
    "teamNumber" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL DEFAULT 'TEAM_MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL DEFAULT 'TEAM_MEMBER',
    "status" "OrganizationInvitationStatus" NOT NULL DEFAULT 'pending',
    "inviterId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_profile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'UPCOMING',
    "season" TEXT,
    "location" TEXT,
    "organizer" TEXT,
    "logo" TEXT,
    "coverImage" TEXT,
    "description" TEXT,
    "announcement" TEXT,
    "fieldCount" INTEGER NOT NULL DEFAULT 1,
    "registrationDeadline" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "metadata" JSONB,
    "scoreProfileId" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_field_assignment" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "fieldNumber" INTEGER NOT NULL,
    "role" "TournamentFieldRole" NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_field_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_resource" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_participation" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "registeredBy" TEXT,
    "status" "TournamentRegistrationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "consentAcceptedAt" TIMESTAMP(3),
    "consentAcceptedBy" TEXT,
    "seed" INTEGER,
    "placement" TEXT,
    "result" TEXT,
    "record" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_stage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TournamentStageType" NOT NULL DEFAULT 'FIRST_ROUND',
    "stageOrder" INTEGER NOT NULL DEFAULT 1,
    "status" "TournamentStageStatus" NOT NULL DEFAULT 'PENDING',
    "configuration" TEXT,
    "scoreProfileId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_stage_team" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_stage_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_registration_step" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stepType" "TournamentRegistrationStepType" NOT NULL DEFAULT 'INFO',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "stepOrder" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_registration_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_registration_submission" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" "TournamentRegistrationSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_registration_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_stage_ranking" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "rankingPoints" INTEGER NOT NULL DEFAULT 0,
    "autonomousPoints" INTEGER NOT NULL DEFAULT 0,
    "strengthPoints" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "scoreData" JSONB,
    "loseRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_stage_ranking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT,
    "stageId" TEXT,
    "round" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3),
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "homePlaceholder" TEXT,
    "awayPlaceholder" TEXT,
    "metadata" JSONB,
    "robotStatus" "MatchRobotStatus",
    "homeRobotStatus" "MatchRobotStatus",
    "homeRobotNotes" TEXT,
    "awayRobotStatus" "MatchRobotStatus",
    "awayRobotNotes" TEXT,
    "matchType" "MatchType" NOT NULL DEFAULT 'NORMAL',
    "format" "MatchFormat",
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_achievement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tournamentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER,
    "awardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_achievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organization_member_organizationId_userId_key" ON "organization_member"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_slug_key" ON "tournament"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_field_assignment_tournamentId_fieldNumber_role_key" ON "tournament_field_assignment"("tournamentId", "fieldNumber", "role");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_participation_tournamentId_organizationId_key" ON "tournament_participation"("tournamentId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_stage_team_stageId_organizationId_key" ON "tournament_stage_team"("stageId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_registration_submission_participationId_stepId_key" ON "tournament_registration_submission"("participationId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_stage_ranking_stageId_organizationId_key" ON "tournament_stage_ranking"("stageId", "organizationId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitation" ADD CONSTRAINT "organization_invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitation" ADD CONSTRAINT "organization_invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_profile" ADD CONSTRAINT "score_profile_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_profile" ADD CONSTRAINT "score_profile_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_scoreProfileId_fkey" FOREIGN KEY ("scoreProfileId") REFERENCES "score_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_field_assignment" ADD CONSTRAINT "tournament_field_assignment_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_field_assignment" ADD CONSTRAINT "tournament_field_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_resource" ADD CONSTRAINT "tournament_resource_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_participation" ADD CONSTRAINT "tournament_participation_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_participation" ADD CONSTRAINT "tournament_participation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stage" ADD CONSTRAINT "tournament_stage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stage" ADD CONSTRAINT "tournament_stage_scoreProfileId_fkey" FOREIGN KEY ("scoreProfileId") REFERENCES "score_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stage_team" ADD CONSTRAINT "tournament_stage_team_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "tournament_stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stage_team" ADD CONSTRAINT "tournament_stage_team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registration_step" ADD CONSTRAINT "tournament_registration_step_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registration_submission" ADD CONSTRAINT "tournament_registration_submission_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registration_submission" ADD CONSTRAINT "tournament_registration_submission_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "tournament_participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registration_submission" ADD CONSTRAINT "tournament_registration_submission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registration_submission" ADD CONSTRAINT "tournament_registration_submission_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "tournament_registration_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stage_ranking" ADD CONSTRAINT "tournament_stage_ranking_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "tournament_stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stage_ranking" ADD CONSTRAINT "tournament_stage_ranking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "tournament_stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_achievement" ADD CONSTRAINT "tournament_achievement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_achievement" ADD CONSTRAINT "tournament_achievement_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

