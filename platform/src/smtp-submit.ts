import { createHash } from "node:crypto";
import { stdin } from "node:process";

const [sender, recipient] = process.argv.slice(2);
const credential = process.env.SMTP_BRIDGE_CREDENTIAL;
const endpoint = process.env.SMTP_BRIDGE_API;
if (!credential || !endpoint || !sender || !recipient)
  throw new Error("SMTP bridge configuration missing");
try {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of stdin) {
    length += chunk.length;
    if (length > 60000) {
      process.exitCode = 65;
      break;
    }
    chunks.push(chunk);
  }
  if (!process.exitCode) {
    const raw = Buffer.concat(chunks).toString("utf8");
    const split = /\r?\n\r?\n/.exec(raw);
    const header = split ? raw.slice(0, split.index) : "";
    const content = split ? raw.slice(split.index + split[0].length) : raw;
    const subject =
      /^Subject:[ \t]*([^\r\n]+)/im.exec(header)?.[1] ?? "Message";
    const messageId = /^Message-ID:[ \t]*([^\r\n]+)/im.exec(header)?.[1];
    if (!messageId) {
      process.exitCode = 65;
      throw new Error("Message-ID required");
    }
    const key = createHash("sha256")
      .update(JSON.stringify([sender, recipient, messageId]))
      .digest("hex");
    const response = await fetch(new URL("/api/v1/messages", endpoint), {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: "Bearer " + credential,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify({ sender, recipient, subject, content }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      process.exitCode =
        response.status >= 500 || response.status === 429 ? 75 : 65;
  }
} catch {
  process.exitCode ??= 75;
}
