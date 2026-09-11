import { prisma } from "../lib/prisma.js";

// Read-only for now. The connect/configure flows (OAuth for Gmail, API credentials for
// WhatsApp/Viber) land in Phase 6-7 — this just lets the campaign builder ask "is there a
// connected integration for this channel?" so it can gate sending honestly instead of faking it.
//
// `config` (the encrypted OAuth token blob) is never selected here — the frontend only ever needs
// type/name/status, and there's no reason for even the ciphertext to leave the server.
export function listIntegrations() {
  return prisma.integration.findMany({
    orderBy: { type: "asc" },
    select: {
      id: true,
      type: true,
      name: true,
      status: true,
      connectedById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
