import type { PrismaClient } from "@rms-modern/prisma";

export type PrismaAdapterOptions = {
  schema?: Record<string, unknown>;
};

// Thin Prisma adapter for better-auth. We expose a stable set of CRUD methods
// used by our auth flows and organization plugin.
export function prismaAdapter(client: PrismaClient, _options?: PrismaAdapterOptions) {
  const user = {
    async create(data: any) {
      return client.user.create({ data });
    },
    async findById(id: string) {
      return client.user.findUnique({ where: { id } });
    },
    async findByEmail(email: string) {
      return client.user.findUnique({ where: { email } });
    },
    async update(id: string, data: any) {
      return client.user.update({ where: { id }, data });
    },
    async delete(id: string) {
      return client.user.delete({ where: { id } });
    },
  };

  const session = {
    async create(data: any) {
      return client.session.create({ data });
    },
    async findById(id: string) {
      return client.session.findUnique({ where: { id } });
    },
    async findByToken(token: string) {
      return client.session.findFirst({ where: { token } });
    },
    async deleteById(id: string) {
      return client.session.delete({ where: { id } });
    },
    async deleteByUserId(userId: string) {
      return client.session.deleteMany({ where: { userId } });
    },
  };

  const account = {
    async create(data: any) {
      return client.account.create({ data });
    },
    async findByProviderAccountId(providerId: string, accountId: string) {
      return client.account.findFirst({ where: { providerId, accountId } });
    },
    async update(id: string, data: any) {
      return client.account.update({ where: { id }, data });
    },
    async delete(id: string) {
      return client.account.delete({ where: { id } });
    },
  };

  const verification = {
    async create(data: any) {
      return client.verification.create({ data });
    },
    async findByIdentifierAndValue(identifier: string, value: string) {
      return client.verification.findFirst({ where: { identifier, value } });
    },
    async delete(id: string) {
      return client.verification.delete({ where: { id } });
    },
  };

  const organization = {
    async create(data: any) {
      return client.organization.create({ data });
    },
    async update(id: string, data: any) {
      return client.organization.update({ where: { id }, data });
    },
    async delete(id: string) {
      return client.organization.delete({ where: { id } });
    },
    async findById(id: string) {
      return client.organization.findUnique({ where: { id } });
    },
  };

  const member = {
    async add(data: any) {
      return client.organizationMember.create({ data });
    },
    async update(id: string, data: any) {
      return client.organizationMember.update({ where: { id }, data });
    },
    async remove(id: string) {
      return client.organizationMember.delete({ where: { id } });
    },
    async find(where: any) {
      return client.organizationMember.findFirst({ where });
    },
  };

  const invitation = {
    async create(data: any) {
      return client.organizationInvitation.create({ data });
    },
    async update(id: string, data: any) {
      return client.organizationInvitation.update({ where: { id }, data });
    },
    async delete(id: string) {
      return client.organizationInvitation.delete({ where: { id } });
    },
    async findById(id: string) {
      return client.organizationInvitation.findUnique({ where: { id } });
    },
  };

  return {
    getClient() {
      return client;
    },
    async transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
      return client.$transaction(async (tx) => fn(tx as PrismaClient));
    },
    user,
    session,
    account,
    verification,
    organization,
    member,
    invitation,
  } as unknown as object;
}
