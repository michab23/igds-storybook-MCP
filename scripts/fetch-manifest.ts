/**
 * Refresh data/igds-manifest.json (public method signatures per class) from the live
 * core-web Storybook bundle, without a full scrape. The full scrape also writes it.
 *
 * Run: npm run scrape:manifest && npm run build:docs
 */
import { fetchBundle } from '../src/scrapers/bundle-parser.js';
import { writeManifestMethods } from '../src/scrapers/manifest.js';

const classes = writeManifestMethods(await fetchBundle('core-web'));
if (!classes) {
  console.error('No custom-elements manifest found in the core-web bundle.');
  process.exit(1);
}
console.log(`igds-manifest: ${classes} classes`);
