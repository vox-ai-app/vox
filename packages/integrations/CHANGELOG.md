# Changelog

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
