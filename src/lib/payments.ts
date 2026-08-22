import "server-only";
import { IS_PRODUCTION } from "./env";
import { createHmac, timingSafeEqual } from "node:crypto";
import { absoluteUrl } from "./site";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PAYMENTS — one seam, one provider to swap
 *
 * Shaped like `src/lib/sms.ts` and for the same reason: the provider is
 * somebody else's system with its own credentials, so everything that touches
 * it lives behind one interface and the rest of the app never sees it.
 *
 * ⚠ NOT WIRED. QPay needs merchant credentials this repository does not have.
 * What is here is the full flow with the provider call stubbed:
 *
 *   createInvoice  → returns a payment URL and the provider's reference
 *   verifyCallback → decides whether an incoming callback is genuine
 *
 * In development the stub returns a URL that settles the top-up immediately,
 * so the wallet, the ledger and the balance can all be exercised end to end
 * without an account. It refuses to run in production — see below.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const QPAY_URL = process.env.QPAY_API_URL ?? null;
const QPAY_USERNAME = process.env.QPAY_USERNAME ?? null;
const QPAY_PASSWORD = process.env.QPAY_PASSWORD ?? null;
const QPAY_INVOICE_CODE = process.env.QPAY_INVOICE_CODE ?? null;
/** Shared secret the provider signs its callbacks with. */
const QPAY_CALLBACK_SECRET = process.env.QPAY_CALLBACK_SECRET ?? null;

/*
 * The header the signature arrives in. Overridable because providers disagree
 * — X-Signature, X-Hub-Signature-256, X-QPay-Signature — and the name is the
 * one thing about this that a sandbox test will immediately tell you.
 */
const SIGNATURE_HEADER =
  process.env.QPAY_SIGNATURE_HEADER ?? "x-qpay-signature";

export const paymentsConfigured = Boolean(
  QPAY_URL && QPAY_USERNAME && QPAY_PASSWORD && QPAY_INVOICE_CODE,
);

export interface Invoice {
  /** Where to send the bidder to pay. */
  paymentUrl: string;
  /** The provider's own id for this invoice. */
  providerRef: string;
}

export interface InvoiceRequest {
  /** Our reference, which the callback must carry back. */
  reference: string;
  amountMnt: number;
  description: string;
}

export async function createInvoice(req: InvoiceRequest): Promise<Invoice> {
  if (!paymentsConfigured) {
    if (IS_PRODUCTION) {
      /*
       * Loud, not silent. A production wallet that quietly hands out free
       * points is worse than one that is plainly broken — the first is
       * discovered by whoever notices they can bid without paying.
       */
      throw new Error(
        "Payment provider is not configured. Set QPAY_API_URL, QPAY_USERNAME, " +
          "QPAY_PASSWORD and QPAY_INVOICE_CODE before taking payments.",
      );
    }

    /*
     * Development only. The "payment page" is our own confirm route, so the
     * whole flow — pending row, redirect, callback, credit — runs without a
     * merchant account. The route itself re-checks NODE_ENV.
     */
    return {
      paymentUrl: absoluteUrl(
        `/api/payments/dev-confirm?reference=${encodeURIComponent(req.reference)}`,
      ),
      providerRef: `dev-${req.reference}`,
    };
  }

  /*
   * ── The real call, for whoever wires it ──────────────────────────────────
   *
   * QPay is a two-step API: authenticate for a bearer token, then POST the
   * invoice. The token is short-lived and should be cached rather than fetched
   * per invoice. `callback_url` must be publicly reachable, which it is not on
   * localhost — use a tunnel when testing against the sandbox.
   *
   * Left as a throw rather than a half-written request: a payment integration
   * that looks finished but was never run against the sandbox is the most
   * expensive kind of code to inherit.
   */
  throw new Error(
    "QPay integration is not implemented. See the notes in src/lib/payments.ts.",
  );
}

/**
 * Whether an incoming callback really came from the provider.
 *
 * ⚠ Returns false when no secret is configured, which means the callback route
 * rejects everything. That is the correct default: an endpoint that credits
 * points and does not authenticate its caller is a way to mint money by curl.
 * The development flow does not go through here — it uses a separate route
 * that is disabled in production.
 *
 * ⚠ The scheme below — HMAC-SHA256 over the raw body, hex, in a configurable
 * header — is the common one, but it is NOT confirmed against QPay's sandbox.
 * Verify the algorithm, the encoding and the header name before taking real
 * payments; a signature check that always fails looks exactly like a provider
 * outage, and one that always passes looks like nothing at all.
 */
export async function verifyCallback(
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  if (!QPAY_CALLBACK_SECRET) return false;

  const provided = headers.get(SIGNATURE_HEADER);
  if (!provided) return false;

  /*
   * HMAC of the RAW body. Re-serialising parsed JSON changes key order and
   * whitespace, and the signature stops matching — which is why the route
   * reads `request.text()` before it reads `request.json()`.
   */
  const expected = createHmac("sha256", QPAY_CALLBACK_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");

  // Providers differ on case and on a `sha256=` prefix; normalise both.
  const normalised = provided.trim().replace(/^sha256=/i, "").toLowerCase();

  const a = Buffer.from(normalised, "hex");
  const b = Buffer.from(expected, "hex");
  /*
   * Length is checked first because `timingSafeEqual` THROWS on a mismatch
   * rather than returning false — and an exception here would be caught by the
   * route and reported as a verification error, which is the same outcome but
   * noisier. Comparing lengths leaks only the length, which the header already
   * reveals.
   */
  if (a.length !== b.length || a.length === 0) return false;

  return timingSafeEqual(a, b);
}
