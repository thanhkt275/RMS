import { createClient } from "@libsql/client";
import { drizzle, LibSQLDatabase } from "drizzle-orm/libsql";
import * as authSchema from "./schema/auth";
import * as filesSchema from "./schema/files";
import * as organizationSchema from "./schema/organization";

const client = createClient({
  url: process.env.DATABASE_URL || "",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const schema = { ...authSchema, ...filesSchema, ...organizationSchema };

export const db: LibSQLDatabase<typeof schema> = drizzle(client, { schema });
