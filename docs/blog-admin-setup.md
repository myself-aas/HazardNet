# Blog Studio — Superadmin Article Management

The Blog Studio (`/dashboard/blog`) lets **primary superadmins** create, edit,
publish and delete blog articles. Every published article gets its own public
page at a unique URL: **`/blogs/:slug`**.

## Who can manage articles

Only these primary superadmin accounts (see `frontend/src/lib/superadmins.ts`):

- `shuvo.1807016@bau.edu.bd`
- `shuvoasifahmed@gmail.com`
- `asifahmedshuvo.aas@gmail.com`

Signed-out users are redirected to `/login?next=/dashboard/blog…`; signed-in
non-superadmins get an explicit "Superadmins only" page. **The client-side
gate is UI only — enforce the same rule at the data layer with the RLS
policies below**, otherwise anyone holding the public anon key could write to
the table directly.

## Storage

- **Production (Supabase configured):** articles live in the `blog_articles`
  table. Run this SQL once in the Supabase SQL editor:

```sql
create table if not exists public.blog_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  content_html text not null default '',
  cover_image_url text,
  category text not null default 'General',
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  author_id uuid,
  author_email text not null default '',
  author_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  -- SEO / Search Console (added by scripts/db/004_blog_seo_monetization.sql)
  meta_title text not null default '',
  meta_description text not null default '',
  focus_keyword text not null default '',
  canonical_url text not null default '',
  og_image_url text not null default '',
  robots_noindex boolean not null default false,
  faqs jsonb not null default '[]'::jsonb,
  -- editable public byline
  author_title text not null default '',
  author_bio text not null default '',
  author_avatar_url text not null default '',
  author_website text not null default '',
  -- monetization
  contains_affiliate_links boolean not null default false,
  affiliate_disclosure text not null default ''
);

-- Row-level security. The AUTHORITATIVE policy definitions now live in
-- scripts/db/006_blog_articles_rls_authz.sql — run that file; it is
-- idempotent and it replaces everything below.
--
-- ⚠️ DO NOT authorise on `author_email`. It is an ordinary column written by
-- the browser, so a policy that tests it is asking the caller what they claim
-- to be, not who they are — any registered user could satisfy it by sending a
-- superadmin address. Identity must come from the JWT (auth.uid()).
--
-- The fixed shape, for reference:

create or replace function public.is_blog_superadmin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) in (
        'shuvo.1807016@bau.edu.bd',
        'shuvoasifahmed@gmail.com',
        'asifahmedshuvo.aas@gmail.com'
      )
  );
$$;

alter table public.blog_articles enable row level security;

-- Public blog: published articles only.
create policy "blog_published_public_read"
  on public.blog_articles for select
  to anon, authenticated
  using (status = 'published');

-- Blog Studio: a superadmin may read everything, including their own drafts.
-- Without this the studio cannot list drafts (listArticles has no status
-- filter) and save-draft/unpublish fail with a misleading RLS error.
create policy "blog_superadmin_read"
  on public.blog_articles for select
  to authenticated
  using (public.is_blog_superadmin());

create policy "blog_superadmin_insert"
  on public.blog_articles for insert
  to authenticated
  with check (public.is_blog_superadmin());

create policy "blog_superadmin_update"
  on public.blog_articles for update
  to authenticated
  using (public.is_blog_superadmin())
  with check (public.is_blog_superadmin());

create policy "blog_superadmin_delete"
  on public.blog_articles for delete
  to authenticated
  using (public.is_blog_superadmin());
```

- **Local demo mode (no Supabase env vars):** articles persist to browser
  `localStorage` so the studio stays fully explorable. The studio shows an
  amber banner in this mode so demo content is never mistaken for production.

## Pages

| URL | Purpose |
| --- | --- |
| `/blogs` | Public blog index (live studio articles + curated archive) |
| `/blogs/:slug` | **Dedicated public article page** (unique URL per article) |
| `/dashboard/blog` | Blog Studio — superadmin article management (full page) |
| `/dashboard/blog/new` | Full-page editor for a new article |
| `/dashboard/blog/edit/:id` | Full-page editor for an existing article |

## Editor

`RichTextEditor` is dependency-free (contentEditable + `document.execCommand`)
so no new packages enter the lockfile: block formats (paragraph / H1–H3 /
blockquote / code block), bold / italic / underline / strikethrough, ordered &
unordered lists, alignment, links, inline images by URL, horizontal rule,
text colors, clear formatting, undo/redo, an HTML source view, and live word
count / reading time. Drafts autosave to localStorage while writing.

Article HTML is sanitized on save **and** on render (`sanitizeBlogHtml`):
`script`/`iframe`/`object`/`embed`/`style`/`form` nodes, inline `on*` event
handlers and `javascript:` URLs are stripped.

### SEO & monetization panels (editor)

The editor has three extra panels:

- **SEO & Google Search Console** — SEO title (≤60), meta description (≤160),
  focus keyword, canonical URL, og:image, `noindex` toggle, an FAQ builder
  (emits `FAQPage` JSON-LD for rich results), a live **Google SERP preview**
  and a 13-point SEO checklist with score. The public article page applies the
  full head (title, description, keywords, robots, canonical, Open Graph,
  Twitter card, Article+FAQ JSON-LD) via `src/lib/seoHead.ts`.
- **Author byline** — display name, role/title, bio, avatar and website are
  all editable per article (E-E-A-T signals). Permissions do **not** depend on
  any of them: RLS resolves identity from the JWT via `is_blog_superadmin()`,
  and `author_email` is stamped server-side by a trigger so it cannot be
  spoofed (see `scripts/db/006_blog_articles_rls_authz.sql`). The editable
  byline is display-only.
- **Monetization** — "contains affiliate links" toggle + editable disclosure.
  When enabled, the article shows a disclosure notice and every outbound link
  is rewritten to `rel="sponsored nofollow noopener"` on render. The editor
  toolbar also has a dedicated "Insert affiliate link" button.

Run `scripts/db/004_blog_seo_monetization.sql` (idempotent) to add the new
columns to an existing `blog_articles` table. See
[blog-monetization.md](blog-monetization.md) for AdSense setup and the
affiliate/passive-income playbook.
