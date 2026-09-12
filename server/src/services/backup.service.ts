import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./audit.service.js";

// Business data only — deliberately excludes: Users/Roles/Permissions (identity/auth, never
// portable across installs), Integration (config is encrypted with THIS server's ENCRYPTION_KEY;
// restoring elsewhere would silently corrupt), AuditLog (an immutable record of what happened on
// THIS system — re-importing it elsewhere creates a confusing, foreign history), and AppSettings
// (trivial branding, not worth the restore complexity). Order matters: each table lists only
// tables it depends on earlier in the array, so a straight top-to-bottom import never hits a
// missing foreign key within the backup itself.
const BACKUP_VERSION = 1;

const TABLES = [
  "tags",
  "contacts",
  "contactTags",
  "consents",
  "suppressions",
  "segments",
  "templates",
  "campaigns",
  "campaignTags",
  "campaignRecipients",
  "campaignMessages",
  "automationRules",
  "automationEnrollments",
  "automationStepLogs",
] as const;

type TableName = (typeof TABLES)[number];

export interface BackupFile {
  version: number;
  exportedAt: string;
  data: Partial<Record<TableName, unknown[]>>;
}

export async function exportBackup(actorId: string): Promise<BackupFile> {
  // Sequential, not Promise.all — 14 simultaneous queries momentarily competing for connections
  // is exactly the pattern that's caused real, reproducible pool exhaustion elsewhere in this
  // project (see vitest.config.ts's fileParallelism note). This isn't latency-sensitive enough to
  // be worth that risk.
  const data: BackupFile["data"] = {
    tags: await prisma.tag.findMany(),
    contacts: await prisma.contact.findMany(),
    contactTags: await prisma.contactTag.findMany(),
    consents: await prisma.consent.findMany(),
    suppressions: await prisma.suppressionList.findMany(),
    segments: await prisma.segment.findMany(),
    templates: await prisma.template.findMany(),
    campaigns: await prisma.campaign.findMany(),
    campaignTags: await prisma.campaignTag.findMany(),
    campaignRecipients: await prisma.campaignRecipient.findMany(),
    campaignMessages: await prisma.campaignMessage.findMany(),
    automationRules: await prisma.automationRule.findMany(),
    automationEnrollments: await prisma.automationEnrollment.findMany(),
    automationStepLogs: await prisma.automationStepLog.findMany(),
  };

  const file: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };

  await recordAudit({
    userId: actorId,
    action: "BACKUP_EXPORTED",
    entityType: "Backup",
    entityId: null,
    metadata: { counts: Object.fromEntries(TABLES.map((t) => [t, file.data[t]?.length ?? 0])) },
  });

  return file;
}

// Fields that reference something outside the backup's own tables (a User or an Integration) —
// stripped to null on import since the exporting system's ids are meaningless (or worse, silently
// wrong) on whatever system the file is restored into, this system included, if that user or
// integration has since been deleted.
const EXTERNAL_REFS: Partial<Record<TableName, string[]>> = {
  contacts: ["createdById"],
  segments: ["createdById"],
  templates: ["createdById"],
  campaigns: ["createdById", "senderIntegrationId"],
  automationRules: ["createdById"],
};

interface BulkWriteDelegate {
  createMany(args: { data: Record<string, unknown>[]; skipDuplicates: boolean }): Promise<{ count: number }>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
}

const MODEL_BY_TABLE: Record<TableName, keyof typeof prisma> = {
  tags: "tag",
  contacts: "contact",
  contactTags: "contactTag",
  consents: "consent",
  suppressions: "suppressionList",
  segments: "segment",
  templates: "template",
  campaigns: "campaign",
  campaignTags: "campaignTag",
  campaignRecipients: "campaignRecipient",
  campaignMessages: "campaignMessage",
  automationRules: "automationRule",
  automationEnrollments: "automationEnrollment",
  automationStepLogs: "automationStepLog",
};

export interface RestoreSummary {
  table: string;
  inTotal: number;
  inserted: number;
  skippedOrFailed: number;
}

function stripExternalRefs(table: TableName, rows: unknown[]): Record<string, unknown>[] {
  const fields = EXTERNAL_REFS[table];
  return (rows as Record<string, unknown>[]).map((row) => {
    if (!fields) return row;
    const copy = { ...row };
    for (const field of fields) copy[field] = null;
    return copy;
  });
}

export async function importBackup(file: unknown, actorId: string): Promise<RestoreSummary[]> {
  if (
    typeof file !== "object" ||
    file === null ||
    !("data" in file) ||
    typeof (file as { data: unknown }).data !== "object"
  ) {
    throw new AppError(400, "This doesn't look like a backup file exported from this app.");
  }
  const { data } = file as BackupFile;

  const summaries: RestoreSummary[] = [];

  for (const table of TABLES) {
    const rows = data[table];
    if (!Array.isArray(rows) || rows.length === 0) {
      summaries.push({ table, inTotal: 0, inserted: 0, skippedOrFailed: 0 });
      continue;
    }
    const cleaned = stripExternalRefs(table, rows);
    const delegate = prisma[MODEL_BY_TABLE[table]] as unknown as BulkWriteDelegate;

    let inserted = 0;
    try {
      const result = await delegate.createMany({ data: cleaned, skipDuplicates: true });
      inserted = result.count;
    } catch {
      // One row's foreign key doesn't resolve (e.g. a hand-edited file, or a partial backup) —
      // fall back to inserting what we can, one row at a time, rather than losing the whole table.
      for (const row of cleaned) {
        try {
          await delegate.create({ data: row });
          inserted += 1;
        } catch {
          // left for skippedOrFailed below
        }
      }
    }
    summaries.push({ table, inTotal: rows.length, inserted, skippedOrFailed: rows.length - inserted });
  }

  await recordAudit({
    userId: actorId,
    action: "BACKUP_IMPORTED",
    entityType: "Backup",
    entityId: null,
    metadata: { summaries },
  });

  return summaries;
}
