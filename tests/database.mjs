import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
grant usage on schema auth,storage,public to authenticated,anon,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant select,insert on storage.objects to authenticated;
`);
await db.exec(
  await readFile(
    new URL("../supabase/migrations/202610290001_osz.sql", import.meta.url),
    "utf8",
  ),
);
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/202610290002_operations.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/202610290003_guest_checkout.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const buyer = randomUUID(),
  other = randomUUID(),
  admin = randomUUID(),
  scanner = randomUUID(),
  unverified = randomUUID(),
  event = randomUUID(),
  type = randomUUID();
await db.query(
  `insert into auth.users values ($1,'buyer@example.test',now()),($2,'other@example.test',now()),($3,'admin@example.test',now()),($4,'scanner@example.test',now()),($5,'unverified@example.test',null)`,
  [buyer, other, admin, scanner, unverified],
);
await db.query(`insert into public.app_roles values($1,'admin')`, [admin]);
await db.query(
  `insert into public.events(id,slug,title,venue,starts_at,ends_at,capacity,status,payment_name,payment_number) values($1,'test-event','Test Event','Lima',now()+interval '1 hour',now()+interval '4 hours',2,'published','Test','999999999')`,
  [event],
);
await db.query(
  `insert into public.ticket_types values($1,$2,'General',6500,2,true)`,
  [type, event],
);
await db.query(`insert into public.event_staff values($1,$2,'scanner')`, [
  event,
  scanner,
]);
async function as(user, aal = "aal1", anonymous = false) {
  await db.exec("reset role");
  await db.query(
    `select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,
    [user, JSON.stringify({ aal, is_anonymous: anonymous })],
  );
  await db.exec("set role authenticated");
}
async function reserve(dni = "12345678", coupon = "", key = randomUUID()) {
  return (
    await db.query(
      `select public.reserve_ticket($1,$2,'Test Buyer',$3,'1990-01-01',$4,$5,true) id`,
      [event, type, dni, coupon, key],
    )
  ).rows[0].id;
}
await test("unverified email cannot reserve", async () => {
  await as(unverified);
  await assert.rejects(() => reserve(), /Verifica/);
});
await test("buyer cannot grant own admin role", async () => {
  await as(buyer);
  await assert.rejects(
    () => db.query(`insert into public.app_roles values($1,'admin')`, [buyer]),
    /permission denied/,
  );
});
let order, second;
await test("price determined in database and idempotency enforced", async () => {
  await as(buyer);
  const key = randomUUID();
  order = await reserve("12345678", "", key);
  assert.equal(await reserve("12345678", "", key), order);
  assert.equal(
    (await db.query("select amount_cents from orders where id=$1", [order]))
      .rows[0].amount_cents,
    6500,
  );
});
await test("duplicate DNI blocked", async () => {
  await assert.rejects(() => reserve(), /reserva activa/);
});
await test("other buyer cannot read or cancel order", async () => {
  await as(other);
  assert.equal((await db.query("select * from orders")).rows.length, 0);
  await assert.rejects(
    () => db.query("select public.cancel_reservation($1)", [order]),
    /Solo puedes/,
  );
});
await test("cannot forge status or price with direct update", async () => {
  await as(buyer);
  await assert.rejects(
    () =>
      db.query(
        "update orders set status='approved',amount_cents=0 where id=$1",
        [order],
      ),
    /permission denied/,
  );
});
await test("aforo prevents a third reservation", async () => {
  await as(other);
  second = await reserve("87654321");
  await assert.rejects(() => reserve("55555555"), /Aforo agotado/);
});
const path = `${buyer}/${order}/receipt.jpg`;
await test("cannot upload receipt to another buyer folder", async () => {
  await as(other);
  await assert.rejects(
    () =>
      db.query(
        "insert into storage.objects(bucket_id,name) values('receipts',$1)",
        [path],
      ),
    /row-level security/,
  );
});
await test("owner can upload and submit receipt; reference required", async () => {
  await as(buyer);
  await db.query(
    "insert into storage.objects(bucket_id,name) values('receipts',$1)",
    [path],
  );
  await assert.rejects(
    () => db.query("select public.submit_payment($1,$2,null)", [order, path]),
    /inválido/,
  );
  await db.query("select public.submit_payment($1,$2,$3)", [
    order,
    path,
    "ABC123",
  ]);
});
await test("other buyer cannot read attached voucher", async () => {
  await as(other);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
});
await test("scanner cannot review payment", async () => {
  await as(scanner, "aal2");
  await assert.rejects(
    () => db.query("select public.review_payment($1,true)", [order]),
    /permiso/,
  );
  assert.equal((await db.query("select * from orders")).rows.length, 0);
});
await test("admin without MFA cannot review payment", async () => {
  await as(admin);
  await assert.rejects(
    () => db.query("select public.review_payment($1,true)", [order]),
    /MFA/,
  );
});
let token;
await test("admin with MFA approves and generates owner-only QR", async () => {
  await db.exec("reset role");
  await db.query(
    "update orders set expires_at=now()-interval '2 days' where id=$1",
    [order],
  );
  await db.query("select private.expire_orders($1)", [event]);
  assert.equal(
    (await db.query("select status from orders where id=$1", [order])).rows[0]
      .status,
    "pending",
  );
  await as(admin, "aal2");
  await assert.rejects(
    () => db.query("select public.review_payment($1,null,null)", [order]),
    /motivo/,
  );
  await db.query("select public.review_payment($1,true)", [order]);
  assert.equal((await db.query("select * from ticket_secrets")).rows.length, 0);
  await as(buyer);
  token = (
    await db.query("select token from ticket_secrets where order_id=$1", [
      order,
    ])
  ).rows[0].token;
  assert.match(token, /^[a-f0-9]{64}$/);
});
await test("review cannot process the same payment twice", async () => {
  await as(admin, "aal2");
  await assert.rejects(
    () => db.query("select public.review_payment($1,true)", [order]),
    /ya fue procesado/,
  );
});
await test("buyer cannot check in own ticket", async () => {
  await as(buyer);
  await assert.rejects(
    () => db.query("select public.check_in($1,$2)", [event, token]),
    /permiso/,
  );
});
await test("scanner rejects unknown QR and permits only one entry", async () => {
  await as(scanner, "aal2");
  assert.equal(
    (
      await db.query("select public.check_in($1,$2) result", [
        event,
        "0".repeat(64),
      ])
    ).rows[0].result.status,
    "invalid",
  );
  assert.equal(
    (await db.query("select public.check_in($1,$2) result", [event, token]))
      .rows[0].result.status,
    "success",
  );
  assert.equal(
    (await db.query("select public.check_in($1,$2) result", [event, token]))
      .rows[0].result.status,
    "used",
  );
});
await test("cancelling unsubmitted reservation releases capacity", async () => {
  await as(other);
  await db.query("select public.cancel_reservation($1)", [second]);
  await reserve("55555555");
});
await test("audit cannot be modified by authenticated admin", async () => {
  await as(admin, "aal2");
  assert.ok((await db.query("select * from audit_log")).rows.length > 0);
  await assert.rejects(
    () => db.exec("delete from audit_log"),
    /permission denied/,
  );
});
await test("full-discount coupon issues a free QR and cannot exceed usage limit", async () => {
  await db.exec("reset role");
  await db.query("update events set capacity=4 where id=$1", [event]);
  await db.query("update ticket_types set quota=4 where id=$1", [type]);
  await db.query(
    "insert into coupons(event_id,code,discount_cents,max_uses,expires_at) values($1,'FREE',6500,1,now()+interval '1 day')",
    [event],
  );
  await as(buyer);
  const free = await reserve("33333333", "FREE");
  const row = (
    await db.query("select status,amount_cents from orders where id=$1", [free])
  ).rows[0];
  assert.equal(row.status, "approved");
  assert.equal(row.amount_cents, 0);
  assert.equal(
    (
      await db.query("select token from ticket_secrets where order_id=$1", [
        free,
      ])
    ).rows.length,
    1,
  );
  await as(other);
  await assert.rejects(() => reserve("44444444", "FREE"), /Cupón agotado/);
});
await test("expired unpaid reservation releases capacity and DNI", async () => {
  await db.exec("reset role");
  await db.query(
    "update orders set expires_at=now()-interval '1 minute' where dni='55555555'",
  );
  await as(other);
  const fresh = await reserve("55555555");
  assert.ok(fresh);
});
await test("worker RPC cannot be invoked by an authenticated admin", async () => {
  await assert.rejects(
    () => db.exec("select public.claim_notifications()"),
    /permission denied/,
  );
});
await test("closed event remains visible to its buyer", async () => {
  await db.exec("reset role");
  await db.query("update events set status='closed' where id=$1", [event]);
  await as(buyer);
  assert.equal(
    (await db.query("select * from events where id=$1", [event])).rows.length,
    1,
  );
});
await test("service worker leases jobs and acknowledges both channels", async () => {
  await db.exec("set role service_role");
  const jobs = (await db.query("select public.claim_notifications() jobs"))
    .rows[0].jobs;
  assert.equal(jobs.length, 3);
  assert.equal(
    (await db.query("select public.claim_notifications() jobs")).rows[0].jobs
      .length,
    0,
  );
  for (const j of jobs) {
    for (const channel of ["email", "telegram"])
      await db.query("select public.ack_notification($1,$2,$3)", [
        j.id,
        j.lease,
        channel,
      ]);
  }
});

const guest = randomUUID();
let guestOrder, linkToken;
await test("guest reserves without password and sees only own order", async () => {
  await db.exec("reset role");
  await db.query("insert into auth.users values($1,null,null)", [guest]);
  await db.query(
    "update events set status='published',capacity=10 where id=$1",
    [event],
  );
  await db.query("update ticket_types set quota=10 where id=$1", [type]);
  await as(guest, "aal1", true);
  await assert.rejects(() => reserve("66666666"), /correo válido/);
  guestOrder = (
    await db.query(
      "select reserve_ticket($1,$2,'Guest Buyer','66666666','1990-01-01','',$3,true,'other@example.test') id",
      [event, type, randomUUID()],
    )
  ).rows[0].id;
  assert.equal((await db.query("select * from orders")).rows.length, 1);
  linkToken = (
    await db.query("select token from order_links where order_id=$1", [
      guestOrder,
    ])
  ).rows[0].token;
  const path = `${guest}/${guestOrder}/voucher.jpg`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('receipts',$1)",
    [path],
  );
  await db.query("select submit_payment($1,$2,'GUEST123')", [guestOrder, path]);
  await assert.rejects(
    () => db.query("select review_payment($1,true)", [guestOrder]),
    /permiso/,
  );
  await assert.rejects(
    () => db.query("select claim_my_guest_orders()"),
    /Verifica/,
  );
});
await test("private email link works without login but never exposes the voucher or DNI", async () => {
  await as(admin, "aal2");
  await db.query("select review_payment($1,true)", [guestOrder]);
  await db.exec("set role anon");
  assert.equal(
    (await db.query("select read_ticket_link($1) data", ["0".repeat(64)]))
      .rows[0].data,
    null,
  );
  const view = (await db.query("select read_ticket_link($1) data", [linkToken]))
    .rows[0].data;
  assert.equal(view.status, "approved");
  assert.match(view.qr, /^[a-f0-9]{64}$/);
  assert.notEqual(view.qr, linkToken);
  assert.equal(view.receipt_path, undefined);
  assert.equal(view.dni, undefined);
  await assert.rejects(
    () => db.query("select * from order_links"),
    /permission denied/,
  );
});
await test("only verified matching email can claim guest orders; old guest loses row access", async () => {
  await as(buyer);
  assert.equal(
    (await db.query("select claim_my_guest_orders() n")).rows[0].n,
    0,
  );
  await as(other);
  assert.equal(
    (await db.query("select claim_my_guest_orders() n")).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select id from orders where id=$1", [guestOrder])).rows
      .length,
    1,
  );
  await as(guest, "aal1", true);
  assert.equal((await db.query("select * from orders")).rows.length, 0);
});
await db.close();
console.log(
  `${passed} database integration tests passed (PostgreSQL/PGlite with mocked Supabase auth/storage).`,
);
