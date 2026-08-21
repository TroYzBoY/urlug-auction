"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { requestReset, type AuthState } from "@/app/actions/auth";
import { t } from "@/lib/copy";
import { OtpForm } from "./OtpForm";

/**
 * Step one of the reset: ask for the number.
 *
 * The action reports the same "code sent" result whether or not the number is
 * registered, so this component cannot distinguish them either — which is the
 * point. A form that says "no such account" is a membership oracle for anyone
 * with a list of phone numbers.
 */
export function ForgotForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(requestReset, {
    status: "idle",
  });
  const phoneId = useId();

  if (state.status === "code-sent") {
    return <OtpForm phone={state.phone} purpose="reset" />;
  }

  return (
    <form action={formAction} noValidate className="mt-8">
      <div>
        <label htmlFor={phoneId} className="eyebrow">
          {t.auth.phone}
        </label>
        <input
          id={phoneId}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="9911 2233"
          required
          className="mt-2 h-12 w-full border border-line bg-ground px-3.5 text-base text-ink transition-colors placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </div>

      <SubmitButton />

      {state.status === "error" && (
        <p
          role="alert"
          className="mt-4 border-l-2 border-rust pl-3 text-sm leading-relaxed text-rust"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-7 h-12 w-full touch-manipulation rounded-full bg-ink text-[0.75rem] font-bold tracking-[0.14em] text-ground uppercase transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-60"
    >
      {pending ? t.auth.working : t.auth.sendCode}
    </button>
  );
}
