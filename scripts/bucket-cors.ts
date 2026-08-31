import "../db/load-env";
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Teach the bucket to accept the browser's direct PUT (spec §14.5).
 *
 * The upload flow hands a phone a presigned URL and lets it PUT the bytes
 * straight to the bucket. That is a cross-origin request carrying a real
 * `content-type`, so the browser sends a preflight first — and a bucket with
 * no CORS policy answers it with 403 and the upload dies before a single byte
 * moves. Nothing in the app can work around that; it is bucket configuration.
 *
 * Buckets are created empty of any CORS rules, and each environment gets its
 * own, so this has to be run once per bucket:
 *
 *   railway run npm run bucket:cors        # against the linked environment
 *
 * It is idempotent — PutBucketCors replaces the whole policy — so re-running
 * it after adding a domain is the intended way to update it.
 */

/**
 * Every origin the app is served from. A preflight from anywhere else fails,
 * so a domain missing here is a domain that cannot upload.
 *
 * Railway's own variables only ever name the *canonical* domain: once a custom
 * domain is attached, `RAILWAY_PUBLIC_DOMAIN` and friends all report it, and
 * the generated `*.up.railway.app` domain keeps serving while appearing in no
 * variable at all. `BUCKET_CORS_EXTRA_ORIGINS` (comma-separated) is where any
 * such second domain gets declared.
 */
function allowedOrigins(): string[] {
  const origins = new Set<string>();
  const declared = [
    process.env.APP_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    ...(process.env.BUCKET_CORS_EXTRA_ORIGINS?.split(",") ?? []),
  ];
  for (const value of declared) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    origins.add(trimmed.startsWith("http") ? new URL(trimmed).origin : `https://${trimmed}`);
  }
  // Local development PUTs to the same bucket.
  origins.add("http://localhost:3000");
  return [...origins];
}

async function main() {
  const bucket = process.env.BUCKET_NAME ?? process.env.AWS_BUCKET_NAME;
  const endpoint = process.env.AWS_ENDPOINT_URL_S3 ?? process.env.AWS_ENDPOINT_URL;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Bucket credentials are missing. Run this through `railway run` (or with a .env.local that has them).",
    );
  }

  const client = new S3Client({
    region: process.env.AWS_REGION ?? "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const origins = allowedOrigins();
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            // GET/HEAD so a fetched presigned URL works too; the uploader
            // itself only needs PUT.
            AllowedMethods: ["PUT", "POST", "GET", "HEAD"],
            AllowedHeaders: ["*"],
            // The uploader reads neither, but a resumed or multipart upload
            // would, and exposing them costs nothing.
            ExposeHeaders: ["ETag", "Content-Length"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    }),
  );

  const applied = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log(`CORS applied to ${bucket}:`);
  console.dir(applied.CORSRules, { depth: null });
}

main().catch((error) => {
  console.error("Setting bucket CORS failed:", error);
  process.exit(1);
});
