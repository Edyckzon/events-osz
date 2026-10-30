-- Ejecutar una sola vez despues de INSTALAR_OSZ.sql
BEGIN;
-- Incremental update: apply AFTER 001 and 002. Does not delete existing purchases.
create function private.can_buy() returns boolean language sql stable security definer set search_path='' as $$
 select private.verified() or (coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and exists(select 1 from auth.users where id=auth.uid()));
$$;
revoke execute on function private.can_buy() from public;
grant execute on function private.can_buy() to authenticated,anon;
alter table public.orders add column contact_email text, add column guest_purchase boolean not null default false;
update public.orders o set contact_email=u.email from auth.users u where o.user_id=u.id;
create table public.order_links(order_id uuid primary key references public.orders(id),token text not null unique default (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')));
alter table public.order_links enable row level security;
revoke all on public.order_links from public,anon,authenticated;
grant select on public.order_links to authenticated;
create policy links_owner on public.order_links for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.user_id=auth.uid() and private.can_buy()));
insert into public.order_links(order_id) select id from public.orders;
create function private.make_order_link() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.order_links(order_id) values(new.id); return new; end $$;
revoke execute on function private.make_order_link() from public,anon,authenticated;
create trigger order_link_after_insert after insert on public.orders for each row execute function private.make_order_link();
drop function public.reserve_ticket(uuid,uuid,text,text,date,text,uuid,boolean);
create function public.reserve_ticket(p_event uuid,p_type uuid,p_name text,p_dni text,p_birth date,p_coupon text,p_key uuid,p_terms boolean,p_email text default null)
 returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.events; t public.ticket_types; c public.coupons; oid uuid; used integer; amount integer;
begin
 if not private.can_buy() then raise exception 'Verifica tu correo para reservar.'; end if;
 if p_terms is distinct from true or p_name is null or p_dni is null or length(trim(p_name)) not between 3 and 120 or p_dni !~ '^[0-9]{8}$'
 or p_birth is null or p_birth > current_date or p_birth < current_date-interval '110 years' then raise exception 'Revisa los datos del asistente y acepta las condiciones.'; end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and (p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then raise exception 'Indica un correo válido para recibir tu entrada.'; end if;
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
 insert into public.orders(user_id,event_id,ticket_type_id,attendee_name,dni,birth_date,coupon_id,amount_cents,idempotency_key,contact_email,guest_purchase)
 values(auth.uid(),e.id,t.id,trim(p_name),p_dni,p_birth,c.id,amount,p_key,case when coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then lower(trim(p_email)) else (select email from auth.users where id=auth.uid()) end,coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) returning id into oid;
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


revoke execute on function public.reserve_ticket(uuid,uuid,text,text,date,text,uuid,boolean,text) from public,anon;
grant execute on function public.reserve_ticket(uuid,uuid,text,text,date,text,uuid,boolean,text) to authenticated;
drop policy orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using((user_id=auth.uid() and private.can_buy()) or private.staff(event_id,array['reviewer']));
drop policy secrets_read on public.ticket_secrets;
create policy secrets_read on public.ticket_secrets for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.user_id=auth.uid() and private.can_buy() and o.status in ('approved','checked_in')));
drop policy receipts_insert on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated with check(bucket_id='receipts' and private.can_buy() and exists(select 1 from public.orders o where o.user_id=auth.uid() and o.status='reserved' and o.expires_at>now() and name like auth.uid()::text||'/'||o.id::text||'/%'));
drop policy receipts_read on storage.objects;
create policy receipts_read on storage.objects for select to authenticated using(bucket_id='receipts' and exists(select 1 from public.orders o where o.receipt_path=name and ((o.user_id=auth.uid() and private.can_buy()) or private.staff(o.event_id,array['reviewer']))));
create or replace function private.owns_event_ticket(e uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.can_buy() and exists(select 1 from public.orders where event_id=e and user_id=auth.uid()); $$;
-- Email link is a separate high-entropy read-only bearer secret, never the gate QR.
create function public.read_ticket_link(p_token text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'name',o.attendee_name,'status',o.status,'amount_cents',o.amount_cents,'reason',o.rejection_reason,'event_title',e.title,'venue',e.venue,'starts_at',e.starts_at,'qr',case when o.status in ('approved','checked_in') then s.token else null end)
 from public.order_links l join public.orders o on o.id=l.order_id join public.events e on e.id=o.event_id left join public.ticket_secrets s on s.order_id=o.id
 where l.token=p_token and length(p_token)=64 and e.ends_at>now()-interval '30 days';
$$;
revoke execute on function public.read_ticket_link(text) from public;
grant execute on function public.read_ticket_link(text) to anon,authenticated;
-- Claiming uses the verified Auth email, never the supplied address or metadata.
create function public.claim_my_guest_orders() returns integer language plpgsql security definer set search_path='' as $$
declare claimed integer; owner_email text;
begin
 if not private.verified() then raise exception 'Verifica tu correo antes de vincular entradas.'; end if;
 select lower(email) into owner_email from auth.users where id=auth.uid();
 with moved as (update public.orders set user_id=auth.uid(),guest_purchase=false where guest_purchase and lower(contact_email)=owner_email returning id,event_id)
 insert into public.audit_log(actor_id,event_id,action,entity_id) select auth.uid(),event_id,'guest_order_claimed',id from moved;
 get diagnostics claimed=row_count; return claimed;
end $$;
revoke execute on function public.claim_my_guest_orders() from public,anon;
grant execute on function public.claim_my_guest_orders() to authenticated;
create or replace function public.submit_payment(p_order uuid,p_path text,p_reference text) returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or o.user_id<>auth.uid() or not private.can_buy() then raise exception 'Acceso denegado.'; end if;
 if o.status<>'reserved' or o.expires_at<now() then raise exception 'La reserva ya no admite comprobantes.'; end if;
 if p_reference is null or p_reference !~ '^[A-Za-z0-9-]{4,40}$' then raise exception 'Número de operación inválido.'; end if;
 if p_path not like auth.uid()::text||'/'||o.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='receipts' and name=p_path) then raise exception 'Adjunta primero el comprobante.'; end if;
 update public.orders set receipt_path=p_path,payment_reference=upper(p_reference),status='pending',expires_at=now()+interval '24 hours' where id=o.id;
 insert into public.audit_log(actor_id,event_id,action,entity_id) values(auth.uid(),o.event_id,'payment_submitted',o.id);
 insert into private.notification_outbox(order_id,kind) values(o.id,'payment_submitted');
exception when unique_violation then raise exception 'Esta operación ya está registrada para el evento.';
end $$;

create or replace function public.cancel_reservation(p_order uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.orders set status='cancelled' where id=p_order and user_id=auth.uid() and private.can_buy() and status='reserved';
 if not found then raise exception 'Solo puedes cancelar una reserva sin comprobante.'; end if;
end $$;

create or replace function public.claim_notifications() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 with batch as (
  select id from private.notification_outbox where delivered_at is null and attempts<10 and (leased_until is null or leased_until<now())
  order by created_at for update skip locked limit 10
 ), claimed as (
  update private.notification_outbox n set lease_id=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=attempts+1
  from batch b where n.id=b.id returning n.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease',c.lease_id,'kind',c.kind,'order_id',c.order_id,
 'email',o.contact_email,'link_token',l.token,'event_title',e.title,'email_sent',c.email_sent,'telegram_sent',c.telegram_sent)),'[]') into result
 from claimed c join public.orders o on o.id=c.order_id join public.order_links l on l.order_id=o.id join public.events e on e.id=o.event_id;
 return result;
end $$;

COMMIT;
