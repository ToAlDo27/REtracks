# ReTracks

Author of ReTracks: [ToAlDo27](https://github.com/ToAlDo27).

Read [the release history](CHANGELOG.md), or click the version in the extension or installation page. The existing repository and installation URLs stay the same.

A modified version of [hypergig/obr-tracks](https://github.com/hypergig/obr-tracks), the Owlbear Rodeo music extension by Jordan Cohen. See [Russian instructions](README.ru.md) and [user documentation](docs/store.md).

**Install link:** [ReTracks manifest](https://toaldo27.github.io/REtracks/manifest.json). Add this URL in Owlbear Rodeo → Extras → Extensions → Add custom extension.

## Changes

- Add direct audio and YouTube video URLs, including bulk paste (`Title | URL`, one per line).
- Edit titles, source URLs, tags, and loop start/end seconds. YouTube share timestamps are preserved as clip bounds.
- Selecting a track updates the room before the new media loads. Each player reads the duration from the selected source and releases the previous player.
- Metadata-ready playback, explicit autoplay retry, seek controls, and visible playback errors.
- Direct audio follows the shared room clock after a stall or background suspension, without repeatedly seeking while buffering. Late joiners, pause, resume, seek and track changes use the same room playback state.
- Official visible YouTube iframe player with synchronized clips and local volume/mute.
- Stream a separate browser tab's audio to willing room listeners over WebRTC. An origin-checked popup bridge keeps capture outside the embedded extension.
- Atomic, validated and deduplicated library imports; old three-column CSV remains compatible, with optional `start,end` columns for clips.
- Removed upstream Firebase Analytics initialization and its runtime dependency from the independently hosted build.

## Build and install

Use Node.js 20+ and npm:

```sh
npm ci
npm test
npm run lint
npm run package
```

### GitHub Pages

1. Put the source files in your public `REtracks` repository, including `.github/workflows/pages.yml`, and push to `main`.
2. In **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. If the first run happened before enabling Pages, rerun **Publish ReTracks to GitHub Pages** in the Actions tab.
3. Wait for deployment, then open [the ReTracks website](https://toaldo27.github.io/REtracks/).
4. In Owlbear Rodeo, open **Extras → Extensions → Add custom extension**, paste `https://toaldo27.github.io/REtracks/manifest.json`, and enable ReTracks in your room. For your own fork, replace `toaldo27` with its owner's username.

The included workflow tests, builds and publishes the extension after each push to `main`. It reads the actual Pages path automatically, so renamed repositories and custom domains also work. The install link is the hosted `manifest.json`; a GitHub repository link or a raw source link cannot install the extension. The upstream manifest URL still points to the original extension.

### Other HTTPS hosting

Publish **the contents of `dist/`**. The default build is for root hosting. For a subdirectory, set `VITE_BASE_PATH=/your-path/` when running `npm run package`; both HTML assets and the generated manifest use this path. The separate **Source code** link on the installation page and in the extension menu opens [this repository](https://github.com/ToAlDo27/REtracks). Open the hosted page to copy its install link.

Static hosting must serve `broadcast.html` as its own page rather than rewriting it to `index.html`. If using Firebase, select your own project/site first; the upstream deployment project has been removed from this fork's configuration. Do not add headers that block embedding in Owlbear or sever the popup's `window.opener` connection (for example `Cross-Origin-Opener-Policy: same-origin` in a cross-origin room).

`npm run dev` starts local development. `npm run test:browser` runs Chrome UI and WebRTC tests with a mocked Owlbear host; use `PLAYWRIGHT_CHROME_PATH` if needed, or install Playwright Chromium. These do not replace a real multi-player Owlbear smoke test.

## Tab audio

The GM opens **Share tab audio**, then **Choose tab and start** in the popup. Select the music tab and enable **Share tab audio**. Players click **Listen to tab audio**: this explicitly unmutes playback and restores 30% volume if their volume was zero. If the browser blocks playback after connecting, click **Enable stream audio**. Volume and the mute button still work normally. Keep the source tab, popup, and Owlbear room open. Only audio is sent; the temporary captured video track is never added to the connection. Changing songs in the source tab does not rebuild the stream.

Selecting a song from the room library ends the active tab broadcast and switches listeners to the selected track.

## Publishing updates

Every published application update must increase the version and record its changes:

```sh
npm run release -- patch "Describe the user-facing change"
npm run check:release
```

Use `minor` or `major` for larger updates. This command updates package.json, package-lock.json, the manifest, in-app release history and CHANGELOG.md together. GitHub Actions checks these files and rejects application changes published with an unchanged version. The 1.0.0 release starts the ReTracks numbering series. Existing library and room metadata keys are preserved.

Desktop Chrome or Edge is recommended for capture. The browser must support tab audio capture and allow popups. The receiver must support WebRTC. A public STUN server is configured; there is **no bundled TURN relay**, so restrictive networks can prevent connections. Larger groups increase the GM's outgoing bandwidth. Library playback is locally muted while broadcasting/listening, and resumes when disconnected.

YouTube is embedded separately on each participant's device, without downloading or extracting audio. Autoplay restrictions, ads, availability, regional restrictions, and videos that prohibit embedding can affect individual playback. Use the explicit local play button when needed. Embedded video must remain visible.

Audio files must already be hosted at publicly accessible URLs; the extension does not provide cloud file uploads. Libraries are browser-local. Export CSV from the original extension before moving to a new host, then import it into this version.

## License and verification

AGPL-3.0; original attribution and [license](LICENSE) are retained. `npm run package` includes the license and a `SOURCE.txt` notice linking to the corresponding source revision in the public repository. The website does not generate or offer a source ZIP archive.

Unit/component tests cover cancellation, out-of-order completion, metadata cleanup/cache, source readiness, YouTube lifecycle, clip boundaries, import/storage failures and signaling cleanup. Browser tests use the real UI/audio/WebRTC APIs and a mocked Owlbear transport. Final real-room playback, nested iframe permissions, and external YouTube availability must be checked after hosting.
