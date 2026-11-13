import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  const key = (await derive(password, salt, 64)) as Buffer;
  return salt + ":" + key.toString("hex");
}

export function equal(left: string, right: string) {
  return timingSafeEqual(
    Buffer.from(digest(left), "hex"),
    Buffer.from(digest(right), "hex"),
  );
}
