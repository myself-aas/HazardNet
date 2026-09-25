const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure .md files are treated as assets (for ArticleReader)
if (!config.resolver.assetExts.includes('md')) {
  config.resolver.assetExts.push('md');
}

// Ensure workspace packages are watched (monorepo)
const path = require('path');
const root = path.resolve(__dirname, '../..');
if (!config.watchFolders) config.watchFolders = [];
if (!config.watchFolders.includes(root)) {
  config.watchFolders.push(root);
}

module.exports = config;
