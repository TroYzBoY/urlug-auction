import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { t } from "@/lib/copy";

export const metadata: Metadata = {
  title: t.auth.registerTitle,
  description: t.auth.registerLede,
  /* Auth screens have no business in search results. */
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <AuthShell
      title={t.auth.registerTitle}
      lede={t.auth.registerLede}
      altPrompt={t.auth.haveAccount}
      altLabel={t.auth.loginTitle}
      altHref="/login"
    >
      <AuthForm mode="register" />
    </AuthShell>
  );
}
