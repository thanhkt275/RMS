import { env } from "node:process";
import type { S3Options } from "bun";
import { S3Client } from "bun";

type UploadParams = {
  file: File;
  key: string;
  acl?: S3Options["acl"];
  contentType?: string;
};

type UploadResult = {
  key: string;
  url: string;
  bytesWritten: number;
};

const REQUIRED_ENV_VARS = [
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

const LEADING_SLASHES_REGEX = /^\/+/;
const TRAILING_SLASHES_REGEX = /\/+$/;

const hasAllS3EnvVars = REQUIRED_ENV_VARS.every((key) => Boolean(env[key]));

let cachedClient: S3Client | null = null;

const baseOptions: S3Options = {
  bucket: env.S3_BUCKET,
  region: env.S3_REGION ?? env.AWS_REGION,
  endpoint: env.S3_ENDPOINT,
  accessKeyId: env.S3_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY,
  sessionToken: env.S3_SESSION_TOKEN ?? env.AWS_SESSION_TOKEN,
};

function ensureS3Client(): S3Client {
  if (!hasAllS3EnvVars) {
    throw new Error(
      "S3 is not configured. Please set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }

  if (!cachedClient) {
    cachedClient = new S3Client(baseOptions);
  }

  return cachedClient;
}

function buildPublicUrl(key: string): string {
  const normalizedKey = key.replace(LEADING_SLASHES_REGEX, "");
  const publicBase = env.S3_PUBLIC_URL?.replace(TRAILING_SLASHES_REGEX, "");

  if (publicBase) {
    return `${publicBase}/${normalizedKey}`;
  }

  const bucket = env.S3_BUCKET ?? "s3-bucket";
  const region = env.S3_REGION ?? env.AWS_REGION;
  const regionSegment = region ? `.${region}` : "";

  return `https://${bucket}.s3${regionSegment}.amazonaws.com/${normalizedKey}`;
}

export function isS3Enabled(): boolean {
  return hasAllS3EnvVars;
}

export function getS3Client(): S3Client {
  return ensureS3Client();
}

export async function uploadFileToS3({
  file,
  key,
  acl = "public-read",
  contentType,
}: UploadParams): Promise<UploadResult> {
  const client = ensureS3Client();
  const normalizedKey = key.replace(LEADING_SLASHES_REGEX, "");

  const bytesWritten = await client.write(normalizedKey, file, {
    acl,
    type: contentType ?? file.type,
  });

  return {
    key: normalizedKey,
    bytesWritten,
    url: buildPublicUrl(normalizedKey),
  };
}

export function formatS3Path(key: string): string {
  if (!env.S3_BUCKET) {
    return key;
  }
  const normalizedKey = key.replace(LEADING_SLASHES_REGEX, "");
  return `s3://${env.S3_BUCKET}/${normalizedKey}`;
}
