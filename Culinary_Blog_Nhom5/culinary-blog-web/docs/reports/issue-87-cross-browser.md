# Issue #87 — Cross-browser smoke report

Ngày chạy: 30/10/2026
Baseline: `f86b7c9`; test harness: Playwright 1.62.1, headless local run.

| Engine | Version | Axe + keyboard/focus | Viewports |
|---|---|---|---|
| Chromium | 151.0.7922.34 | PASS | 320, 375, 768, 1024, 1200 |
| Firefox | 153.0 | PASS | 320, 375, 768, 1024, 1200 |
| WebKit | 26.5 | PASS | 320, 375, 768, 1024, 1200 |

Covered journeys include skip link, mobile disclosure, account menu, select/portal, modal focus trap, Escape recovery, validation error, retry/busy state, reduced motion, forced colors (Chromium), duplicate IDs and tab-order assertions. WebKit-specific headless focus behavior is isolated in the harness; Safari/VoiceOver remains a manual gate.

Not covered by this local run: Edge, real Safari, iOS Safari, Android Chrome, NVDA and VoiceOver. These require BrowserStack or physical devices and must be recorded as an explicit exception until executed.
