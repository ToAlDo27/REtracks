# ReTracks maintenance

- The product name is **ReTracks**, author **ToAlDo27**. Preserve the existing repository, installation URL and metadata/storage keys so room libraries and synchronization continue to work.
- Every published application update must increase the semantic version and include clear user-facing change notes. Version 1.0.0 starts the ReTracks release series.
- Use `npm run release -- patch "Описание изменения"` (or `minor` / `major`). The command updates package.json, package-lock.json, manifest, src/releases.json and CHANGELOG.md together. Never delete older release notes.
- Run `npm run check:release`, `npm test`, `npm run lint`, `npm run package`, plus browser tests for playback/stream changes. CI also compares the release against the prior pushed commit and refuses an unversioned application update.
- Keep the **Source code** link pointing to https://github.com/ToAlDo27/REtracks; do not generate a downloadable source archive on the site. Retain upstream attribution and AGPL licensing.
- Tab-stream listeners must be able to explicitly enable audio, recover from browser autoplay blocking, change volume and mute. Test real WebRTC audio samples with synthetic capture; never record the user's actual desktop for automated checks.
