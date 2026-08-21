"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { login, register, type AuthState } from "@/app/actions/auth";
import { t } from "@/lib/copy";
import { OtpForm } from "./OtpForm";

type Mode = "login" | "register";

/**
 * The login and register forms are the same component in two modes — they share
 * every field except name and confirmation, and splitting them would mean two
 * copies of the password toggle, the validation styling and the submit state.
 *
 * Wired to `login` / `register` in src/app/actions/auth.ts through
 * `useActionState`, so the form posts and works with JavaScript disabled — the
 * fields are plain inputs with `name` attributes and the action reads FormData.
 *
 * Passwords are never put in component state that outlives the form, never
 * logged, and the inputs carry the right `autocomplete` values so password
 * managers behave correctly. The value lives only in the uncontrolled input and
 * goes straight into FormData.
 *
 * Both modes can end at the code step: registering always does, and logging in
 * does when the account exists but its number was never verified.
 */
export function AuthForm({ mode, redirectTo }: { mode: Mode; redirectTo?: string }) {
  const isRegister = mode === "register";
  const [showPassword, setShowPassword] = useState(false);

  const [state, formAction] = useActionState<AuthState, FormData>(
    isRegister ? register : login,
    { status: "idle" },
  );

  const nameId = useId();
  const phoneId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const dobId = useId();
  const termsId = useId();
  const noticeId = useId();

  /*
   * The server sent a code. Swapping the whole form out — rather than revealing
   * a code field below the password — is what stops a browser's password
   * manager from re-submitting the credentials when the code is entered.
   */
  if (state.status === "code-sent") {
    return <OtpForm phone={state.phone} purpose="verify" />;
  }

  return (
    <form action={formAction} noValidate className="mt-8">
      {redirectTo && <input type="hidden" name="redirect" value={redirectTo} />}
      <div className="flex flex-col gap-5">
        {isRegister && (
          <Field
            id={nameId}
            label={t.auth.name}
            type="text"
            autoComplete="name"
            required
          />
        )}

        <Field
          id={phoneId}
          label={t.auth.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="9911 2233"
          required
        />

        {/* Password + its visibility toggle. The button is inside the field box
            so the tap target sits where the eye icon appears. */}
        <div>
          <label htmlFor={passwordId} className="eyebrow">
            {t.auth.password}
          </label>
          <div className="relative mt-2">
            <input
              id={passwordId}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? 8 : undefined}
              className="h-12 w-full border border-line bg-ground pr-12 pl-3.5 text-base text-ink transition-colors placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={
                showPassword ? t.auth.hidePassword : t.auth.showPassword
              }
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 grid w-12 touch-manipulation place-items-center text-muted transition-colors hover:text-ink"
            >
              <EyeIcon off={showPassword} />
            </button>
          </div>
          {isRegister && (
            <p className="mt-1.5 text-xs text-muted">{t.auth.passwordHint}</p>
          )}
        </div>

        {isRegister && (
          <Field
            id={confirmId}
            label={t.auth.passwordConfirm}
            type="password"
            autoComplete="new-password"
            required
          />
        )}

        {/*
          18+, asked as a date rather than as a checkbox.
          `max` stops the picker offering a future date; the server re-checks
          the age regardless, because a date input is trivially bypassed.
        */}
        {isRegister && (
          <div>
            <label htmlFor={dobId} className="eyebrow">
              {t.auth.dateOfBirth}
            </label>
            <input
              id={dobId}
              name="dateOfBirth"
              type="date"
              autoComplete="bday"
              max={new Date().toISOString().slice(0, 10)}
              required
              data-numerals
              className="mt-2 h-12 w-full border border-line bg-ground px-3.5 text-base text-ink transition-colors focus:border-accent focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-muted">{t.auth.dateOfBirthHint}</p>
          </div>
        )}
      </div>

      {/* Secondary row: remember/forgot for login, terms for register. */}
      {isRegister ? (
        <label
          htmlFor={termsId}
          className="mt-6 flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-ink-soft"
        >
          <input
            id={termsId}
            name="terms"
            type="checkbox"
            required
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
          />
          <span>
            <Link href="/terms" className="text-accent underline underline-offset-2">
              {t.footer.terms}
            </Link>
            ,{" "}
            <Link href="/privacy" className="text-accent underline underline-offset-2">
              {t.footer.privacy}
            </Link>
            ,{" "}
            <Link href="/rules" className="text-accent underline underline-offset-2">
              {t.nav.rules}
            </Link>
            {" — "}
            {t.auth.terms}
          </span>
        </label>
      ) : (
        <div className="mt-5 flex items-center justify-between gap-4">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft">
            <input
              name="remember"
              type="checkbox"
              className="size-4 accent-[var(--color-accent)]"
            />
            {t.auth.remember}
          </label>
          <Link
            href="/forgot"
            className="eyebrow text-accent transition-opacity hover:opacity-75"
          >
            {t.auth.forgot}
          </Link>
        </div>
      )}

      <SubmitButton
        label={isRegister ? t.auth.registerTitle : t.auth.loginTitle}
        describedBy={state.status === "error" ? noticeId : undefined}
      />

      {state.status === "error" && (
        <p
          id={noticeId}
          role="alert"
          className="mt-4 border-l-2 border-rust pl-3 text-sm leading-relaxed text-rust"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

/**
 * Split out because `useFormStatus` only reports the status of the form it is
 * rendered INSIDE — called in the same component as the `<form>` it would
 * always read false.
 */
function SubmitButton({
  label,
  describedBy,
}: {
  label: string;
  describedBy?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-describedby={describedBy}
      className="mt-7 h-12 w-full touch-manipulation rounded-full bg-ink text-[0.75rem] font-bold tracking-[0.14em] text-ground uppercase transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-60"
    >
      {pending ? t.auth.working : label}
    </button>
  );
}

function Field({
  id,
  label,
  ...input
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>
      <input
        id={id}
        {...input}
        className="mt-2 h-12 w-full border border-line bg-ground px-3.5 text-base text-ink transition-colors placeholder:text-faint focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className="size-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.8 10S4.9 4.6 10 4.6 18.2 10 18.2 10 15.1 15.4 10 15.4 1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.6" />
      {off && <path d="M3.5 3.5l13 13" />}
    </svg>
  );
}
