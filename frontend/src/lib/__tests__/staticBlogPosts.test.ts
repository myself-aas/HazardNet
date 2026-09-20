import { STATIC_BLOG_POSTS, getStaticBlogPostBySlug, staticBlogPostPath } from '../staticBlogPosts';

describe('staticBlogPosts — unique URLs', () => {
  it('gives every editorial post a unique slug', () => {
    const slugs = STATIC_BLOG_POSTS.map((post) => post.slug);
    expect(slugs).toHaveLength(STATIC_BLOG_POSTS.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    slugs.forEach((slug) => {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    });
  });

  it('resolves each slug to the matching post', () => {
    STATIC_BLOG_POSTS.forEach((post) => {
      expect(getStaticBlogPostBySlug(post.slug)?.id).toBe(post.id);
      expect(staticBlogPostPath(post.slug)).toBe(`/blogs/${post.slug}`);
    });
  });

  it('returns null for an unknown slug', () => {
    expect(getStaticBlogPostBySlug('not-a-real-article')).toBeNull();
    expect(getStaticBlogPostBySlug(undefined)).toBeNull();
  });
});
