const fs = require('node:fs');
const path = require('node:path');
const output = process.env.PERF_OUTPUT || path.resolve('../../../build/issue85');
const fixture = JSON.parse(fs.readFileSync(path.join(output, 'fixtures.json'), 'utf8'));
const base = process.env.FRONTEND_URL || 'http://localhost:8085';
module.exports = { ci: {
  collect: {
    url: ['/', '/recipes', `/recipes/${fixture.slugs[0]}`, '/search?q=pho', `/categories/${fixture.categories[0].slug}`].map(p => base + p),
    numberOfRuns: 3,
    settings: { chromeFlags: '--headless --no-sandbox', formFactor: 'mobile',
      screenEmulation: { mobile: true, width: 375, height: 812, deviceScaleFactor: 1, disabled: false } },
  },
  assert: { assertions: {
    'largest-contentful-paint': ['error', { maxNumericValue: 2500, aggregationMethod: 'median' }],
    'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median' }],
    'http-status-code': ['error', { minScore: 1 }],
  } },
  upload: { target: 'filesystem', outputDir: path.join(output, 'lighthouse') },
} };
