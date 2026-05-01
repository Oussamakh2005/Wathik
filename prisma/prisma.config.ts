import { defineConfig } from "@prisma/internals";
import { config } from "dotenv";

config({ path: ".env" });

export default defineConfig({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
