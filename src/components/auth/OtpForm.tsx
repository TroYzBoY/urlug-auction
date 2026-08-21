"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import {
  completeReset,
  resendCode,
  verifyPhone,
  type AuthState,
} from "@/app/actions/auth";
import { t } from "@/lib/copy";

/**
 * The code step, shared by phone verification and password reset.
 *
 * The phone number travels in a hidden field rather than in a cookie or the
 * URL. It has to survive the round trip somehow, and of the three this is the
 * one that leaves nothing behind: a query parameter ends up in browser history,
 * in the Referer header of anything the page loads, and in server access logs.
 *
 * On its own the field is not a credential — knowing a number gets you nowhere
 * without the code that was sent to it — so nothing is lost by the user being
 * able to edit it.
 */
export function OtpForm({
  phone,
  purpose,
}: {
  phone: string;
  /** "verify" signs the bidder in; "reset" also sets a new password. */
  purpose: "verify" | "reset";
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(
    purpose === "verify" ? verifyPhone : completeReset,
    { status: "idle" },
  );
  const [resendState, resendAction] = useActionState<AuthState, FormData>(
    resendCode,
    { status: "idle" },
  );

  const codeId = useId();
  const passwordId = useId();
  const noticeId = useId();

  return (
    <div className="mt-8">
      <p className="text-sm leading-relaxed text-ink-soft">
        {t.auth.codeSent(phone)}
      </p>

      <form action={formAction} noValidate className="mt-6">
        <input type="hidden" name="phone" value={phone} />

        <div>
          <label htmlFor={codeId} className="eyebrow">
            {t.auth.code}
          </label>
          <input
            id={codeId}
            name="code"
            type="text"
            /*
             * `one-time-code` is what lets iOS and Android offer the code from
             * the SMS above the keyboard. `inputMode="numeric"` gives a digit
             * pad without `type="number"`, whose spinners and scroll-to-change
             * behaviour are wrong for a fixed-length code.
             */
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="\\d{6}"
            maxLength={6}
            required
            autoFocus
            data-numerals
            className="mt-2 h-12 w-full border border-line bg-ground px-3.5 text-center text-2xl tracking-[0.4em] text-ink transition-colors focus:border-accent focus:outline-none"
          />
        </div>

        {purpose === "reset" && (
          <div className="mt-5">
            <label htmlFor={passwordId} className="eyebrow">
              {t.auth.newPassword}
            </label>
            <input
              id={passwordId}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="mt-2 h-12 w-full border border-line bg-ground px-3.5 text-base text-ink transition-colors focus:border-accent focus:outline-none"
            />
          </div>
        )}

        <SubmitButton label={t.auth.verify} />

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

      <form action={resendAction} className="mt-5">
        <input type="hidden" name="phone" value={phone} />
        <ResendButton />
        {resendState.status === "error" && (
          <p role="alert" className="mt-2 text-xs text-rust">
            {resendState.message}
          </p>
        )}
      </form>
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-7 h-12 w-full touch-manipulation rounded-full bg-ink text-[0.75rem] font-bold tracking-[0.14em] text-ground uppercase transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-60"
    >
      {pending ? t.auth.working : label}
    </button>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="eyebrow text-accent transition-opacity hover:opacity-75 disabled:opacity-50"
    >
      {t.auth.resend}
    </button>
  );
}
