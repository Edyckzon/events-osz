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
