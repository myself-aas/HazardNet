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
gate is UI only — enforce the same rule at the data layer with the Firestore
rules** (`firestore.rules` `match /blog_articles/{doc}`), otherwise anyone
holding the published web config could write to the collection directly.

## Storage

- **Production (Firestore configured):** articles live in the `blog_articles`
  collection. A document's shape is declared in `frontend/src/lib/blogArticles.ts`
  (`BlogArticle`): `slug`, `title`, `excerpt`, `contentHtml`, `coverImageUrl`,
  `category`, `tags`, `status` (`draft` | `published`), `authorId`,
  `authorEmail`, `authorName`, `createdAt`/`updatedAt`/`publishedAt`, the SEO
  set (`metaTitle`, `metaDescription`, `focusKeyword`, `canonicalUrl`,
  `ogImageUrl`, `robotsNoIndex`, `faqs`), the editable byline (`authorTitle`,
  `authorBio`, `authorAvatarUrl`, `authorWebsite`).

  Writes are allowed only when the signed-in Firebase Auth user's email is on
  the primary-superadmin allowlist, checked both client-side
  (`isPrimarySuperAdmin`) and server-side (`firestore.rules`). The
  authority check uses the Firebase Auth user id — never the `authorEmail`
  field, which the browser could set itself.

- **Local demo mode (no Firestore available):** articles persist to browser
  `localStorage` so the studio stays fully explorable. The studio shows an
  amber banner in this mode so demo content is never mistaken for published
  production content.

## Pages

| URL | Purpose |
| --- | --- |
| `/blogs` | Public blog index (live studio articles + curated archive) |
| `/blogs/:slug` | **Dedicated public article page** (unique URL per article) |
| `/dashboard/blog` | Blog Studio — superadmin article management (full page) |
| `/dashboard/blog/new` | Full-page editor for a new article |
| `/dashboard/blog/edit/:id` | Full-page editor for an existing article |

## Author byline spoofing

Permissions do **not** depend on any byline field. Firebase Auth resolves
identity from the signed-in user id, `firestore.rules` compares the user's
email against the primary-superadmin allowlist, and the UI stamps
`authorEmail` from the authenticated account — it is display-only and never
the source of an authorization decision.

The `scripts/db/004_blog_seo_monetization.sql` and
`scripts/db/006_blog_articles_rls_authz.sql` modules are retained in the repo
as **self-host/analytics schema references** — not the runtime store, which is
Firestore. The reference allowlist every source must agree on
(`frontend/src/lib/superadmins.ts`, `firestore.rules`, and the SQL below) is
guarded by `scripts/tests/test_blog_authz_parity.py`:

```sql
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
```

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

### SEO & author panels (editor)

The editor has three extra panels:

- **SEO & Google Search Console** — SEO title (≤60), meta description (≤160),
  focus keyword, canonical URL, og:image, `noindex` toggle, an FAQ builder
  (emits `FAQPage` JSON-LD for rich results), a live **Google SERP preview**
  and a 13-point SEO checklist with score. The public article page applies the
  full head (title, description, keywords, robots, canonical, Open Graph,
  Twitter card, Article+FAQ JSON-LD) via `src/lib/seoHead.ts`.
- **Author byline** — display name, role/title, bio, avatar and website are
  all editable per article (E-E-A-T signals). Permissions do **not** depend on
  any of them: identity resolves from Firebase Auth via `firestore.rules`, and
  `authorEmail` is stamped from the authenticated account so it cannot be
  spoofed. The editable byline is display-only.
