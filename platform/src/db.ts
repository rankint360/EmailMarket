import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";

export type Sql = <
  Row extends Record<string, unknown> = Record<string, unknown>,
>(
  statement: string,
  values?: unknown[],
) => Promise<Row[]>;

export async function openDatabase(url?: string, directory?: string) {
  const pool = url ? new Pool({ connectionString: url }) : undefined;
  const local = pool ? undefined : new PGlite(directory);
  return {
    async migrate() {
      const statement = await readFile(
        new URL("../../db/001.sql", import.meta.url),
        "utf8",
      );
      const migrate = async (
        exec: (s: string) => Promise<unknown>,
        sql: Sql,
      ) => {
        if (pool) await exec("SELECT pg_advisory_xact_lock(174603)");
        await exec(
          "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY)",
        );
        if (
          !(
            await sql("SELECT version FROM schema_migrations WHERE version = 1")
          ).length
        ) {
          await exec(statement);
          await exec("INSERT INTO schema_migrations VALUES (1)");
        }
      };
      if (local) {
        await local.transaction((tx) =>
          migrate(
            (s) => tx.exec(s),
            async <R extends Record<string, unknown>>(
              s: string,
              v?: unknown[],
            ) => (await tx.query<R>(s, v)).rows,
          ),
        );
        return;
      }
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        await migrate(
          (s) => client.query(s),
          async <R extends Record<string, unknown>>(s: string, v?: unknown[]) =>
            (await client.query<R>(s, v)).rows,
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async run<T>(
      operation: (sql: Sql) => Promise<T>,
      account = "",
      workspace = "",
    ) {
      const scoped = async (sql: Sql) => {
        if (local) await sql("SET LOCAL ROLE emailmarket_app");
        await sql(
          "SELECT set_config('emailmarket.account', $1, true), set_config('emailmarket.workspace', $2, true)",
          [account, workspace],
        );
        return operation(sql);
      };
      if (local)
        return local.transaction((tx) =>
          scoped(
            async <R extends Record<string, unknown>>(
              s: string,
              v?: unknown[],
            ) => (await tx.query<R>(s, v)).rows,
          ),
        );
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const value = await scoped(
          async <R extends Record<string, unknown>>(s: string, v?: unknown[]) =>
            (await client.query<R>(s, v)).rows,
        );
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await local?.close();
      await pool?.end();
    },
  };
}

export type Database = Awaited<ReturnType<typeof openDatabase>>;
