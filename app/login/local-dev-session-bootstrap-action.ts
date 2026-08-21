"use server";

import {
  bootstrapLocalDevSessionAuthority,
} from "@/lib/server/full-local-auth/local-dev-session-bootstrap";

export async function bootstrapLocalDevSessionAction() {
  return bootstrapLocalDevSessionAuthority();
}
