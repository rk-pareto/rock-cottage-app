import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { members, type Member } from "@/db/schema";
import { auth } from "./neon-auth";

export type MembershipResult =
  | { state: "unauthenticated" }
  | { state: "unauthorized"; email: string | null }
  | { state: "member"; member: Member };

/**
 * Resolve the current request's cottage member (spec §6.2).
 *
 * Neon Auth will happily mint an identity for any email that receives a magic
 * link; application access is decided solely by an active row in `members`
 * matching the normalized email. Cached per-request so a page rendering
 * several sections only hits the database once.
 */
export const getMembership = cache(async (): Promise<MembershipResult> => {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return { state: "unauthenticated" };

  const email = user.email?.trim().toLowerCase() ?? null;
  if (!email) return { state: "unauthorized", email: null };

  const [row] = await db.select().from(members).where(eq(members.email, email)).limit(1);
  if (!row || !row.isActive) return { state: "unauthorized", email };

  // Bind the Neon Auth identity to the member row on first successful login.
  if (!row.authUserId) {
    const [bound] = await db
      .update(members)
      .set({ authUserId: user.id, updatedAt: new Date() })
      .where(eq(members.id, row.id))
      .returning();
    return { state: "member", member: bound ?? row };
  }

  return { state: "member", member: row };
});

/**
 * Guard for every mutation and every server component that reads cottage data.
 * Throws rather than redirects so a server action can never silently proceed
 * with an unauthenticated caller.
 */
export async function requireMember(): Promise<Member> {
  const result = await getMembership();
  if (result.state !== "member") {
    throw new Error("UNAUTHORIZED");
  }
  return result.member;
}

export async function getCurrentMember(): Promise<Member | null> {
  const result = await getMembership();
  return result.state === "member" ? result.member : null;
}
