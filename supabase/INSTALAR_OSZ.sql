-- OSZ Events: ejecutar una sola vez en el proyecto NUEVO nvlxyzebwrcybocfjehj.

-- Instalacion completa; si falla, la transaccion no aplica cambios parciales.

BEGIN;

-- OSZ Events. Apply to a NEW Supabase project. All money amounts are integer PEN cents.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

create table public.app_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role = 'admin')
);
create table public.events (
 id uuid primary key default gen_random_uuid(), slug text unique not null check (slug ~ '^[a-z0-9-]{3,80}$'),
 title text not null check (length(title) between 3 and 120), description text not null default '',
 category text not null default 'Música', city text not null default 'Lima', venue text not null,
 starts_at timestamptz not null, ends_at timestamptz not null,
 capacity integer not null check (capacity > 0), min_age integer not null default 18 check (min_age between 0 and 100),
 status text not null default 'draft' check (status in ('draft','published','closed')),
 cover_url text not null default '', payment_name text not null, payment_number text not null,
 created_at timestamptz not null default now(), check (ends_at > starts_at)
);
create table public.event_staff (
 event_id uuid references public.events(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade,
 role text not null check (role in ('reviewer','scanner')), primary key(event_id,user_id)
);
create table public.ticket_types (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
 name text not null, price_cents integer not null check (price_cents >= 0),
 quota integer not null check (quota > 0), active boolean not null default true
);
create table public.coupons (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
 code text not null check (code ~ '^[A-Z0-9-]{3,30}$'), discount_cents integer not null check(discount_cents > 0),
 max_uses integer not null check(max_uses > 0), expires_at timestamptz not null,
 active boolean not null default true, unique(event_id,code)
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 event_id uuid not null references public.events(id), ticket_type_id uuid not null references public.ticket_types(id),
 attendee_name text not null, dni text not null check(dni ~ '^[0-9]{8}$'), birth_date date not null,
 coupon_id uuid references public.coupons(id), amount_cents integer not null check(amount_cents >= 0),
 status text not null default 'reserved' check(status in ('reserved','pending','approved','rejected','cancelled','expired','checked_in')),
 payment_reference text, receipt_path text, rejection_reason text,
 terms_version text not null default '2026-10-29', terms_accepted_at timestamptz not null default now(),
 expires_at timestamptz not null default (now() + interval '30 minutes'),
 created_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references auth.users(id),
 checked_in_at timestamptz, checked_in_by uuid references auth.users(id),
 idempotency_key uuid not null, unique(user_id,idempotency_key)
);
create unique index one_attendee_per_event on public.orders(event_id,dni)
 where status in ('reserved','pending','approved','checked_in');
create unique index one_payment_per_event on public.orders(event_id,payment_reference)
 where payment_reference is not null and status in ('pending','approved','checked_in');
create index orders_owner on public.orders(user_id,created_at desc);
create index orders_event_status on public.orders(event_id,status);
create table public.ticket_secrets (
 order_id uuid primary key references public.orders(id),
 token text not null unique default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''))
);
create table public.audit_log (
 id bigint generated always as identity primary key, actor_id uuid, event_id uuid,
 action text not null, entity_id uuid, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create table private.scan_attempts (user_id uuid not null, attempted_at timestamptz not null default now());
create index scan_attempts_user_time on private.scan_attempts(user_id,attempted_at);
create table private.notification_outbox (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
 kind text not null check(kind in ('payment_submitted','approved','rejected')),
 created_at timestamptz not null default now(), delivered_at timestamptz, unique(order_id,kind)
);

create function private.verified() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null);
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select private.verified() and coalesce(auth.jwt()->>'aal','')='aal2'
 and exists(select 1 from public.app_roles where user_id=auth.uid() and role='admin');
$$;
create function private.staff(e uuid, roles text[]) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_admin() or (private.verified() and coalesce(auth.jwt()->>'aal','')='aal2'
 and exists(select 1 from public.event_staff where user_id=auth.uid() and event_id=e and role=any(roles)));
$$;
create function private.expire_orders(e uuid) returns void language sql security definer set search_path = '' as $$
 update public.orders set status='expired' where event_id=e and status='reserved' and expires_at < now();
$$;

alter table public.app_roles enable row level security;
alter table public.events enable row level security;
alter table public.event_staff enable row level security;
alter table public.ticket_types enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.ticket_secrets enable row level security;
alter table public.audit_log enable row level security;
create policy roles_read_self on public.app_roles for select to authenticated using(user_id=auth.uid());
create policy staff_read_self on public.event_staff for select to authenticated using(user_id=auth.uid() or private.is_admin());
create policy events_read on public.events for select to anon, authenticated using(status='published' or private.staff(id,array['reviewer','scanner']));
create policy events_insert on public.events for insert to authenticated with check(private.is_admin());
-- Event changes go through a locked RPC, to preserve capacity under concurrent sales.
create policy types_read on public.ticket_types for select to anon,authenticated using(
 exists(select 1 from public.events e where e.id=event_id and (e.status='published' or private.staff(e.id,array['reviewer','scanner'])))
);
create policy types_insert on public.ticket_types for insert to authenticated with check(private.is_admin());
create policy coupons_read on public.coupons for select to authenticated using(private.is_admin());
create policy coupons_insert on public.coupons for insert to authenticated with check(private.is_admin());
create policy orders_read on public.orders for select to authenticated using(
 (user_id=auth.uid() and private.verified()) or private.staff(event_id,array['reviewer'])
);
create policy secrets_read on public.ticket_secrets for select to authenticated using(exists(
 select 1 from public.orders o where o.id=order_id and o.user_id=auth.uid() and private.verified() and o.status in ('approved','checked_in')
));
create policy audit_read on public.audit_log for select to authenticated using(private.is_admin());
revoke all on public.app_roles,public.events,public.event_staff,public.ticket_types,public.coupons,public.orders,public.ticket_secrets,public.audit_log from anon,authenticated;
grant select on public.events,public.ticket_types to anon,authenticated;
grant select on public.app_roles,public.event_staff,public.coupons,public.orders,public.ticket_secrets,public.audit_log to authenticated;
grant insert on public.events,public.ticket_types,public.coupons to authenticated;

create function public.reserve_ticket(p_event uuid,p_type uuid,p_name text,p_dni text,p_birth date,p_coupon text,p_key uuid,p_terms boolean)
 returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.events; t public.ticket_types; c public.coupons; oid uuid; used integer; amount integer;
begin
 if not private.verified() then raise exception 'Verifica tu correo para reservar.'; end if;
 if p_terms is distinct from true or p_name is null or p_dni is null or length(trim(p_name)) not between 3 and 120 or p_dni !~ '^[0-9]{8}$'
 or p_birth is null or p_birth > current_date or p_birth < current_date-interval '110 years' then raise exception 'Revisa los datos del asistente y acepta las condiciones.'; end if;
 select * into e from public.events where id=p_event for update;
 if not found or e.status<>'published' or e.starts_at<=now() then raise exception 'Este evento no está disponible para compras.'; end if;
 select id into oid from public.orders where user_id=auth.uid() and idempotency_key=p_key;
 if found then return oid; end if;
 perform private.expire_orders(e.id);
 if extract(year from age((e.starts_at at time zone 'America/Lima')::date,p_birth)) < e.min_age then raise exception 'No cumples la edad mínima del evento.'; end if;
 if (select count(*) from public.orders where user_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Límite temporal de reservas. Intenta más tarde.'; end if;
 select * into t from public.ticket_types where id=p_type and event_id=e.id and active;
 if not found then raise exception 'Tipo de entrada no disponible.'; end if;
 select count(*) into used from public.orders where event_id=e.id and status in ('reserved','pending','approved','checked_in');
 if used>=e.capacity then raise exception 'Aforo agotado.'; end if;
 if (select count(*) from public.orders where ticket_type_id=t.id and status in ('reserved','pending','approved','checked_in'))>=t.quota then raise exception 'Entradas de esta categoría agotadas.'; end if;
 amount:=t.price_cents;
 if trim(coalesce(p_coupon,''))<>'' then
  select * into c from public.coupons where event_id=e.id and code=upper(trim(p_coupon)) and active and expires_at>now();
  if not found then raise exception 'Cupón inválido o vencido.'; end if;
  if (select count(*) from public.orders where coupon_id=c.id and status in ('reserved','pending','approved','checked_in'))>=c.max_uses then raise exception 'Cupón agotado.'; end if;
  amount:=greatest(0,amount-c.discount_cents);
 end if;
 insert into public.orders(user_id,event_id,ticket_type_id,attendee_name,dni,birth_date,coupon_id,amount_cents,idempotency_key)
 values(auth.uid(),e.id,t.id,trim(p_name),p_dni,p_birth,c.id,amount,p_key) returning id into oid;
 insert into public.audit_log(actor_id,event_id,action,entity_id) values(auth.uid(),e.id,'reserved',oid);
 if amount=0 then
  update public.orders set status='approved',reviewed_at=now() where id=oid;
  insert into public.ticket_secrets(order_id) values(oid);
  insert into private.notification_outbox(order_id,kind) values(oid,'approved');
  insert into public.audit_log(actor_id,event_id,action,entity_id) values(auth.uid(),e.id,'free_ticket_issued',oid);
 end if;
 return oid;
exception when unique_violation then raise exception 'Ya existe una reserva activa para ese DNI o solicitud.';
end $$;

create function public.submit_payment(p_order uuid,p_path text,p_reference text) returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or o.user_id<>auth.uid() or not private.verified() then raise exception 'Acceso denegado.'; end if;
 if o.status<>'reserved' or o.expires_at<now() then raise exception 'La reserva ya no admite comprobantes.'; end if;
 if p_reference is null or p_reference !~ '^[A-Za-z0-9-]{4,40}$' then raise exception 'Número de operación inválido.'; end if;
 if p_path not like auth.uid()::text||'/'||o.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='receipts' and name=p_path) then raise exception 'Adjunta primero el comprobante.'; end if;
 update public.orders set receipt_path=p_path,payment_reference=upper(p_reference),status='pending',expires_at=now()+interval '24 hours' where id=o.id;
 insert into public.audit_log(actor_id,event_id,action,entity_id) values(auth.uid(),o.event_id,'payment_submitted',o.id);
 insert into private.notification_outbox(order_id,kind) values(o.id,'payment_submitted');
exception when unique_violation then raise exception 'Esta operación ya está registrada para el evento.';
end $$;

create function public.cancel_reservation(p_order uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.orders set status='cancelled' where id=p_order and user_id=auth.uid() and private.verified() and status='reserved';
 if not found then raise exception 'Solo puedes cancelar una reserva sin comprobante.'; end if;
end $$;

create function public.review_payment(p_order uuid,p_approve boolean,p_reason text default '') returns text language plpgsql security definer set search_path = '' as $$
declare o public.orders; eid uuid;
begin
 select event_id into eid from public.orders where id=p_order;
 if eid is null or not private.staff(eid,array['reviewer']) then raise exception 'Se requiere permiso de revisión y MFA.'; end if;
 perform 1 from public.events where id=eid for update;
 perform private.expire_orders(eid);
 select * into o from public.orders where id=p_order for update;
 if o.status<>'pending' then raise exception 'El pago ya fue procesado o venció.'; end if;
 if o.receipt_path is null then raise exception 'No hay comprobante.'; end if;
 if p_approve is null or (not p_approve and length(trim(coalesce(p_reason,'')))<5) then raise exception 'Indica el motivo del rechazo.'; end if;
 update public.orders set status=case when p_approve then 'approved' else 'rejected' end,
 rejection_reason=case when p_approve then null else left(trim(p_reason),500) end,reviewed_at=now(),reviewed_by=auth.uid() where id=o.id;
 if p_approve then insert into public.ticket_secrets(order_id) values(o.id); end if;
 insert into public.audit_log(actor_id,event_id,action,entity_id) values(auth.uid(),eid,case when p_approve then 'approved' else 'rejected' end,o.id);
 insert into private.notification_outbox(order_id,kind) values(o.id,case when p_approve then 'approved' else 'rejected' end);
 return case when p_approve then 'approved' else 'rejected' end;
end $$;

create function public.check_in(p_event uuid,p_token text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders; eid uuid; result text;
begin
 if not private.staff(p_event,array['scanner','reviewer']) then raise exception 'Se requiere permiso de puerta y MFA.'; end if;
 -- Per-user transaction lock makes the rate limit concurrency-safe.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 delete from private.scan_attempts where user_id=auth.uid() and attempted_at<now()-interval '1 minute';
 if (select count(*) from private.scan_attempts where user_id=auth.uid())>=60 then raise exception 'Demasiados escaneos. Espera un minuto.'; end if;
 insert into private.scan_attempts(user_id) values(auth.uid());
 if not exists(select 1 from public.events where id=p_event and status='published' and now() between starts_at-interval '4 hours' and ends_at) then return jsonb_build_object('status','closed','message','El acceso al evento no está abierto.'); end if;
 select r.* into o from public.orders r join public.ticket_secrets s on s.order_id=r.id where s.token=p_token and r.event_id=p_event for update of r;
 if not found then return jsonb_build_object('status','invalid','message','Entrada no válida para este evento.'); end if;
 if o.status='checked_in' then return jsonb_build_object('status','used','message','Esta entrada ya ingresó.','name',o.attendee_name,'time',o.checked_in_at); end if;
 if o.status<>'approved' then return jsonb_build_object('status','invalid','message','Entrada no habilitada.'); end if;
 update public.orders set status='checked_in',checked_in_at=now(),checked_in_by=auth.uid() where id=o.id;
 insert into public.audit_log(actor_id,event_id,action,entity_id) values(auth.uid(),o.event_id,'checked_in',o.id);
 return jsonb_build_object('status','success','message','Ingreso autorizado.','name',o.attendee_name,'dni_last4',right(o.dni,4));
end $$;

create function public.update_event(p_id uuid,p_title text,p_description text,p_venue text,p_city text,p_starts timestamptz,p_ends timestamptz,p_capacity int,p_status text,p_payment_name text,p_payment_number text)
 returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Se requiere administrador y MFA.'; end if;
 perform 1 from public.events where id=p_id for update;
 perform private.expire_orders(p_id);
 if p_capacity<(select count(*) from public.orders where event_id=p_id and status in ('reserved','pending','approved','checked_in')) then raise exception 'La capacidad no puede ser menor a las reservas y ventas activas.'; end if;
 update public.events set title=p_title,description=p_description,venue=p_venue,city=p_city,starts_at=p_starts,ends_at=p_ends,capacity=p_capacity,status=p_status,payment_name=p_payment_name,payment_number=p_payment_number where id=p_id;
 insert into public.audit_log(actor_id,event_id,action,entity_id) values(auth.uid(),p_id,'event_updated',p_id);
end $$;

create function public.assign_staff(p_event uuid,p_email text,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 if not private.is_admin() then raise exception 'Se requiere administrador y MFA.'; end if;
 select id into uid from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if not found then raise exception 'La persona debe registrarse y verificar su correo primero.'; end if;
 if p_role='remove' then delete from public.event_staff where event_id=p_event and user_id=uid;
 else insert into public.event_staff(event_id,user_id,role) values(p_event,uid,p_role) on conflict(event_id,user_id) do update set role=excluded.role; end if;
 insert into public.audit_log(actor_id,event_id,action,entity_id,detail) values(auth.uid(),p_event,'staff_changed',uid,jsonb_build_object('role',p_role));
end $$;

-- Default function privileges are intentionally closed.
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.verified(),private.is_admin(),private.staff(uuid,text[]) to authenticated,anon;
revoke execute on function public.reserve_ticket(uuid,uuid,text,text,date,text,uuid,boolean),public.submit_payment(uuid,text,text),public.cancel_reservation(uuid),public.review_payment(uuid,boolean,text),public.check_in(uuid,text),public.update_event(uuid,text,text,text,text,timestamptz,timestamptz,int,text,text,text),public.assign_staff(uuid,text,text) from public,anon;
grant execute on function public.reserve_ticket(uuid,uuid,text,text,date,text,uuid,boolean),public.submit_payment(uuid,text,text),public.cancel_reservation(uuid),public.review_payment(uuid,boolean,text),public.check_in(uuid,text),public.update_event(uuid,text,text,text,text,timestamptz,timestamptz,int,text,text,text),public.assign_staff(uuid,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('receipts','receipts',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy receipts_insert on storage.objects for insert to authenticated with check(
 bucket_id='receipts' and private.verified() and exists(select 1 from public.orders o where
 o.user_id=auth.uid() and o.status='reserved' and o.expires_at>now()
 and name like auth.uid()::text||'/'||o.id::text||'/%')
);
create policy receipts_read on storage.objects for select to authenticated using(
 bucket_id='receipts' and exists(select 1 from public.orders o where o.receipt_path=name and
 ((o.user_id=auth.uid() and private.verified()) or private.staff(o.event_id,array['reviewer'])))
);
-- No update/delete policy: a submitted receipt cannot be silently replaced.


-- Buyers retain access to event details after sales close.
create function private.owns_event_ticket(e uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.verified() and exists(select 1 from public.orders where event_id=e and user_id=auth.uid());
$$;
revoke execute on function private.owns_event_ticket(uuid) from public;
grant execute on function private.owns_event_ticket(uuid) to anon,authenticated;
drop policy events_read on public.events;
create policy events_read on public.events for select to anon,authenticated using(status='published' or private.staff(id,array['reviewer','scanner']) or private.owns_event_ticket(id));

-- Editorial artwork: uploaded images only, no user-supplied arbitrary URL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('event-images','event-images',true,5242880,array['image/jpeg']);
create policy art_insert on storage.objects for insert to authenticated with check(bucket_id='event-images' and private.is_admin());
create function public.set_event_cover(p_event uuid,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare project_url text;
begin
 if not private.is_admin() then raise exception 'Se requiere administrador y MFA.'; end if;
 if p_path not like p_event::text||'/%' or not exists(select 1 from storage.objects where bucket_id='event-images' and name=p_path) then raise exception 'Imagen no válida.'; end if;
 -- Store a relative object path, resolved against the configured Supabase URL in the client.
 update public.events set cover_url='storage:'||p_path where id=p_event;
 if not found then raise exception 'Evento no encontrado.'; end if;
 insert into public.audit_log(actor_id,event_id,action,entity_id) values(auth.uid(),p_event,'cover_updated',p_event);
end $$;
revoke execute on function public.set_event_cover(uuid,text) from public,anon;
grant execute on function public.set_event_cover(uuid,text) to authenticated;

-- Outbox delivery: leased jobs and per-channel acknowledgements. Backend worker only.
alter table private.notification_outbox add column lease_id uuid, add column leased_until timestamptz,
 add column attempts integer not null default 0, add column email_sent boolean not null default false,
 add column telegram_sent boolean not null default false;
create function public.claim_notifications() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 with batch as (
  select id from private.notification_outbox where delivered_at is null and attempts<10 and (leased_until is null or leased_until<now())
  order by created_at for update skip locked limit 10
 ), claimed as (
  update private.notification_outbox n set lease_id=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=attempts+1
  from batch b where n.id=b.id returning n.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease',c.lease_id,'kind',c.kind,'order_id',c.order_id,
 'email',u.email,'event_title',e.title,'email_sent',c.email_sent,'telegram_sent',c.telegram_sent)),'[]') into result
 from claimed c join public.orders o on o.id=c.order_id join auth.users u on u.id=o.user_id join public.events e on e.id=o.event_id;
 return result;
end $$;
create function public.ack_notification(p_id uuid,p_lease uuid,p_channel text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_channel not in ('email','telegram') then raise exception 'Invalid channel'; end if;
 update private.notification_outbox set email_sent=email_sent or p_channel='email',telegram_sent=telegram_sent or p_channel='telegram'
 where id=p_id and lease_id=p_lease;
 update private.notification_outbox set delivered_at=now() where id=p_id and lease_id=p_lease and email_sent and telegram_sent;
end $$;
revoke execute on function public.claim_notifications(),public.ack_notification(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_notifications(),public.ack_notification(uuid,uuid,text) to service_role;


COMMIT;
