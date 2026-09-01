import { defineRailway, github, preserve, project, service } from "railway/iac";

// Scoped to the one service this repo deploys.
export const partial = "web";

/**
 * Railway config for the `web` service. This replaces the deprecated
 * `railway.json` (Config as Code), which stops being read on 2026-12-01.
 *
 * Read this before editing: **an apply deletes anything this file doesn't
 * mention.** `partial` narrows that to the `web` service, but it does *not*
 * spare the service's own variables or its source — a file listing only the
 * deploy settings plans to delete all fourteen variables (DATABASE_URL and the
 * auth secret included) and disconnect the repo. Hence the `preserve()` block:
 * it says "this variable exists, keep Railway's value", so secrets stay on
 * Railway and never enter source control. Adding a variable in the Railway
 * dashboard means adding a `preserve()` line here, or the next apply removes it.
 *
 * Always read `railway config plan` before `railway config apply`.
 */
export default defineRailway(() => {
  const web = service("web", {
    source: github("rk-pareto/rock-cottage-app", { branch: "main" }),

    healthcheck: "/api/health",
    healthcheckTimeout: 120,

    // Migrations run *before* the new container takes traffic, so a failed
    // migration fails the deploy instead of starting the app against an
    // incompatible schema. `railway config migrate` emitted this as a comment
    // rather than config — dropping it would have made every future deploy
    // skip migrations silently, so it is written out by hand here.
    preDeploy: "npm run db:migrate",

    deploy: {
      // Only the retry cap is stated. `railway.json` also set the policy type
      // to ON_FAILURE, which is Railway's own default — the platform stores
      // that as null, so declaring it leaves `railway config plan` permanently
      // reporting a change it can never apply. Restart behaviour is identical;
      // the default is On Failure with 10 retries, and this caps it at 3.
      restartPolicyMaxRetries: 3,
    },

    // Values live on Railway, not here. See the note above.
    env: {
      APP_TIMEZONE: preserve(),
      APP_URL: preserve(),
      AWS_ACCESS_KEY_ID: preserve(),
      AWS_ENDPOINT_URL_S3: preserve(),
      AWS_REGION: preserve(),
      AWS_SECRET_ACCESS_KEY: preserve(),
      BUCKET_CORS_EXTRA_ORIGINS: preserve(),
      BUCKET_NAME: preserve(),
      DATABASE_URL: preserve(),
      FEATURE_JUNO_ENABLED: preserve(),
      NEON_AUTH_BASE_URL: preserve(),
      NEON_AUTH_COOKIE_SECRET: preserve(),
      NODE_ENV: preserve(),
      OLLAMA_API_KEY: preserve(),
    },
  });

  return project("rock-cottage", {
    resources: [web],
  });
});
