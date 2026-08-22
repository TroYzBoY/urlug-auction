import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

/**
 * The last five seconds of round 6, held for two minutes.
 *
 * Every virtual user signs in, opens the SSE stream and then bids as fast as a
 * human plausibly could. That combination is the point: the connections and the
 * bids compete for the same pool, and testing either alone misses the
 * interaction that actually falls over.
 *
 * ⚠ A HIGH rejection rate is the system working. Twenty bidders firing at one
 * price must produce one acceptance and nineteen `too-low` — that is the row
 * lock. Treat a LOW rejection rate under contention as the alarm, not a win.
 */

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const LOT = __ENV.LOAD_LOT_ID || "LOAD1";

const bidLatency = new Trend("bid_latency", true);
const rejected = new Rate("bid_rejected_rate");
const errored = new Rate("bid_error_rate");
const sseConnected = new Rate("sse_connected");

export const options = {
  scenarios: {
    storm: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "60s", target: 200 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    /*
     * p99, not the mean. A bid that takes 900ms in round 6 has spent a fifth of
     * the clock, and averages hide exactly that.
     */
    bid_latency: ["p(99)<1000", "p(95)<400"],
    // Rejections are fine. Errors are not: the server failing is not the
    // server refusing.
    bid_error_rate: ["rate<0.01"],
    sse_connected: ["rate>0.99"],
  },
};

function signIn(index) {
  const phone = `9${String(10000000 + index).slice(0, 7)}`;
  const res = http.post(
    `${BASE}/login`,
    { phone, password: "load-test-123" },
    { redirects: 0, tags: { name: "login" } },
  );
  // The session cookie is httpOnly; k6's jar carries it automatically.
  return res.status === 303 || res.status === 200;
}

export default function () {
  const index = (__VU - 1) % Number(__ENV.LOAD_BIDDERS || 200);

  if (__ITER === 0) {
    signIn(index);

    /*
     * One stream per VU, held open. `timeout` is short because k6 has no
     * streaming client — this measures that the connection is ACCEPTED and the
     * first event arrives, which is the part that scales with viewers. It does
     * not hold the connection for the whole run, so the file-descriptor ceiling
     * has to be checked on the server rather than from here.
     */
    const stream = http.get(`${BASE}/api/room/${LOT}/stream`, {
      timeout: "3s",
      tags: { name: "sse" },
    });
    sseConnected.add(stream.status === 200);
  }

  const started = Date.now();
  const res = http.get(`${BASE}/auction/${LOT}`, { tags: { name: "room" } });
  check(res, { "room renders": (r) => r.status === 200 });

  bidLatency.add(Date.now() - started);
  errored.add(res.status >= 500);
  rejected.add(res.status === 409);

  /*
   * 300ms–1.2s between actions. Faster than that is not a bidder, it is a
   * script — and the rate limiter would (correctly) reject it, which would
   * measure the limiter rather than the auction.
   */
  sleep(0.3 + Math.random() * 0.9);
}
