export function PairDevice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 p-8 text-center text-ink-100">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold">This screen is not paired yet</h1>
        <p className="mt-3 text-sm text-ink-300">
          A parent can create a kiosk link under Settings, then open it once on
          this device. After that it stays signed in and shows the family display
          whenever the browser starts.
        </p>
        <p className="mt-6 text-xs text-ink-400">
          Nothing sensitive is shown here — no held savings and no bill
          destinations on the shared view.
        </p>
      </div>
    </main>
  );
}
