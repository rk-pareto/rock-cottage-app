"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Retire the intro tour for the signed-in member. Called both when they reach
 * the last card and when they skip — a skip is an answer, not a deferral.
 */
export async function markIntroSeen(): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return { ok: false, error: "You're signed out. Sign in and try again." };
  }

  try {
    await db
      .update(members)
      .set({ introSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(members.id, member.id));
  } catch (error) {
    console.error("markIntroSeen failed", error);
    return { ok: false, error: "Couldn't save that. It'll show again next time." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Put the tour back — the Account page's "Show the intro again". */
export async function replayIntro(): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return { ok: false, error: "You're signed out. Sign in and try again." };
  }

  try {
    await db
      .update(members)
      .set({ introSeenAt: null, updatedAt: new Date() })
      .where(eq(members.id, member.id));
  } catch (error) {
    console.error("replayIntro failed", error);
    return { ok: false, error: "Couldn't start the intro. Try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
