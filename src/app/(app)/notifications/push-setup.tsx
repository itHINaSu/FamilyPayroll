"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button } from "@/components/ui";
import { sendTest, subscribeDevice, type NotifyState } from "./actions";

/**
 * iOS Web Push onboarding.
 *
 * Three iOS-specific constraints shape this component, and all three fail
 * silently rather than throwing if ignored:
 *
 *  - Push only works for a PWA added to the home screen. In a Safari tab there
 *    is nothing to enable, so the component detects that and gives instructions
 *    rather than a dead button.
 *  - There is no `beforeinstallprompt` on iOS, so installing cannot be triggered
 *    from code — the user has to be walked through Share → Add to Home Screen.
 *  - `Notification.requestPermission()` must be called from a direct tap. Asking
 *    on page load quietly fails.
 */

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);

  // Returned as a plain ArrayBuffer: applicationServerKey rejects a Uint8Array
  // backed by a possibly-shared buffer.
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<
    "checking" | "needs_install" | "ready" | "subscribed" | "denied" | "unsupported"
  >("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState(isIos() && !isStandalone() ? "needs_install" : "unsupported");
      return;
    }

    if (isIos() && !isStandalone()) {
      setState("needs_install");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "subscribed" : "ready"))
      .catch(() => setState("ready"));
  }, []);

  async function enable() {
    setError(null);
    try {
      // Must run inside this click handler — iOS ignores a permission request
      // that is not tied to a user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = subscription.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      const result = await subscribeDevice(
        { endpoint: json.endpoint, keys: json.keys },
        navigator.userAgent,
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      setState("subscribed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications.");
    }
  }

  if (state === "checking") {
    return <p className="text-sm text-ink-400">Checking this device…</p>;
  }

  if (state === "needs_install") {
    return (
      <Alert tone="info">
        <strong>Add this to your home screen first.</strong>
        <span className="mt-2 block">
          On iPhone, notifications only work once the app is installed — they do
          not work in a Safari tab, and there is no button that can do it for you.
        </span>
        <span className="mt-2 block">
          Tap <strong>Share</strong> at the bottom of Safari, then{" "}
          <strong>Add to Home Screen</strong>. Open Family Payroll from the new
          icon and come back to this page.
        </span>
      </Alert>
    );
  }

  if (state === "unsupported") {
    return (
      <Alert tone="warning">
        This browser does not support Web Push. Everything still works — payroll
        runs and bills draw on schedule regardless — you just will not get alerts
        here.
      </Alert>
    );
  }

  if (state === "denied") {
    return (
      <Alert tone="warning">
        Notifications are blocked for this app. Re-enable them in your device
        settings, then reload this page.
      </Alert>
    );
  }

  if (state === "subscribed") {
    return (
      <Alert tone="info">
        This device is subscribed. If you ever delete and re-add the home screen
        icon, come back and turn it on again — iOS discards the subscription.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <Button type="button" onClick={enable}>
        Enable notifications on this device
      </Button>
    </div>
  );
}

export function TestButton() {
  const [state, formAction] = useActionState<NotifyState, FormData>(sendTest, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}
      <SubmitTest />
    </form>
  );
}

function SubmitTest() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Sending…" : "Send a test notification"}
    </Button>
  );
}
