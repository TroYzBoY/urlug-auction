# Load testing

The shape that matters is not steady traffic. It is the last five seconds of
round 6: every remaining bidder holding an SSE connection open, and a burst of
bids arriving inside a window shorter than most HTTP timeouts.

Two things are being measured, and only one of them is throughput:

1. **Bid latency at the tail.** A bid that takes 900ms in round 6 has spent a
   fifth of the clock. p99 matters far more than the mean.
2. **Connection count.** Each viewer holds an SSE stream for up to 2h45m. That
   is a file descriptor and a Postgres LISTEN fan-out entry per viewer, and it
   is the limit that decides how many people can watch one lot.

## Running it

```bash
npm run db:up
npm run db:migrate
node --env-file-if-exists=.env.local --experimental-strip-types load/seed.ts
k6 run load/bid-storm.js
```

`k6` is not a dependency of this project — install it separately
(`winget install k6`, `brew install k6`).

## Reading the result

| Metric | Look for |
| ------ | -------- |
| `http_req_duration{name:bid}` p99 | under 300ms. Above 1s, round 6 is broken. |
| `bid_rejected_rate` | high is CORRECT — one bidder wins each price. |
| `bid_error_rate` | must be ~0. Anything else is the server failing, not rejecting. |
| `sse_connected` | should equal the VU count. Short of it means connections are being dropped. |

⚠ A high rejection rate is the system working. Twenty bidders firing at the same
price should produce one acceptance and nineteen `too-low` — that is the row
lock doing its job. Treat a LOW rejection rate under contention as the alarm.
