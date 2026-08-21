import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.auth.loginTitle,
  description: t.auth.loginLede,
  /* Auth screens have no business in search results. */
  robots: { index: false, follow: false },
};

/**
 * `?redirect=` carries the page the visitor was trying to reach — the room, in
 * the case a bid prompted the sign-in. Validated server-side in the login
 * action, which only follows same-origin relative paths; reflecting it here
 * without that check would be an open redirect.
 */
export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const raw = Array.isArray(params.redirect) ? params.redirect[0] : params.redirect;

  return (
    <AuthShell
      title={t.auth.loginTitle}
      lede={t.auth.loginLede}
      altPrompt={t.auth.noAccount}
      altLabel={t.auth.registerTitle}
      altHref="/register"
    >
      <AuthForm mode="login" redirectTo={raw} />
    </AuthShell>
  );
}
