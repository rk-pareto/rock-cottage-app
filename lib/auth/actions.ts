"use server";

import { redirect } from "next/navigation";
import { auth } from "./neon-auth";

export async function signOut(): Promise<void> {
  try {
    await auth.signOut();
  } catch (error) {
    console.error("signOut failed", error);
  }
  redirect("/auth/sign-in");
}
