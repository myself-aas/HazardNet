import React from 'react';
import ArticlePage from '../components/ArticlePage';

/**
 * The documentation hub is authored in site-routes.json like its child pages.
 * Reusing ArticlePage keeps the static document, topic index, figures, tables,
 * FAQs and hydrated SPA view on one content source.
 */
export const Documentation: React.FC = () => <ArticlePage path="/docs" />;

export default Documentation;
