import type { DefaultSession } from "next-auth";
import type { Role } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      /** Null for operators. */
      dealerId: string | null;
    } & DefaultSession["user"];
  }
}
