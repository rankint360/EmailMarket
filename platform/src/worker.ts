import { spawn } from "node:child_process";
import { openDatabase } from "./db.js";
import { dispatchOne, externalAdapter, validId } from "./delivery.js";
import type { Adapter } from "./delivery.js";

export function postfixAdapter(path: string): Adapter {
  return (job) =>
    new Promise((resolve) => {
      const child = spawn(path, ["-i", "-f", job.sender, "--", job.recipient], {
        stdio: ["pipe", "ignore", "ignore"],
        timeout: 10000,
      });
      child.on("error", () => resolve("uncertain"));
      child.on("exit", (code) =>
        resolve(code === 0 ? "accepted" : "uncertain"),
      );
      child.stdin.on("error", () => resolve("uncertain"));
      const headers = Object.entries(job.headers ?? {}).map(
        ([key, value]) => key + ": " + value,
      );
      child.stdin.end(
        [
          "From: " + job.sender,
          "To: " + job.recipient,
          "Subject: =?UTF-8?B?" +
            Buffer.from(job.subject).toString("base64") +
            "?=",
          "Message-ID: <" + job.id + "@" + job.sender.split("@")[1] + ">",
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=utf-8",
          "Content-Transfer-Encoding: base64",
          ...headers,
          "",
          Buffer.from(job.content)
            .toString("base64")
            .match(/.{1,76}/g)
            ?.join("\r\n") ?? "",
        ].join("\r\n") + "\r\n",
      );
    });
}

if (process.argv[1]?.endsWith("worker.js")) {
  const workspaces = (process.env.DELIVERY_WORKSPACES ?? "")
    .split(",")
    .filter(Boolean);
  if (!workspaces.length || workspaces.some((id) => !validId.test(id)))
    throw new Error("Set DELIVERY_WORKSPACES to approved workspace IDs");
  const endpoint = process.env.PROVIDER_URL,
    key = process.env.PROVIDER_KEY;
  const sendmail = process.env.POSTFIX_SENDMAIL;
  const adapter =
    endpoint && key
      ? externalAdapter(endpoint, key)
      : sendmail
        ? postfixAdapter(sendmail)
        : undefined;
  if (!adapter || !process.env.DATABASE_URL)
    throw new Error("Configure a delivery adapter and DATABASE_URL");
  const db = await openDatabase(process.env.DATABASE_URL);
  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
  });
  process.on("SIGTERM", () => {
    stopped = true;
  });
  try {
    while (!stopped) {
      for (const w of workspaces)
        if (!stopped) await dispatchOne(db, w, adapter);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    await db.close();
  }
}
