# Issue #87 — Contrast audit

Ngày chạy: 30/10/2026
Phạm vi: semantic tokens trong `app/globals.css`, light và dark theme.

Tỷ lệ được tính theo WCAG relative luminance, làm tròn hai chữ số:

| Cặp màu | Tỷ lệ | Tiêu chí | Kết quả |
|---|---:|---:|---|
| Light foreground `#0b0d13` / background `#faf8f8` | 18.36:1 | text 4.5:1 | PASS |
| Light primary `#661a06` / background `#faf8f8` | 11.57:1 | text 4.5:1 | PASS |
| Light muted foreground `#6e6466` / background `#faf8f8` | 5.40:1 | text 4.5:1 | PASS |
| Light success `#496c2e` / background `#faf8f8` | 5.72:1 | text 4.5:1 | PASS |
| Dark foreground `#f4f0f1` / background `#0b0d13` | 17.19:1 | text 4.5:1 | PASS |
| Dark muted foreground `#bcaaac` / background `#0b0d13` | 8.77:1 | text 4.5:1 | PASS |
| White / light primary `#661a06` | 12.24:1 | button text 4.5:1 | PASS |
| White / dark primary `#942b10` | 8.04:1 | button text 4.5:1 | PASS |
| Dark primary `#942b10` / dark background `#0b0d13` | 2.42:1 | normal text | FAIL if used as text |

Dark primary is reserved for filled controls/borders where the foreground is white; it must not be used as standalone normal text on the dark background. Focus outlines use the primary token plus a contrasting outline offset. Placeholder/disabled/opacity states still require manual visual review because compositing changes the effective color.
