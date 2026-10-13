import { Alert, Card } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { listBackups } from "@/lib/backup";
import { config } from "@/lib/config";
import { BackupControls } from "../backup-controls";
import { ResetControl } from "../reset-control";
import { SectionHeader } from "../section-header";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DataSettingsPage() {
  await requireParent();
  const backups = listBackups();

  return (
    <>
      <SectionHeader title="Backups and data" />
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="text-sm text-ink-400">
          A consistent snapshot is written nightly at{" "}
          {String(config.backupCronHour).padStart(2, "0")}:00 and kept for{" "}
          {config.backupRetentionDays} days. Each file is a complete database — copy one
          anywhere and it opens.
        </p>

        <BackupControls />

        <Card>
          <h2 className="mb-3 font-semibold">Existing snapshots</h2>
          {backups.length === 0 ? (
            <Alert tone="info">No snapshots yet. The first one runs tonight.</Alert>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {backups.slice(0, 10).map((b) => (
                <li key={b.name} className="flex justify-between gap-3">
                  <span className="tnum min-w-0 truncate text-ink-500 dark:text-ink-300">
                    {b.name}
                  </span>
                  <span className="tnum shrink-0 text-ink-400">{formatBytes(b.sizeBytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="pt-6">
          <ResetControl />
        </div>
      </div>
    </>
  );
}
