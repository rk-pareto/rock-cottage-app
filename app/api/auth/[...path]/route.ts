import { auth } from "@/lib/auth/neon-auth";

// Neon Auth callback/session routes. This is the only unauthenticated
// application surface besides the sign-in pages.
export const { GET, POST } = auth.handler();
