import { prisma } from "../lib/prisma.js";
import { recordAudit } from "./audit.service.js";

const SINGLETON_ID = "singleton";

export interface Branding {
  companyName: string | null;
  logoUrl: string | null;
}

export async function getBranding(): Promise<Branding> {
  const settings = await prisma.appSettings.findUnique({ where: { id: SINGLETON_ID } });
  return { companyName: settings?.companyName ?? null, logoUrl: settings?.logoUrl ?? null };
}

export async function updateBranding(
  input: { companyName?: string | null; logoUrl?: string | null },
  actorId: string,
): Promise<Branding> {
  const data = {
    companyName: input.companyName === undefined ? undefined : input.companyName || null,
    logoUrl: input.logoUrl === undefined ? undefined : input.logoUrl || null,
  };

  const settings = await prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });

  await recordAudit({
    userId: actorId,
    action: "BRANDING_UPDATED",
    entityType: "AppSettings",
    entityId: SINGLETON_ID,
    metadata: { companyName: settings.companyName, logoUrl: settings.logoUrl },
  });

  return { companyName: settings.companyName, logoUrl: settings.logoUrl };
}
