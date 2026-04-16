# Changelog

## [2.2.0](https://github.com/mgoodric/travel-tracker/compare/v2.1.0...v2.2.0) (2026-04-16)


### Features

* unified delta import pipeline with watermark tracking ([#39](https://github.com/mgoodric/travel-tracker/issues/39)) ([e456e21](https://github.com/mgoodric/travel-tracker/commit/e456e21cac24f83b3e6d15506cdce785044750ea))


### Bug Fixes

* include flight airports in member detail visited countries/states ([6d2e7f7](https://github.com/mgoodric/travel-tracker/commit/6d2e7f725ccaafae74024a2c021526e695252ee2))
* include flight airports in member detail visited countries/states ([#38](https://github.com/mgoodric/travel-tracker/issues/38)) ([6d2e7f7](https://github.com/mgoodric/travel-tracker/commit/6d2e7f725ccaafae74024a2c021526e695252ee2))

## [2.1.0](https://github.com/mgoodric/travel-tracker/compare/v2.0.1...v2.1.0) (2026-04-12)


### Features

* add Vitest test suite with CI gate (38 tests) ([#17](https://github.com/mgoodric/travel-tracker/issues/17)) ([6e5af78](https://github.com/mgoodric/travel-tracker/commit/6e5af7833ef434a5ed83689137cbea58cd8a0da5))


### Bug Fixes

* add pull_request triggers to CI workflows to unblock PRs ([#27](https://github.com/mgoodric/travel-tracker/issues/27)) ([e135099](https://github.com/mgoodric/travel-tracker/commit/e13509971c93011edf3e74c687fc7cee2ef3e29c))
* **ci:** extract PR number from release-please JSON output ([#33](https://github.com/mgoodric/travel-tracker/issues/33)) ([08b4550](https://github.com/mgoodric/travel-tracker/commit/08b455030eef0d0ebc6b76a72132dc300019707f))

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
