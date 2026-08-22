/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FIRST ADMIN
 *
 *   npm run db:make-admin -- --phone 99112233
 *   npm run db:make-admin -- --phone 99112233 --email you@example.com --name "Батбаяр"
 *   npm run db:make-admin -- --phone 99112233 --create --password "secret-123"
 *
 * Promoting a user needs an admin, and the first admin has nobody to promote
 * them — so it happens here, on the machine that holds the database, rather
 * than through a page. There is no "first user becomes admin" rule and no
 * bootstrap route: both are doors that stay open long after they were needed,
 * and the second one is reachable from the internet.
 *
 * ⚠ Accounts are identified by PHONE NUMBER. An email is contact information
 * and is never a login credential — nothing in `src/lib/session.ts` or
 * `src/app/actions/auth.ts` reads it. `--email` records one; it does not create
 * a way to sign in.
 *
 * `--create` makes the account if it does not exist, marks the phone verified
 * (there is no SMS provider on a developer's machine) and sets the password
 * given. Without it, the script only promotes an account that already
 * registered — which is the safer default, because it means the password was
 * chosen by the person who owns it and never passed through a shell history.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { randomInt } from "node:crypto";
import { Client } from "pg";
import { hash } from "@node-rs/argon2";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]!;
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = process.argv[i + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    i += 1;
  } else {
    args.set(key, "true");
  }
}

const phone = args.get("phone");
const email = args.get("email") ?? null;
const name = args.get("name") ?? "Админ";
const create = args.get("create") === "true";
const password = args.get("password");
const role = (args.get("role") ?? "admin") as "admin" | "staff" | "bidder";

if (!phone || !/^[89]\d{7}$/.test(phone)) {
  console.error(
    "Usage: npm run db:make-admin -- --phone 99112233 [--create --password ...]\n" +
      "The phone must be 8 digits starting 8 or 9 — the same format the sign-up\n" +
      "form accepts, because this account signs in through that form.",
  );
  process.exit(1);
}
if (create && (!password || password.length < 8)) {
  console.error("--create needs --password with at least 8 characters.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. See .env.example.");
  process.exit(1);
}

/* Same options as src/lib/password.ts. They have to match or the hash written
   here will not verify at sign-in. */
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const client = new Client({ connectionString });
await client.connect();

try {
  await client.query("BEGIN");

  const existing = await client.query<{ id: number; paddle: string; role: string }>(
    "SELECT id, paddle, role FROM users WHERE phone = $1 FOR UPDATE",
    [phone],
  );
  let user = existing.rows[0];

  if (!user) {
    if (!create) {
      console.error(
        `No account with phone ${phone}.\n` +
          "Register through /register first, then run this again — or pass\n" +
          "--create --password ... to make the account here.",
      );
      await client.query("ROLLBACK");
      process.exit(1);
    }

    /* Same shape as allocatePaddle in src/lib/repo/users.ts. */
    let paddle = "";
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = `Т-${100 + randomInt(0, 900)}`;
      const taken = await client.query("SELECT 1 FROM users WHERE paddle = $1", [
        candidate,
      ]);
      if (taken.rowCount === 0) {
        paddle = candidate;
        break;
      }
    }
    if (!paddle) throw new Error("Could not allocate a free paddle");

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO users (name, phone, email, password_hash, paddle,
                          phone_verified_at, date_of_birth, role)
       VALUES ($1, $2, $3, $4, $5, now(), '1990-01-01', $6::user_role)
       RETURNING id`,
      [name, phone, email, await hash(password!, ARGON), paddle, role],
    );
    const id = inserted.rows[0]!.id;
    await client.query("INSERT INTO balances (user_id, pts) VALUES ($1, 0)", [id]);
    user = { id, paddle, role };

    console.info(`Created ${paddle} (${phone}) as ${role}.`);
  } else {
    await client.query(
      `UPDATE users
          SET role = $2::user_role,
              email = COALESCE($3, email),
              updated_at = now()
        WHERE id = $1`,
      [user.id, role, email],
    );
    console.info(`${user.paddle} (${phone}): ${user.role} → ${role}.`);
  }

  /*
   * Audited like any other role change, with a null actor — nobody was signed
   * in. A promotion that leaves no trace is exactly the one somebody would want
   * to leave no trace.
   */
  await client.query(
    `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, detail)
     VALUES (NULL, 'admin.role_changed', 'user', $1, $2)`,
    [
      String(user.id),
      JSON.stringify({ to: role, email, via: "db/make-admin.ts", created: create }),
    ],
  );

  await client.query("COMMIT");
  console.info("Sign in at /login with the phone number and password.");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Failed, rolled back:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
