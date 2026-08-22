"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { startTopup, type WalletState } from "@/app/actions/wallet";
import type { Package } from "@/lib/repo/topups";
import { groupNumber, pts } from "@/lib/format";
import { t } from "@/lib/copy";

/**
 * The packages, each a submit button in one form.
 *
 * Only `points` is sent. The price is looked up server-side in `PACKAGES` — the
 * ₮ figure below is a label, not an input, and a client that could name its own
 * amount could buy 400 points for one tögrög.
 */
export function TopupPackages({ packages }: { packages: Package[] }) {
  const [state, formAction] = useActionState<WalletState, FormData>(startTopup, {
    status: "idle",
  });

  return (
    <>
      <form
        action={formAction}
        className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {packages.map((pkg) => (
          <PackageButton key={pkg.points} pkg={pkg} />
        ))}
      </form>

      {state.status === "error" && (
        <p role="alert" className="mt-4 text-sm font-medium text-rust">
          {state.message}
        </p>
      )}
    </>
  );
}

function PackageButton({ pkg }: { pkg: Package }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="points"
      value={pkg.points}
      disabled={pending}
      className="group relative flex flex-col items-start border border-line p-5 text-left transition-colors hover:border-accent disabled:opacity-60"
    >
      {pkg.tag && (
        <span className="eyebrow absolute top-0 right-4 -translate-y-1/2 bg-ground px-2 text-[0.625rem] text-flare">
          {pkg.tag}
        </span>
      )}
      <span
        data-numerals
        className="text-3xl font-medium tracking-[-0.03em] text-ink transition-colors group-hover:text-accent"
      >
        {pts(pkg.points)}
      </span>
      <span className="mt-0.5 text-xs text-muted">{t.common.point}</span>
      <span data-numerals className="mt-4 text-sm font-medium text-ink-soft">
        {groupNumber(pkg.amountMnt)}₮
      </span>
    </button>
  );
}
