import React from 'react';
import { Screen } from '../../components/Screen';
import { ArticleReader } from '../../components/articles/ArticleReader';
import { useRoute } from '@react-navigation/native';

export function ArticleScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ArticleReader articleId={id} />
    </Screen>
  );
}
