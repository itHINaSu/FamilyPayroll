import { logout } from "@/app/login/actions";

export function SignOutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="text-sm text-ink-500 transition hover:text-ink-900 dark:text-ink-300 dark:hover:text-white"
      >
        Sign out
      </button>
    </form>
  );
}
