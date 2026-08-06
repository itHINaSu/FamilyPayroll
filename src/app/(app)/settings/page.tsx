import { Alert, Card, PageHeader } from "@/components/ui";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import { listBackups } from "@/lib/backup";
import { config } from "@/lib/config";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function SettingsPage() {
  await requireParent();
  const home = getHousehold();
  const backups = listBackups();

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Household configuration and system health."
      />

      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Household</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500 dark:text-ink-300">Name</dt>
              <dd>{home?.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500 dark:text-ink-300">Timezone</dt>
              <dd className="tnum">{home?.timezone}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500 dark:text-ink-300">Public URL</dt>
              <dd className="tnum">
                {home?.appUrl ?? (
                  <span className="text-ink-400">not set</span>
                )}
              </dd>
            </div>
          </dl>

          {!home?.appUrl && (
            <div className="mt-4">
              <Alert tone="warning">
                Set <code className="tnum">APP_URL</code> to your public HTTPS
                origin before phase 3. Web Push on iOS will not work without it,
                and changing it later invalidates every subscription.
              </Alert>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold">Backups</h2>
          <p className="mb-4 text-sm text-ink-400">
            A consistent snapshot is written nightly at{" "}
            {String(config.backupCronHour).padStart(2, "0")}:00 and kept for{" "}
            {config.backupRetentionDays} days. Each file is a complete database —
            copy one anywhere and it opens.
          </p>

          {backups.length === 0 ? (
            <Alert tone="info">
              No snapshots yet. The first one runs tonight.
            </Alert>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {backups.slice(0, 10).map((b) => (
                <li key={b.name} className="flex justify-between">
                  <span className="tnum text-ink-500 dark:text-ink-300">
                    {b.name}
                  </span>
                  <span className="tnum text-ink-400">
                    {formatBytes(b.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Coming in later phases</h2>
          <p className="text-sm text-ink-400">
            The full settings catalog — pay schedule, allocation percentages,
            completion mode, interest, transfers, bills, and raises, each as a
            household default with per-child overrides — arrives alongside the
            features it governs. See SPEC.md section 5.
          </p>
        </Card>
      </div>
    </>
  );
}
