import { config } from "dotenv";

// Scripts run outside Next, which loads .env.local itself. Match that order:
// .env.local wins, .env fills gaps.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
