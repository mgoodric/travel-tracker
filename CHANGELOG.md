# Changelog

## [2.0.1](https://github.com/mgoodric/travel-tracker/compare/v2.0.0...v2.0.1) (2026-03-24)


### Bug Fixes

* use X-Email header from oauth2-proxy nginx auth_request ([431b07d](https://github.com/mgoodric/travel-tracker/commit/431b07d0f897b9c1cae84b83762ff0eea98c98ad))

## [2.0.0](https://github.com/mgoodric/travel-tracker/compare/v1.0.0...v2.0.0) (2026-03-24)


### ⚠ BREAKING CHANGES

* requires DATABASE_URL, APP_USER_ID env vars instead of NEXT_PUBLIC_SUPABASE_URL/KEY. Requires oauth2-proxy or DEV_USER_ID for authentication.

### Features

* replace Supabase with standalone PostgreSQL and oauth2-proxy ([21e93a6](https://github.com/mgoodric/travel-tracker/commit/21e93a6195e0fa8abf0ff659c6d91afa6b8a9a9d))


### Bug Fixes

* patch container vulnerabilities by upgrading Alpine and removing unused package managers ([11df80e](https://github.com/mgoodric/travel-tracker/commit/11df80ee42ba92acf1c40e39fd4afd689da09462))

## 1.0.0 (2026-03-24)


### Features

* initial commit ([23dfbc4](https://github.com/mgoodric/travel-tracker/commit/23dfbc40b9988976f0f2fde67a175ca29f4b216f))
