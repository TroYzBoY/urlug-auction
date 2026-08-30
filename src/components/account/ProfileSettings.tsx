"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import {
  changeName,
  changePassword,
  type AccountState,
} from "@/app/actions/account";
import { t } from "@/lib/copy";

/**
 * What a bidder may change about themselves.
 *
 * Two separate forms rather than one. They have different consequences — a name
 * is cosmetic, a password ends every other session — and a single Save button
 * over both would mean typing a password to correct a typo in a name.
 *
 * Neither form carries a user id. The actions read the session; a form field
 * naming the account to change would be an account takeover with extra steps.
 */

const IDLE: AccountState = { status: "idle" };

const field =
  "h-11 w-full border border-line bg-ground px-3 text-base text-ink transition-colors placeholder:text-faint focus:border-accent focus:outline-none";

export function ProfileSettings({
  name,
  familyName,
}: {
  name: string;
  familyName: string | null;
}) {
  return (
    <div className="border-line mt-5 grid gap-8 border-t pt-6 lg:grid-cols-2">
      <NameForm name={name} familyName={familyName} />
      <PasswordForm />
    </div>
  );
}

/**
 * `familyName` is nullable: accounts that predate the овог/нэр split have only
 * the one field. The input is still required, so editing here is what fills it
 * in — an empty box on an old account is a prompt, not a bug.
 */
function NameForm({
  name,
  familyName,
}: {
  name: string;
  familyName: string | null;
}) {
  const [state, action] = useActionState<AccountState, FormData>(
    changeName,
    IDLE,
  );
  const id = useId();
  const familyId = useId();

  return (
    <form action={action}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={familyId} className="eyebrow">
            {t.auth.familyName}
          </label>
          <input
            id={familyId}
            name="familyName"
            type="text"
            autoComplete="family-name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={familyName ?? ""}
            className={`${field} mt-2`}
          />
        </div>
        <div>
          <label htmlFor={id} className="eyebrow">
            {t.account.displayName}
          </label>
          <input
            id={id}
            name="name"
            type="text"
            autoComplete="given-name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={name}
            className={`${field} mt-2`}
          />
        </div>
      </div>
      <p className="text-muted mt-2 text-xs leading-relaxed">
        {t.account.displayNameHint}
      </p>

      <Submit label={t.account.nameSave} />
      <Notice state={state} />
    </form>
  );
}

function PasswordForm() {
  const [state, action] = useActionState<AccountState, FormData>(
    changePassword,
    IDLE,
  );
  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();

  return (
    /*
     * `key` on the form, tied to the last result.
     *
     * A password form that keeps its values after a successful submit leaves
     * the new password sitting in three inputs on a screen somebody may walk
     * away from. Re-keying it makes React discard the DOM nodes and mount
     * empty ones, which is the only way to clear an uncontrolled input without
     * putting the value into component state first.
     */
    <form key={state.status === "ok" ? "done" : "editing"} action={action}>
      <p className="eyebrow">{t.account.passwordChange}</p>

      <div className="mt-2 flex flex-col gap-3">
        <div>
          <label htmlFor={currentId} className="sr-only">
            {t.account.currentPassword}
          </label>
          <input
            id={currentId}
            name="current"
            type="password"
            autoComplete="current-password"
            required
            placeholder={t.account.currentPassword}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={nextId} className="sr-only">
            {t.account.newPassword}
          </label>
          <input
            id={nextId}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder={t.account.newPassword}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={confirmId} className="sr-only">
            {t.account.newPasswordConfirm}
          </label>
          <input
            id={confirmId}
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder={t.account.newPasswordConfirm}
            className={field}
          />
        </div>
      </div>

      <p className="text-muted mt-2 text-xs leading-relaxed">
        {t.account.passwordChangeHint}
      </p>

      <Submit label={t.account.passwordChange} />
      <Notice state={state} />
    </form>
  );
}

/**
 * Split out because `useFormStatus` reports the status of the form it is
 * rendered inside — called in the same component as the <form> it always reads
 * false.
 */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="eyebrow border-line-strong text-ink hover:border-accent hover:text-accent mt-4 h-11 border px-5 transition-colors disabled:opacity-60"
    >
      {pending ? t.account.saving : label}
    </button>
  );
}

function Notice({ state }: { state: AccountState }) {
  if (state.status === "idle") return null;
  const bad = state.status === "error";
  return (
    <p
      role="alert"
      className={`mt-3 border-l-2 pl-3 text-sm leading-relaxed ${
        bad ? "border-rust text-rust" : "border-olive text-olive"
      }`}
    >
      {state.message}
    </p>
  );
}
