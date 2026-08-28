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
  published_at timestamptz
);

alter table public.blog_articles enable row level security;

-- Public read access limited to published articles
create policy "blog_published_public_read"
  on public.blog_articles for select
  using (status = 'published');

-- Writes/deletes restricted to the primary superadmin emails
create policy "blog_superadmin_write"
  on public.blog_articles for insert
  with check (
    lower(author_email) in (
      'shuvo.1807016@bau.edu.bd',
      'shuvoasifahmed@gmail.com',
      'asifahmedshuvo.aas@gmail.com'
    )
  );

create policy "blog_superadmin_update"
  on public.blog_articles for update
  using (
    lower(author_email) in (
      'shuvo.1807016@bau.edu.bd',
      'shuvoasifahmed@gmail.com',
      'asifahmedshuvo.aas@gmail.com'
    )
  );

create policy "blog_superadmin_delete"
  on public.blog_articles for delete
  using (
    lower(author_email) in (
      'shuvo.1807016@bau.edu.bd',
      'shuvoasifahmed@gmail.com',
      'asifahmedshuvo.aas@gmail.com'
    )
  );
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
