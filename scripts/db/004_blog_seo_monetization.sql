-- =============================================================================
-- HazardNet · 004_blog_seo_monetization.sql
-- SEO metadata (Google Search Console) and editable author bylines for
-- blog_articles. (Affiliate/monetization fields were removed in the 2026-09-24
-- research-ethics cleanup; columns added by an earlier revision of this file
-- are unused and may be dropped.)
--
-- Run in your Postgres SQL editor AFTER docs/blog-admin-setup.md created the
-- blog_articles table. Idempotent — safe to re-run. RLS policies are unchanged
-- (writes still restricted to the three primary superadmin emails).
-- =============================================================================

alter table public.blog_articles
  add column if not exists meta_title            text not null default '',   -- ≤60 chars, SERP title
  add column if not exists meta_description      text not null default '',   -- ≤160 chars, SERP snippet
  add column if not exists focus_keyword         text not null default '',   -- primary target keyword
  add column if not exists canonical_url         text not null default '',   -- canonical override
  add column if not exists og_image_url          text not null default '',   -- social share image (falls back to cover)
  add column if not exists robots_noindex        boolean not null default false,
  add column if not exists faqs                  jsonb not null default '[]'::jsonb, -- [{question, answer}] → FAQPage rich results
  add column if not exists author_title          text not null default '',   -- public byline role
  add column if not exists author_bio            text not null default '',   -- public byline bio (E-E-A-T)
  add column if not exists author_avatar_url     text not null default '',
  add column if not exists author_website        text not null default '',

-- Note: author_email remains the *permission identity* (RLS-checked against
-- the superadmin allowlist). The public byline above is freely editable.
