import { db } from "@rms-modern/db";
import {
  account,
  allUserRoles,
  session,
  user as userTable,
  userTypes,
  verification,
} from "@rms-modern/db/schema/auth";
import {
  type OrganizationStatus,
  organizationInvitations,
  organizationMembers,
  organizationStatuses,
  organizations,
} from "@rms-modern/db/schema/organization";
import { type BetterAuthOptions, betterAuth, type User } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { anonymous } from "better-auth/plugins/anonymous";
import { organization as organizationPlugin } from "better-auth/plugins/organization";
import {
  adminAc as organizationAdminAccess,
  memberAc as organizationMemberAccess,
  ownerAc as organizationOwnerAccess,
} from "better-auth/plugins/organization/access";
import { username } from "better-auth/plugins/username";
import { eq } from "drizzle-orm";
import { z } from "zod";

const resetPasswordWebhook = process.env.RESET_PASSWORD_WEBHOOK_URL;
const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL;
const appName = process.env.APP_NAME || "RMS";
const isProduction = process.env.NODE_ENV === "production";
const userTypeValidator = z.enum(userTypes);
const userRoleValidator = z.enum(allUserRoles);
const organizationStatusValidator = z.enum(organizationStatuses);
const allowedOrganizationCreatorRoles = new Set(["COMMON", "TEAM_MENTOR"]);
const MIN_ORGANIZATION_CREATOR_AGE = 18;

const SLUGIFY_REGEX_NON_ALPHANUM = /[^a-z0-9]+/g;
const SLUGIFY_REGEX_LEADING_DASHES = /^-+/;
const SLUGIFY_REGEX_TRAILING_DASHES = /-+$/;
const FRONTEND_URL_REGEX_TRAILING_SLASH = /\/$/;

type ResendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";

async function sendResendEmail({ to, subject, html, text }: ResendEmailInput) {
  if (!(resendApiKey && resendFromEmail)) {
    console.warn(
      "[auth] RESEND_API_KEY or RESEND_FROM_EMAIL is missing. Email delivery skipped."
    );

    if (!isProduction) {
      console.info(
        `[auth] Intended email to ${to} | subject: ${subject} | body: ${text ?? html}`
      );
    }
    return;
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => "Unknown error");
    console.error("[auth] Resend API error:", errorPayload);
    throw new Error(
      "Unable to send transactional email. Please try again later."
    );
  }
}

async function sendVerificationEmail({
  user,
  url,
}: {
  user: { email: string; name?: string | null };
  url: string;
}) {
  const greetingName = user.name || "there";
  await sendResendEmail({
    to: user.email,
    subject: `Verify your ${appName} email`,
    html: `<p>Hi ${greetingName},</p>
<p>Thanks for signing up for ${appName}. Please confirm your email to continue.</p>
<p><a href="${url}" style="display:inline-block;padding:12px 20px;background-color:#4f46e5;border-radius:6px;color:#ffffff;text-decoration:none;">Verify email</a></p>
<p>If the button does not work, copy and paste this link into your browser:</p>
<p>${url}</p>
<p>If you did not create this account, you can safely ignore this email.</p>`,
    text: `Hi ${greetingName},\n\nConfirm your ${appName} email by visiting ${url}\n\nIf you did not create this account you can ignore this message.`,
  });
}

async function sendPasswordResetEmail({
  user,
  url,
  token,
}: {
  user: { email: string; name?: string | null };
  url: string;
  token: string;
}) {
  const greetingName = user.name || "there";
  await sendResendEmail({
    to: user.email,
    subject: `Reset your ${appName} password`,
    html: `<p>Hi ${greetingName},</p>
<p>We received a request to reset the password for your ${appName} account. You can create a new password by using the link below.</p>
<p><a href="${url}" style="display:inline-block;padding:12px 20px;background-color:#4f46e5;border-radius:6px;color:#ffffff;text-decoration:none;">Reset password</a></p>
<p>If the button does not work, copy and paste this link into your browser:</p>
<p>${url}</p>
<p>This link will expire shortly for security reasons. If you did not request a password reset, you can safely ignore this email.</p>`,
    text: `Hi ${greetingName},\n\nReset your ${appName} password by visiting ${url}\n\nIf you did not request this change, you can ignore this message.`,
  });

  if (resetPasswordWebhook) {
    await fetch(resetPasswordWebhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: user.email, url, token }),
    });
  }
}

function parseDateInput(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function calculateAge(date: Date) {
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

export type AuthUser = User & {
  role?: string | null;
  dateOfBirth?: Date | null;
  isAnonymous?: boolean;
};

function isEligibleForOrganizationCreation(user: AuthUser) {
  if (!(user.role && allowedOrganizationCreatorRoles.has(user.role))) {
    return false;
  }
  const dob = parseDateInput(user.dateOfBirth);
  if (!dob) {
    return false;
  }
  return calculateAge(dob) >= MIN_ORGANIZATION_CREATOR_AGE;
}

function sanitizeOptionalString(value?: unknown) {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeOrganizationStatus(
  status?: string | null
): OrganizationStatus {
  if (!status) {
    return "DRAFT";
  }
  const normalized = status.trim().toUpperCase() as OrganizationStatus;
  return (organizationStatuses as readonly string[]).includes(normalized)
    ? normalized
    : "DRAFT";
}

function slugify(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(SLUGIFY_REGEX_NON_ALPHANUM, "-")
    .replace(SLUGIFY_REGEX_LEADING_DASHES, "")
    .replace(SLUGIFY_REGEX_TRAILING_DASHES, "");
  return normalized || `organization-${Date.now()}`;
}

function buildOrganizationInvitationUrl(invitationId: string) {
  const base =
    process.env.ORGANIZATION_INVITATION_URL ||
    (process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL.replace(
          FRONTEND_URL_REGEX_TRAILING_SLASH,
          ""
        )}/organizations/invitations/accept`
      : "");
  if (!base) {
    return "";
  }
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}invitationId=${encodeURIComponent(invitationId)}`;
}

async function ensureMentorRole(userId: string) {
  await db
    .update(userTable)
    .set({
      role: "TEAM_MENTOR",
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(userTable.id, userId));
}

type OrganizationInvitationEmailInput = {
  id: string;
  email: string;
  role: string;
  organization: {
    name?: string | null;
    description?: string | null;
    teamNumber?: string | null;
  };
  inviter: {
    user: {
      name?: string | null;
      email: string;
    };
  };
};

async function sendOrganizationInvitationEmail({
  id,
  email,
  role,
  organization,
  inviter,
}: OrganizationInvitationEmailInput) {
  const invitationUrl = buildOrganizationInvitationUrl(id);
  const organizationName =
    sanitizeOptionalString(organization.name) || "an organization";
  const inviterName =
    sanitizeOptionalString(inviter.user?.name) || inviter.user.email;
  const orgDescription = sanitizeOptionalString(organization.description);
  const orgTeamNumber = sanitizeOptionalString(organization.teamNumber);
  const descriptionBlock = orgDescription
    ? `<p><strong>About the organization:</strong> ${orgDescription}</p>`
    : "";
  const teamNumberBlock = orgTeamNumber
    ? `<p><strong>Team number:</strong> ${orgTeamNumber}</p>`
    : "";
  const linkBlock = invitationUrl
    ? `<p><a href="${invitationUrl}" style="display:inline-block;padding:12px 20px;background-color:#4f46e5;border-radius:6px;color:#ffffff;text-decoration:none;">Respond to invitation</a></p>
<p>If the button does not work, copy and paste this link into your browser:</p>
<p>${invitationUrl}</p>`
    : `<p>Use this invitation ID in the ${appName} app to respond: <strong>${id}</strong></p>`;

  await sendResendEmail({
    to: email,
    subject: `${inviterName} invited you to join ${organizationName}`,
    html: `<p>Hi there,</p>
<p>${inviterName} invited you to join ${organizationName} as <strong>${role}</strong>.</p>
${descriptionBlock}
${teamNumberBlock}
${linkBlock}
<p>This invitation will expire soon. If you were not expecting this email, you can ignore it.</p>`,
    text: `Hi there,

${inviterName} invited you to join ${organizationName} as ${role}.
${orgDescription ? `\nAbout the organization: ${orgDescription}\n` : ""}${
  orgTeamNumber ? `Team number: ${orgTeamNumber}\n` : ""
}${
  invitationUrl
    ? `Respond here: ${invitationUrl}`
    : `Use invitation ID ${id} inside the ${appName} app.`
}

If you were not expecting this email, you can ignore it.`,
  });
}

// Send email to existing user who was added to a team
export async function sendTeamMemberAddedEmail({
  email,
  userName,
  teamName,
  inviterName,
}: {
  email: string;
  userName: string;
  teamName: string;
  inviterName: string;
}) {
  const loginUrl = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL.replace(FRONTEND_URL_REGEX_TRAILING_SLASH, "")}/sign-in`
    : "";

  const loginBlock = loginUrl
    ? `<p><a href="${loginUrl}" style="display:inline-block;padding:12px 20px;background-color:#4f46e5;border-radius:6px;color:#ffffff;text-decoration:none;">Log in to view team</a></p>
<p>If the button does not work, copy and paste this link into your browser:</p>
<p>${loginUrl}</p>`
    : "";

  await sendResendEmail({
    to: email,
    subject: `You've been added to ${teamName}`,
    html: `<p>Hi ${userName},</p>
<p>You have been added to the team <strong>${teamName}</strong> by ${inviterName}.</p>
${loginBlock}
<p>We look forward to collaborating with you!</p>`,
    text: `Hi ${userName},

You have been added to the team ${teamName} by ${inviterName}.
${loginUrl ? `\nLog in at: ${loginUrl}` : ""}

We look forward to collaborating with you!`,
  });
}

// Send welcome email to newly created user with temporary credentials
export async function sendTeamMemberWelcomeEmail({
  email,
  userName,
  teamName,
  inviterName,
  temporaryPassword,
}: {
  email: string;
  userName: string;
  teamName: string;
  inviterName: string;
  temporaryPassword: string;
}) {
  const loginUrl = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL.replace(FRONTEND_URL_REGEX_TRAILING_SLASH, "")}/sign-in`
    : "";

  const loginBlock = loginUrl
    ? `<p><a href="${loginUrl}" style="display:inline-block;padding:12px 20px;background-color:#4f46e5;border-radius:6px;color:#ffffff;text-decoration:none;">Log in now</a></p>
<p>If the button does not work, copy and paste this link into your browser:</p>
<p>${loginUrl}</p>`
    : "";

  await sendResendEmail({
    to: email,
    subject: `Welcome to ${appName}! You've been invited to ${teamName}`,
    html: `<p>Hi ${userName},</p>
<p>${inviterName} has invited you to join <strong>${teamName}</strong> on ${appName}.</p>
<p>An account has been created for you with the following credentials:</p>
<p><strong>Login Email:</strong> ${email}<br>
<strong>Temporary Password:</strong> ${temporaryPassword}</p>
${loginBlock}
<p><strong>Important:</strong> Please log in and change your password immediately from your Account Settings.</p>
<p>We look forward to collaborating with you!</p>`,
    text: `Hi ${userName},

${inviterName} has invited you to join ${teamName} on ${appName}.

An account has been created for you with the following credentials:

Login Email: ${email}
Temporary Password: ${temporaryPassword}

${loginUrl ? `Log in at: ${loginUrl}\n` : ""}
Important: Please log in and change your password immediately from your Account Settings.

We look forward to collaborating with you!`,
  });
}

export const auth = betterAuth<BetterAuthOptions>({
  database: drizzleAdapter(db, {
    provider: "sqlite",

    schema: {
      user: userTable,
      session,
      account,
      verification,
      organization: organizations,
      member: organizationMembers,
      invitation: organizationInvitations,
    },
  }),
  trustedOrigins: [process.env.CORS_ORIGIN || ""],
  emailVerification: {
    sendVerificationEmail: async (data) => {
      const frontendUrl = process.env.FRONTEND_URL;
      const token = new URL(data.url).searchParams.get("token");
      const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;

      await sendVerificationEmail({ user: data.user, url: verificationUrl });
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: sendPasswordResetEmail,
    revokeSessionsOnPasswordReset: true,
    requireEmailVerification: true,
  },
  user: {
    additionalFields: {
      type: {
        type: "string",
        defaultValue: "REGULAR",
        validator: {
          input: userTypeValidator,
          output: userTypeValidator,
        },
      },
      role: {
        type: "string",
        defaultValue: "COMMON",
        validator: {
          input: userRoleValidator,
          output: userRoleValidator,
        },
      },
      phone: {
        type: "string",
        required: true,
        validator: {
          input: z
            .string()
            .min(7, "Phone must be at least 7 digits")
            .max(20, "Phone number is too long"),
        },
      },
      dateOfBirth: {
        type: "date",
        required: true,
        validator: {
          input: z.coerce.date({
            message: "Date of birth is required", // Changed from required_error
            invalid_type_error: "Date of birth is invalid",
          }),
        },
      },
      school: {
        type: "string",
        required: false,
      },
      location: {
        type: "string",
        required: false,
      },
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    },
  },
  plugins: [
    anonymous(),
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
    }),
    // Organization entity maps 1:1 with our "team" concept
    organizationPlugin({
      creatorRole: "TEAM_MENTOR",
      allowUserToCreateOrganization: (user) =>
        isEligibleForOrganizationCreation(user),
      invitationExpiresIn: 60 * 60 * 24 * 2,
      cancelPendingInvitationsOnReInvite: true,
      sendInvitationEmail: async (data) => {
        await sendOrganizationInvitationEmail({
          id: data.id,
          email: data.email,
          role: data.role,
          organization: data.organization,
          inviter: data.inviter,
        });
      },
      roles: {
        TEAM_MENTOR: organizationOwnerAccess,
        TEAM_LEADER: organizationAdminAccess,
        TEAM_MEMBER: organizationMemberAccess,
      },
      schema: {
        session: {
          fields: {
            activeOrganizationId: "activeOrganizationId",
          },
        },
        organization: {
          additionalFields: {
            description: { type: "string" },
            location: { type: "string" },
            teamNumber: { type: "string" },
            status: {
              type: "string",
              required: true,
              defaultValue: "DRAFT",
              validator: {
                input: organizationStatusValidator,
                output: organizationStatusValidator,
              },
            },
          },
        },
      },
      organizationHooks: {
        // biome-ignore lint/suspicious/useAwait: Required to be async for better-auth hook type
        beforeCreateOrganization: async ({ organization, user }) => {
          const now = new Date();
          const fallbackName =
            sanitizeOptionalString(organization.name) || "team";
          return {
            data: {
              ...organization,
              slug: slugify(organization.slug ?? fallbackName),
              status: normalizeOrganizationStatus(
                (organization.status as string | null) ?? undefined
              ),
              description: sanitizeOptionalString(organization.description),
              location: sanitizeOptionalString(organization.location),
              teamNumber: sanitizeOptionalString(organization.teamNumber),
              logo: sanitizeOptionalString(organization.logo),
              updatedAt: now,
              createdBy: organization.createdBy ?? user.id,
            },
          };
        },
        afterCreateOrganization: async ({ user }) => {
          if (user.role !== "TEAM_MENTOR") {
            await ensureMentorRole(user.id);
          }
        },
      },
    }),
    admin({
      defaultRole: "COMMON",
      adminRoles: ["ADMIN"],
      bannedUserMessage:
        "Your account has been suspended. Please contact tournament staff.",
    }),
  ],
});
