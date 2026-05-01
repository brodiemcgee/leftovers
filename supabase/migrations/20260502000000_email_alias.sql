-- Each user gets a stable random email alias (e.g.
-- amex+a4f9q2x@digitalattitudes.com.au). Resend Inbound routes any email
-- sent to that local-part to our webhook; we look up the user from the
-- alias and insert the parsed Amex transaction on a synthetic account.
--
-- Random base32 string, 8 chars, ~40 bits. URL/email safe, no dashes.

create or replace function public._gen_email_alias() returns text language plpgsql as $$
declare
  v_alias text;
  v_chars text := 'abcdefghjkmnpqrstuvwxyz23456789';  -- no 0/o/1/l/i for legibility
  v_attempt int := 0;
begin
  loop
    v_alias := '';
    for _ in 1..8 loop
      v_alias := v_alias || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    -- Check uniqueness
    if not exists (select 1 from public.users where email_alias = v_alias) then
      return v_alias;
    end if;
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'unable to generate unique email alias after 20 attempts';
    end if;
  end loop;
end;
$$;

alter table public.users
  add column if not exists email_alias text unique;

-- Backfill existing users
update public.users
   set email_alias = public._gen_email_alias()
 where email_alias is null;

-- Enforce going forward via a trigger on insert
create or replace function public._users_set_email_alias() returns trigger language plpgsql as $$
begin
  if new.email_alias is null then
    new.email_alias := public._gen_email_alias();
  end if;
  return new;
end;
$$;

drop trigger if exists users_set_email_alias on public.users;
create trigger users_set_email_alias
  before insert on public.users
  for each row execute function public._users_set_email_alias();

-- Make it not-null now that all rows are populated
alter table public.users alter column email_alias set not null;
