import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { getDb } from "./db.js";
import { IS_DELETED } from "./soft-delete.js";
import type { Role } from "./tables.js";
import { getBidang } from "../organization/persistence.js";

const COOKIE = "sirefik_sesi";

function secret(): string {
  return process.env.SESSION_SECRET ?? "sirefik-dev-secret";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = scryptSync(password, salt, 32).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
  } catch {
    return false;
  }
}

function sign(value: string): string {
  const mac = createHmac("sha256", secret()).update(value).digest("hex");
  return `${value}.${mac}`;
}

function unsign(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const value = token.slice(0, i);
  const mac = token.slice(i + 1);
  const expected = createHmac("sha256", secret()).update(value).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"))) {
      return null;
    }
  } catch {
    return null;
  }
  return value;
}

export type AuthUser = {
  id: number;
  bidang_id: number;
  opd_id: number;
  nama: string;
  username: string;
  role: Role;
};

export async function readUser(c: Context): Promise<AuthUser | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const idRaw = unsign(token);
  if (!idRaw) return null;
  const id = Number(idRaw);
  if (!id) return null;
  const row = await getDb()
    .selectFrom("users")
    .innerJoin("bidang", "bidang.id", "users.bidang_id")
    .select([
      "users.id",
      "users.bidang_id",
      "users.nama_lengkap",
      "users.username",
      "users.role",
      "bidang.id_opd",
    ])
    .where("users.id", "=", id)
    .where("users.is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
  if (!row) return null;
  return {
    id: row.id,
    bidang_id: row.bidang_id,
    opd_id: row.id_opd,
    nama: row.nama_lengkap,
    username: row.username,
    role: row.role,
  };
}

export function setSession(c: Context, userId: number): void {
  setCookie(c, COOKIE, sign(String(userId)), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearSession(c: Context): void {
  deleteCookie(c, COOKIE, { path: "/" });
}

export async function requireUser(c: Context, next: Next) {
  const user = await readUser(c);
  if (!user) return c.redirect("/masuk");
  c.set("user", user);
  await next();
}

export function currentUser(c: Context): AuthUser {
  return c.get("user");
}

export function hasRole(user: AuthUser, roles: Role[]): boolean {
  return roles.includes(user.role);
}

export function opdScope(user: AuthUser): number | null {
  if (user.role === "administrator") return null;
  return user.opd_id;
}

export function bidangScope(user: AuthUser): number | null {
  if (user.role === "administrator" || user.role === "pimpinan") return null;
  return user.bidang_id;
}

export function roleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    administrator: "Administrator Sistem",
    staf: "Staf Bidang",
    kepala_bidang: "Kepala Bidang",
    pimpinan: "Pimpinan",
  };
  return labels[role];
}

export async function resolveOpdId(bidangId: number): Promise<number> {
  const b = await getBidang(bidangId);
  if (!b) throw new Error("Bidang tidak ditemukan.");
  return b.id_opd;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}
