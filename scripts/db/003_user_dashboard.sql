-- =============================================================================
-- HazardNet · 003_user_dashboard.sql
-- Dedicated user dashboards: unique usernames (profile URLs), rich profile
-- data, connectors, avatars storage, and public profile visibility.
--
-- Run in your Postgres SQL editor.
-- Safe to re-run (idempotent: `if not exists` / `drop policy if exists`).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · PROFILES — extend with dashboard fields
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username                    text,
  add column if not exists first_name                  text,
  add column if not exists last_name                   text,
  add column if not exists bio                         text,
  add column if not exists website                     text,
  add column if not exists avatar_path                 text,          -- storage path for replace-on-update
  add column if not exists whatsapp_number             text,
  add column if not exists date_of_birth               date,
  add column if not exists gender                      text,
  add column if not exists pronouns                    text,
  add column if not exists nationality                 text,
  add column if not exists preferred_language          text default 'en',
  add column if not exists timezone                    text default 'Asia/Dhaka',
  add column if not exists country                     text default 'Bangladesh',
  add column if not exists division                    text,
  add column if not exists district                    text,
  add column if not exists upazila                     text,
  add column if not exists village                     text,
  add column if not exists postal_code                 text,
  add column if not exists address                     text,
  add column if not exists occupation                  text,
  add column if not exists farming_experience_years    integer,
  add column if not exists irrigation_type             text,
  add column if not exists soil_type                   text,
  add column if not exists livestock                   text,
  add column if not exists annual_income_bdt           numeric,
  add column if not exists social_facebook             text,
  add column if not exists social_x                    text,
  add column if not exists social_linkedin             text,
  add column if not exists social_github               text,
  add column if not exists social_youtube              text,
  add column if not exists social_instagram            text,
  add column if not exists notify_email                boolean default true,
  add column if not exists notify_sms                  boolean default false,
  add column if not exists notify_push                 boolean default true,
  add column if not exists notify_weekly_digest        boolean default true,
  add column if not exists notify_emergency_alerts     boolean default true,
  add column if not exists marketing_opt_in            boolean default false,
  add column if not exists profile_visibility          text default 'public' check (profile_visibility in ('public','private')),
  add column if not exists email_verified_at           timestamptz,
  add column if not exists onboarding_completed        boolean default false,
  add column if not exists username_updated_at         timestamptz,
  add column if not exists last_login_at               timestamptz,
  add column if not exists login_count                 integer default 0;

-- Usernames are unique case-insensitively and become /u/<username> URLs.
create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;

-- ---------------------------------------------------------------------------
-- 2 · USERNAME HELPERS
-- ---------------------------------------------------------------------------
-- Reserved words that may never be claimed as usernames (route names,
-- system accounts, brand terms).
create table if not exists public.reserved_usernames (word text primary key);

insert into public.reserved_usernames (word) values
  ('admin'), ('administrator'), ('moderator'), ('superadmin'), ('root'),
  ('hazardnet'), ('hazard'), ('support'), ('help'), ('security'), ('api'),
  ('www'), ('mail'), ('email'), ('official'), ('team'), ('staff'), ('system'),
  ('login'), ('signup'), ('sign-in'), ('sign-up'), ('register'), ('auth'),
  ('dashboard'), ('settings'), ('account'), ('profile'), ('u'), ('user'),
  ('blog'), ('blogs'), ('about'), ('contact'), ('terms'), ('privacy'),
  ('docs'), ('documentation'), ('analytics'), ('advisories'), ('forecast'),
  ('forecasts'), ('upload'), ('download'), ('home'), ('null'), ('undefined'),
  ('administrator'), ('billing'), ('payments'), ('webhook'), ('connectors')
on conflict (word) do nothing;

-- Returns true when `candidate` is free and not reserved.
create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    candidate is not null
    and length(candidate) between 3 and 20
    and candidate ~ '^[a-z][a-z0-9_]{2,19}$'
    and candidate !~ '__'
    and candidate not in (select word from public.reserved_usernames)
    and not exists (
      select 1 from public.profiles p where lower(p.username) = lower(candidate)
    );
$$;

-- Auto-create a profile row (with a generated username) for every new auth
-- user, so OAuth and magic-link signups always land on a complete profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base          text;
  candidate     text;
  suffix        integer := 0;
  seed_name     text;
  seed_email    text;
  chosen        text;
begin
  seed_name  := coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name');
  seed_email := coalesce(new.email, split_part(new.id::text, '-', 1) || '@users.noreply.hazardnet.live');

  -- Honour the username picked on the sign-up form (when it passes the rules).
  chosen := lower(btrim(coalesce(new.raw_user_meta_data->>'username', '')));
  if chosen ~ '^[a-z][a-z0-9_]{2,19}$'
     and chosen !~ '__'
     and chosen not in (select word from public.reserved_usernames) then
    base := substr(chosen, 1, 16);
  else
    -- Otherwise derive the seed: display name → email local-part → uid prefix.
    base := lower(regexp_replace(
      coalesce(nullif(seed_name, ''), split_part(seed_email, '@', 1)),
      '[^a-z0-9_]+', '_', 'g'));
    base := regexp_replace(base, '^_+|_+$', '');
    base := regexp_replace(base, '_{2,}', '_', 'g');
    if base is null or length(base) < 3 or base !~ '^[a-z]' then
      base := 'farmer_' || substr(md5(new.id::text), 1, 6);
    end if;
    base := substr(base, 1, 16);
  end if;

  candidate := base;
  while not public.is_username_available(candidate) and suffix < 999 loop
    suffix := suffix + 1;
    candidate := substr(base, 1, 20 - length(suffix::text) - 1) || '_' || suffix;
  end loop;

  insert into public.profiles (id, email, display_name, username, photo_url, role, user_role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(seed_name, ''), split_part(seed_email, '@', 1), 'Farmer'),
    candidate,
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    'user',
    'smallholder_farmer'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep usernames canonical (lowercase, no stray whitespace) on write.
create or replace function public.normalize_username()
returns trigger
language plpgsql
as $$
begin
  if new.username is not null then
    new.username := lower(btrim(new.username));
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_normalize_username on public.profiles;
create trigger profiles_normalize_username
  before insert or update of username on public.profiles
  for each row execute function public.normalize_username();

-- ---------------------------------------------------------------------------
-- 3 · ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.reserved_usernames enable row level security;

-- Public profiles are readable by anyone when marked public; owners always
-- see their own row (dashboard needs every field).
drop policy if exists "Public profiles are visible to everyone" on public.profiles;
drop policy if exists "Owner reads own profile" on public.profiles;
drop policy if exists "Owner updates own profile" on public.profiles;
drop policy if exists "Owner inserts own profile" on public.profiles;

create policy "Public profiles are visible to everyone"
  on public.profiles for select
  using (auth.uid() = id or profile_visibility = 'public');

create policy "Owner inserts own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Owner updates own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Reserved words are world-readable (used by the client availability check).
drop policy if exists "Reserved usernames readable" on public.reserved_usernames;
create policy "Reserved usernames readable"
  on public.reserved_usernames for select
  using (true);

-- ---------------------------------------------------------------------------
-- 4 · CONNECTORS — per-user integrations (data sources, alerts, tools)
-- ---------------------------------------------------------------------------
create table if not exists public.user_connectors (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  connector_key text not null,
  status        text not null default 'connected' check (status in ('connected','disconnected')),
  config        jsonb not null default '{}'::jsonb,
  connected_at  timestamptz,
  disconnected_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, connector_key)
);

alter table public.user_connectors enable row level security;

drop policy if exists "Owner manages own connectors" on public.user_connectors;
create policy "Owner reads own connectors"
  on public.user_connectors for select
  using (auth.uid() = user_id);
create policy "Owner inserts own connectors"
  on public.user_connectors for insert
  with check (auth.uid() = user_id);
create policy "Owner updates own connectors"
  on public.user_connectors for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "Owner deletes own connectors"
  on public.user_connectors for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5 · STORAGE — public `avatars` bucket with per-user folders
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Avatar owner manages own folder" on storage.objects;
drop policy if exists "Avatars are publicly readable" on storage.objects;

create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Avatar owner can upload"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Avatar owner can update"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Avatar owner can delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------------------
-- 6 · LOGIN TELEMETRY (best-effort, invoked by the client after sign-in)
-- ---------------------------------------------------------------------------
create or replace function public.record_login()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_login_at = now(),
         login_count = coalesce(login_count, 0) + 1,
         email_verified_at = coalesce(email_verified_at, now())
   where id = auth.uid();
$$;
