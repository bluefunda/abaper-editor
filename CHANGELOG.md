# Changelog

## [1.4.0](https://github.com/bluefunda/abaper-editor/compare/v1.3.0...v1.4.0) (2026-03-24)


### Features

* add edit button for SAP system configuration ([#23](https://github.com/bluefunda/abaper-editor/issues/23)) ([8361d3a](https://github.com/bluefunda/abaper-editor/commit/8361d3a5a645f47db5e87f243329a80d8344c0d7))

## [1.3.0](https://github.com/bluefunda/abaper-editor/compare/v1.2.0...v1.3.0) (2026-02-28)


### Features

* AI panel paste detection and sidebar UX improvements ([#18](https://github.com/bluefunda/abaper-editor/issues/18)) ([cc51e82](https://github.com/bluefunda/abaper-editor/commit/cc51e829342180593f87996b177bf1e486833f6f))

## [1.2.0](https://github.com/bluefunda/abaper-editor/compare/v1.1.0...v1.2.0) (2026-02-25)


### Features

* SSE events, dev infrastructure, and LLM config ([#15](https://github.com/bluefunda/abaper-editor/issues/15)) ([379a808](https://github.com/bluefunda/abaper-editor/commit/379a808f8aa940049a6023404f798c79da47fc18))

## [1.1.0](https://github.com/bluefunda/abaper-editor/compare/v1.0.1...v1.1.0) (2026-02-24)


### Features

* SSE event handling, dev infrastructure, agent docs ([#12](https://github.com/bluefunda/abaper-editor/issues/12)) ([2178e3b](https://github.com/bluefunda/abaper-editor/commit/2178e3b8a2b89c41623e7e5262e2f6316e8ee1aa))

## [1.0.1](https://github.com/bluefunda/abaper-editor/compare/v1.0.0...v1.0.1) (2026-02-23)


### Bug Fixes

* handle SSE responses, rename /ai/mcp to /ai/agent ([#10](https://github.com/bluefunda/abaper-editor/issues/10)) ([86b8254](https://github.com/bluefunda/abaper-editor/commit/86b8254f5452e63b079db2fc082d14e21ef2a5e1))

## 1.0.0 (2026-02-23)


### Features

* add abaper-mcp service to docker-compose.dev.yml ([aa29e00](https://github.com/bluefunda/abaper-editor/commit/aa29e005a5d89ce0f56a75bf1c9966e37dfc7990))
* add GitHub file explorer, SAP package tree, and user menu ([ddc7638](https://github.com/bluefunda/abaper-editor/commit/ddc763865d498e140001bd2eda8211f08a954cde))
* add GitHub file explorer, SAP package tree, and user menu ([#2](https://github.com/bluefunda/abaper-editor/issues/2)) ([052ab32](https://github.com/bluefunda/abaper-editor/commit/052ab32d8585f9dea148ad877546cc0beb24c9ec))
* add GitHub OAuth login flow ([4cb319a](https://github.com/bluefunda/abaper-editor/commit/4cb319ab270fdc4ac135018329dc7839a507a4ab))
* add GitHub OAuth login flow with per-user token ([ee32afb](https://github.com/bluefunda/abaper-editor/commit/ee32afbb71dd58c147ac3eceec8c4c004ccd5912))
* add MCP integration for AI assistant and Git panels ([#1](https://github.com/bluefunda/abaper-editor/issues/1)) ([f6254d9](https://github.com/bluefunda/abaper-editor/commit/f6254d91e70e8890fee670d92a4af762a0e8558f))
* add multi-realm Keycloak authentication ([58e6930](https://github.com/bluefunda/abaper-editor/commit/58e69307c20a45b1e5b8e88195fbc56833d36169))
* implement Phase 1 core editor ([e3e1b2d](https://github.com/bluefunda/abaper-editor/commit/e3e1b2d0d6481b114c2a00cb876b7f7dadfcbb84))
* integrate Convo AI chat with SSE streaming, markdown rendering, and model selector ([0c8cf2e](https://github.com/bluefunda/abaper-editor/commit/0c8cf2e9648a63172ba75645226322e5b3de7c6c))
* migrate MCP to Streamable HTTP and unify under /ai/* ([0c2b516](https://github.com/bluefunda/abaper-editor/commit/0c2b5162dc084e761e6c57c12817004a86a494a0))
* migrate MCP to Streamable HTTP, unify under /ai/* ([9985359](https://github.com/bluefunda/abaper-editor/commit/9985359741c23edd926ceeabd58e0378c73c8404))
* multi-system SAP connections and favorite package explorer ([ac09f83](https://github.com/bluefunda/abaper-editor/commit/ac09f83cbc4482b2e6f4a1786388f2e8a76bbb08))
* rename /cai to /ai for AI chat endpoint ([99abc66](https://github.com/bluefunda/abaper-editor/commit/99abc66e651141a5088969e9f3df5ad6208ea697))
* resizable panels, AI sidebar, bug fixes, docker-compose dev ([77ed802](https://github.com/bluefunda/abaper-editor/commit/77ed8027b169b8bf9c59ac3e7e99d1969423532f))


### Bug Fixes

* align API calls with backend (POST + response unwrapping) ([6a80763](https://github.com/bluefunda/abaper-editor/commit/6a807637d78fbffc0c404e3506ae87188e0c1cbd))
* always run abaplint linter regardless of offlineLinting flag ([9aaa29b](https://github.com/bluefunda/abaper-editor/commit/9aaa29bfb83e3c26be29e62605f667638b1ca875))
* **ci:** increase Node heap for Vite build (Monaco + abaplint OOM) ([e68e99f](https://github.com/bluefunda/abaper-editor/commit/e68e99fc0c0a4a4ed8d5a6a832ad65ec245e5efc))
* **ci:** increase Node heap for Vite build in CI workflow ([3d9f42d](https://github.com/bluefunda/abaper-editor/commit/3d9f42d3241d4593f3dafbf5813e7be781c5664e))
* increase Node.js heap size for Docker build ([d7cf6ac](https://github.com/bluefunda/abaper-editor/commit/d7cf6acf4b693d7e0f065986949097bdd70ed585))
* map SAP ADT object types to editor types ([0992cfd](https://github.com/bluefunda/abaper-editor/commit/0992cfdf2e6a94a1eb14bc2172cf742002d61679))
* pass VITE_GITHUB_CLIENT_ID as build arg for OAuth ([9c9c395](https://github.com/bluefunda/abaper-editor/commit/9c9c3959247d695b178ba6fd57676d2525d1a184))
* resolve race condition in editor model switching ([cd049f1](https://github.com/bluefunda/abaper-editor/commit/cd049f13d3ef5a00d634191bf7ae072646e49c65))
* update abaper command to use subcommand syntax ([f9ba689](https://github.com/bluefunda/abaper-editor/commit/f9ba689213b79d3438dff4406c98a99527aaf773))
* use camelCase JSON keys for CAI chat request ([2514b9e](https://github.com/bluefunda/abaper-editor/commit/2514b9eb0bb02e9d6874ad0ff3e2c28d4d4118a8))
