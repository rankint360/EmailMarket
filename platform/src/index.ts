import { readFile } from "node:fs/promises";
import { openDatabase } from "./db.js";
import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
const production = process.env.NODE_ENV === "production";
const migration = process.argv.includes("--migrate");
const url = migration
  ? process.env.MIGRATION_DATABASE_URL
  : process.env.DATABASE_URL;
if ((production || migration) && !url)
  throw new Error("DATABASE_URL is required");
const operatorKey = process.env.OPERATOR_KEY;
if (operatorKey && operatorKey.length < 32)
  throw new Error("OPERATOR_KEY must be at least 32 characters");
const feedbackKey = process.env.FEEDBACK_KEY;
if (feedbackKey && feedbackKey.length < 32)
  throw new Error("FEEDBACK_KEY must be at least 32 characters");
const publicOrigin = process.env.PUBLIC_ORIGIN;
if (publicOrigin && new URL(publicOrigin).origin !== publicOrigin)
  throw new Error("PUBLIC_ORIGIN must be an origin");
if (publicOrigin && new URL(publicOrigin).protocol !== "https:")
  throw new Error("PUBLIC_ORIGIN must use HTTPS");
const db = await openDatabase(url, process.env.LOCAL_DB ?? "./local-data");

try {
  if (migration || !url) await db.migrate();
  if (migration) {
    await db.close();
  } else {
    if (url) {
      const check = await readFile(
        new URL("../../db/check-runtime.sql", import.meta.url),
        "utf8",
      );
      await db.run((sql) => sql(check));
    }
    const app = buildApp(db, {
      secure: production,
      logger: true,
      operatorKey,
      feedbackKey,
      publicOrigin,
    });
    app.addHook("onClose", () => db.close());
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(
        signal,
        () =>
          void app.close().catch(() => {
            process.exitCode = 1;
          }),
      );
    }
    await app.listen({ port, host: process.env.BIND_HOST ?? "127.0.0.1" });
  }
} catch (error) {
  await db.close();
  throw error;
}
