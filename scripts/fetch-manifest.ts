/**
 * Refresh the core-web metadata read straight from the live Storybook build, without a
 * full scrape (which writes the same files):
 *   - data/igds-manifest.json: public method signatures per class (custom-elements manifest)
 *   - data/igds-slots.json: slot names per element (compiled component templates)
 *
 * Run: npm run scrape:manifest && npm run build:docs
 */
import { BASE_URL, fetchBundle } from '../src/scrapers/bundle-parser.js';
import { writeManifestMethods } from '../src/scrapers/manifest.js';
import { writeSlots } from '../src/scrapers/slots.js';

const bundle = await fetchBundle('core-web');
const classes = writeManifestMethods(bundle);
if (!classes) {
  console.error('No custom-elements manifest found in the core-web bundle.');
  process.exit(1);
}
console.log(`igds-manifest: ${classes} classes`);
await writeSlots(bundle, `${BASE_URL}/core-web/assets`);
