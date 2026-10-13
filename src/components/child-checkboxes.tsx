/**
 * "Who it's for" when adding an expectation or a bill in Setup. Everyone is
 * ticked by default; leaving everyone ticked also gives it to children added
 * later.
 */
export function ChildCheckboxes({ kids }: { kids: { id: string; name: string }[] }) {
  if (kids.length === 0) return null;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-700 dark:text-ink-200">
        Who it&apos;s for
      </legend>
      <div className="flex flex-wrap gap-2">
        {kids.map((k) => (
          <label
            key={k.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-300 px-3 py-2 text-sm dark:border-ink-600"
          >
            <input type="checkbox" name="childIds" value={k.id} defaultChecked />
            {k.name}
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-400">
        With everyone ticked, children you add later get it too.
      </p>
    </fieldset>
  );
}
