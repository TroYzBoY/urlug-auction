import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/ForgotForm";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.auth.forgotTitle,
  description: t.auth.forgotLede,
  robots: { index: false, follow: false },
};

/**
 * Password reset, in one place rather than two.
 *
 * Requesting the code and redeeming it are steps of one flow, so they share a
 * URL: the form swaps itself for the code step. A separate `/reset` page would
 * have to carry the phone number between them in the URL, which puts it in
 * browser history and in the Referer of everything the page loads.
 */
export default function ForgotPage() {
  return (
    <AuthShell
      title={t.auth.forgotTitle}
      lede={t.auth.forgotLede}
      altPrompt={t.auth.haveAccount}
      altLabel={t.auth.loginTitle}
      altHref="/login"
    >
      <ForgotForm />
    </AuthShell>
  );
}
