# Changelog

## [1.1.0] - 2026-04-12

### Added

- **Contacts** — search macOS Contacts with full field extraction (name, emails, phones, organization, title, addresses, notes). Pagination support with configurable limit/offset.
- **Shortcuts** — list and run macOS Shortcuts with input/output passthrough. Pagination support for listing.
- **Music** — control Apple Music: play, pause, next, previous, get now playing, set volume.
- **Calendar** — list, create, update, and delete Calendar events with date-range filtering. Pagination support.
- **Reminders** — list, create, and complete Reminders with list filtering. Pagination support.
- **Shared utilities** — `shared/applescript` (AppleScript runner, `esc`, `toAppleDate`), `shared/shortcuts` (Shortcuts CLI runner), `shared/platform` (cross-platform registry with `resolveExecutors` and `makePlatformTools`).
- Tool definitions (`def.js`) for all five new domains.
- Pagination on all read-heavy tools: contacts (default 25), calendar (default 25), reminders (default 25), shortcuts (default 100). All capped at 200.

### Changed

- All `tools.js` files now use the `resolveExecutors` / `makePlatformTools` platform registry pattern — ready for cross-platform expansion.
- `toAppleDate` extracted from calendar into `shared/applescript` for reuse across domains.

## [1.0.3] - 2026-04-10

### Fixed

- `pyTypeText` now uses the correct macOS virtual keycode per character instead of always sending keycode `0` (`a`). Uppercase letters and shifted symbols now apply the shift flag correctly, with Unicode-string fallback retained for characters that do not have a known keycode.

## [1.0.2] - 2026-04-05

### Fixed

- `./defs` exports pointed to nonexistent `src/defs/` directory. Now exports `./defs/mail`, `./defs/screen`, `./defs/imessage` pointing to `src/*/def.js`.

## [1.0.1] - 2026-03-25

### Added

- iMessage gateway service with passphrase mode.

## [1.0.0] - 2026-03-24

- Initial release: Apple Mail, Screen control, iMessage integrations with tool definitions.
