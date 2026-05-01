-- FlowTracker Supabase schema (tables + RLS)
-- Apply in Supabase SQL editor (or via `supabase db push` if using the CLI).

-- Extensions
create extension if not exists "pgcrypto";

-- Enums (as text constraints for simplicity)
-- Roles used by the app: admin, team_lead, employee

-- Profiles (one row per auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  phone text,
  department text,
  role text not null default 'employee' check (role in ('admin', 'team_lead', 'employee')),
  team_lead_id uuid references public.profiles(id) on delete set null,
  approval_status text not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enforce email uniqueness (case-insensitive)
create unique index if not exists profiles_email_unique on public.profiles (lower(email));

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_team_lead_id_idx on public.profiles(team_lead_id);

-- Automatically update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Create profile row on signup (recommended Supabase pattern)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first_user boolean;
  desired_team_lead uuid;
  desired_role text;
  desired_approval text;
begin
  is_first_user := not exists (select 1 from public.profiles);

  desired_team_lead := nullif(new.raw_user_meta_data->>'team_lead_id', '')::uuid;

  -- First ever user becomes the admin (startup founder).
  desired_role := case
    when is_first_user then 'admin'
    else 'employee'
  end;

  -- If an employee picked a team lead during signup, mark them pending until approved.
  desired_approval := case
    when is_first_user then 'approved'
    when desired_team_lead is not null then 'pending'
    else 'approved'
  end;

  insert into public.profiles (id, email, name, phone, department, role, team_lead_id, approval_status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'department', ''),
    desired_role,
    desired_team_lead,
    desired_approval
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    phone = excluded.phone,
    department = excluded.department;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Helper: current user's role (bypasses RLS safely via SECURITY DEFINER)
create schema if not exists app;

create or replace function app.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

grant usage on schema app to authenticated;
grant execute on function app.current_role() to authenticated;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((app.current_role() = 'admin'), false);
$$;

create or replace function app.is_team_lead()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((app.current_role() = 'team_lead'), false);
$$;

grant execute on function app.is_admin() to authenticated;
grant execute on function app.is_team_lead() to authenticated;

-- RLS: profiles
alter table public.profiles enable row level security;

-- Read:
-- - Admin can read all profiles
-- - Team leads can read themselves + employees assigned to them
-- - Employees can read themselves
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
on public.profiles
for select
to authenticated
using (
  app.is_admin()
  or id = auth.uid()
  or (app.is_team_lead() and team_lead_id = auth.uid())
);

-- Allow unauthenticated users to list approved team leads (used by the registration UI).
-- This intentionally exposes only rows where `role='team_lead'` and `approval_status='approved'`.
drop policy if exists "profiles_select_team_leads_public" on public.profiles;
create policy "profiles_select_team_leads_public"
on public.profiles
for select
to anon
using (role = 'team_lead' and approval_status = 'approved');

-- Insert:
-- Disallow direct profile inserts from the client.
-- Profiles are created by the `auth.users` trigger (`handle_new_user`) instead.
drop policy if exists "profiles_insert_self" on public.profiles;

-- Update:
-- - Admin can update any profile (including role assignments)
-- - User can update their own non-privileged fields
-- - Team lead can update approval_status for employees assigned to them
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update"
on public.profiles
for update
to authenticated
using (
  app.is_admin()
  or id = auth.uid()
  or (app.is_team_lead() and team_lead_id = auth.uid())
)
with check (
  -- Prevent non-admins from changing roles or reassigning team lead.
  case
    when app.is_admin() then true
    when id = auth.uid() then (
      role = (select role from public.profiles p2 where p2.id = auth.uid())
      and team_lead_id = (select team_lead_id from public.profiles p2 where p2.id = auth.uid())
      and approval_status = (select approval_status from public.profiles p2 where p2.id = auth.uid())
    )
    when app.is_team_lead() and team_lead_id = auth.uid() then (
      role = (select role from public.profiles p2 where p2.id = public.profiles.id)
      and team_lead_id = (select team_lead_id from public.profiles p2 where p2.id = public.profiles.id)
    )
    else false
  end
);

-- Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'completed', 'on_hold')),
  deadline date,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_created_by_idx on public.projects(created_by);

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- Who can access a project (many-to-many to team leads)
create table if not exists public.project_team_leads (
  project_id uuid not null references public.projects(id) on delete cascade,
  team_lead_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, team_lead_id)
);

create index if not exists project_team_leads_team_lead_idx on public.project_team_leads(team_lead_id);

alter table public.projects enable row level security;
alter table public.project_team_leads enable row level security;

-- project_team_leads select: admin sees all; team leads see their own assignments
drop policy if exists "project_team_leads_select" on public.project_team_leads;
create policy "project_team_leads_select"
on public.project_team_leads
for select
to authenticated
using (
  app.is_admin()
  or team_lead_id = auth.uid()
);

-- Projects insert/update/delete: admin only
drop policy if exists "projects_admin_write" on public.projects;
create policy "projects_admin_write"
on public.projects
for all
to authenticated
using (app.is_admin())
with check (app.is_admin());

drop policy if exists "project_team_leads_admin_write" on public.project_team_leads;
create policy "project_team_leads_admin_write"
on public.project_team_leads
for all
to authenticated
using (app.is_admin())
with check (app.is_admin());

-- Tasks
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  assignee_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'completed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  deadline date,
  hours_spent numeric not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_project_id_idx on public.tasks(project_id);
create index if not exists tasks_assignee_id_idx on public.tasks(assignee_id);
create index if not exists tasks_status_idx on public.tasks(status);

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

-- Projects select: admin can see all; team leads see assigned; employees see projects where they have tasks.
drop policy if exists "projects_select" on public.projects;
create policy "projects_select"
on public.projects
for select
to authenticated
using (
  app.is_admin()
  or exists (
    select 1 from public.project_team_leads ptl
    where ptl.project_id = public.projects.id and ptl.team_lead_id = auth.uid()
  )
  or exists (
    select 1 from public.tasks t
    where t.project_id = public.projects.id and t.assignee_id = auth.uid()
  )
);

-- Tasks select:
-- - Admin sees all
-- - Team lead sees tasks in projects assigned to them
-- - Employee sees tasks assigned to them
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select"
on public.tasks
for select
to authenticated
using (
  app.is_admin()
  or assignee_id = auth.uid()
  or exists (
    select 1 from public.project_team_leads ptl
    where ptl.project_id = public.tasks.project_id and ptl.team_lead_id = auth.uid()
  )
);

-- Tasks insert:
-- - Admin can create tasks anywhere
-- - Team lead can create tasks only for their assigned projects
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert"
on public.tasks
for insert
to authenticated
with check (
  app.is_admin()
  or (
    app.is_team_lead()
    and created_by = auth.uid()
    and exists (
      select 1 from public.project_team_leads ptl
      where ptl.project_id = public.tasks.project_id and ptl.team_lead_id = auth.uid()
    )
  )
);

-- Tasks update:
-- - Admin can update anything
-- - Team lead can update tasks in their projects
-- - Employee can update their own task status (but not reassign)
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update"
on public.tasks
for update
to authenticated
using (
  app.is_admin()
  or (assignee_id = auth.uid())
  or exists (
    select 1 from public.project_team_leads ptl
    where ptl.project_id = public.tasks.project_id and ptl.team_lead_id = auth.uid()
  )
)
with check (
  case
    when app.is_admin() then true
    when assignee_id = auth.uid() then (
      -- employees cannot reassign or change project/creator; status and hours_spent are ok
      assignee_id = auth.uid()
      and created_by = (select created_by from public.tasks t2 where t2.id = public.tasks.id)
      and project_id = (select project_id from public.tasks t2 where t2.id = public.tasks.id)
    )
    else true
  end
);

-- Work logs
create table if not exists public.work_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  summary text not null,
  hours_spent numeric not null check (hours_spent >= 0),
  work_date date not null default (now()::date),
  created_at timestamptz not null default now()
);

create index if not exists work_logs_task_id_idx on public.work_logs(task_id);
create index if not exists work_logs_user_id_idx on public.work_logs(user_id);

alter table public.work_logs enable row level security;

-- Work logs select: admin, team lead for their projects, employee for themselves
drop policy if exists "work_logs_select" on public.work_logs;
create policy "work_logs_select"
on public.work_logs
for select
to authenticated
using (
  app.is_admin()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.tasks t
    join public.project_team_leads ptl on ptl.project_id = t.project_id
    where t.id = public.work_logs.task_id and ptl.team_lead_id = auth.uid()
  )
);

-- Work logs insert: employee can insert for themselves on their tasks; team lead can insert for themselves on their project tasks; admin all
drop policy if exists "work_logs_insert" on public.work_logs;
create policy "work_logs_insert"
on public.work_logs
for insert
to authenticated
with check (
  app.is_admin()
  or (
    user_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = public.work_logs.task_id and t.assignee_id = auth.uid())
  )
  or (
    user_id = auth.uid()
    and exists (
      select 1
      from public.tasks t
      join public.project_team_leads ptl on ptl.project_id = t.project_id
      where t.id = public.work_logs.task_id and ptl.team_lead_id = auth.uid()
    )
  )
);

-- Complaints
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  raised_by uuid not null references public.profiles(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists complaints_raised_by_idx on public.complaints(raised_by);
create index if not exists complaints_assigned_to_idx on public.complaints(assigned_to);
create index if not exists complaints_status_idx on public.complaints(status);

alter table public.complaints enable row level security;

drop policy if exists "complaints_select" on public.complaints;
create policy "complaints_select"
on public.complaints
for select
to authenticated
using (
  app.is_admin()
  or raised_by = auth.uid()
  or assigned_to = auth.uid()
  or (
    app.is_team_lead()
    and exists (
      select 1 from public.profiles e
      where e.id = public.complaints.raised_by and e.team_lead_id = auth.uid()
    )
  )
);

drop policy if exists "complaints_insert" on public.complaints;
create policy "complaints_insert"
on public.complaints
for insert
to authenticated
with check (raised_by = auth.uid());

drop policy if exists "complaints_update" on public.complaints;
create policy "complaints_update"
on public.complaints
for update
to authenticated
using (
  app.is_admin()
  or assigned_to = auth.uid()
  or (
    app.is_team_lead()
    and exists (
      select 1 from public.profiles e
      where e.id = public.complaints.raised_by and e.team_lead_id = auth.uid()
    )
  )
)
with check (
  -- Only admins/assignees can change status/assignment.
  app.is_admin()
  or assigned_to = auth.uid()
  or (
    app.is_team_lead()
    and exists (
      select 1 from public.profiles e
      where e.id = public.complaints.raised_by and e.team_lead_id = auth.uid()
    )
  )
);

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications(recipient_id);
create index if not exists notifications_sender_idx on public.notifications(sender_id);
create index if not exists notifications_read_idx on public.notifications(read);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select"
on public.notifications
for select
to authenticated
using (
  app.is_admin()
  or recipient_id = auth.uid()
  or sender_id = auth.uid()
);

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert"
on public.notifications
for insert
to authenticated
with check (sender_id = auth.uid());

drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update"
on public.notifications
for update
to authenticated
using (recipient_id = auth.uid() or app.is_admin())
with check (recipient_id = (select recipient_id from public.notifications n2 where n2.id = public.notifications.id));

-- Chat messages (simple 1:1)
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_sender_idx on public.chat_messages(sender_id);
create index if not exists chat_messages_recipient_idx on public.chat_messages(recipient_id);
create index if not exists chat_messages_created_at_idx on public.chat_messages(created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select"
on public.chat_messages
for select
to authenticated
using (
  app.is_admin()
  or sender_id = auth.uid()
  or recipient_id = auth.uid()
);

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert"
on public.chat_messages
for insert
to authenticated
with check (sender_id = auth.uid());

-- Presence sessions (for monitoring / history)
create table if not exists public.presence_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('online', 'offline')),
  work_mode text check (work_mode in ('wfo', 'wfh')),
  start_time timestamptz not null default now(),
  end_time timestamptz
);

create index if not exists presence_sessions_user_idx on public.presence_sessions(user_id);
create index if not exists presence_sessions_start_idx on public.presence_sessions(start_time);

alter table public.presence_sessions enable row level security;

drop policy if exists "presence_sessions_select" on public.presence_sessions;
create policy "presence_sessions_select"
on public.presence_sessions
for select
to authenticated
using (
  app.is_admin()
  or user_id = auth.uid()
  or (
    app.is_team_lead()
    and exists (select 1 from public.profiles e where e.id = public.presence_sessions.user_id and e.team_lead_id = auth.uid())
  )
);

drop policy if exists "presence_sessions_insert" on public.presence_sessions;
create policy "presence_sessions_insert"
on public.presence_sessions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "presence_sessions_update" on public.presence_sessions;
create policy "presence_sessions_update"
on public.presence_sessions
for update
to authenticated
using (user_id = auth.uid() or app.is_admin())
with check (user_id = (select user_id from public.presence_sessions p2 where p2.id = public.presence_sessions.id));
