---
title: Tracks Plus
description: Add and edit audio links and YouTube clips, import a music library, and share browser tab audio with your Owlbear Rodeo room
author: ToAlDo27
image: https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/header.png
icon: /tracks_256.png
tags:
  - audio
# Set manifest to your own HTTPS deployment's /manifest.json before submitting a store listing.
learn-more: https://github.com/hypergig/obr-tracks
---

# Tracks Plus

Play looping background music and ambiance from your own library, with search and room playback controls.

This fork adds:

- **Add music** for a single link or multiple links at once, with editable titles, URLs and tags.
- **YouTube videos** through the visible official player, including timestamps from shared links.
- **Start/end clips** that loop within the selected range, plus a GM seek slider when the duration is known.
- **Safer switching** that cancels old audio metadata requests and stops the previous source.
- **Share tab audio** to stream audio from a separate browser tab to listeners in the room.

## Install this build

Build the source and host the generated `dist` directory over HTTPS. In Owlbear Rodeo, add a custom extension using **your deployment's** `/manifest.json` URL. The original project's `obr-tracks.web.app` manifest installs the upstream release, which does not include these changes. See the [README](../README.md) for build instructions.

The screenshots below illustrate the original interface; this fork includes additional buttons and fields. Live playback still needs verification in your hosted Owlbear room, including a second listener.

## YouTube and browser tab audio

Paste a YouTube watch, share, Shorts or live video URL into **Add music**. You can edit its title and clip times later. Each listener plays the video in their own visible embedded player. Unmute Tracks and, if prompted, click **Play YouTube on this device**. Videos that prohibit embedding cannot be played this way. No API key is needed. See the [official player documentation](https://developers.google.com/youtube/iframe_api_reference).

For audio controlled in a separate tab, the GM clicks **Share tab audio**, then **Choose tab and start** in the capture window. Select the music tab and enable **Share tab audio** in the browser dialog. Desktop Chrome or Edge over HTTPS is recommended for capture. Keep the capture window and Owlbear open. Listeners click **Listen to tab audio** and unmute Tracks; the source tab controls songs and playback. Library audio is muted locally while broadcasting or listening.

The stream uses direct WebRTC connections. No TURN relay is bundled, so some restricted networks cannot connect. Browser capture support, popup permissions, autoplay permissions and source restrictions can affect playback.

## What you need to know

### Google Drive links

This build rejects Google Drive page links. Use a public direct audio URL or a supported YouTube video URL.

### Public access

Direct audio links must be publicly available without logging in, and the browser must support their format. Upload local files to an audio host first; Tracks stores links and library metadata, not music files. YouTube links use the embedded player described above.

### Designed for GMs

Tracks was designed to be distraction free and super easy to use in session. We do this by:

- Keeping controls minimal
- The UI streamlined
- Employing a powerful builtin search

Your attention should be on the game, not fiddling with music.

Tracks loops the selected track or clip, making it suitable for background music and ambiance.

## Quick start with [Dropbox](https://www.dropbox.com)

1. Share an **mp3** from [Dropbox](https://www.dropbox.com)

![share](https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/share.png)

2. Make sure it says
   > Anyone with this link **can view**

and click **Copy link**

![copy](https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/copy-link.png)

3. Switch back to **Tracks** and click **Add music**, or use **Add a Track** in the menu

![menu](https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/add.png)

4. Fill in the **Title**, paste the **Url**, and set some **Tags** so you can quickly find the track later

![add](https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/add-track.png)

5. Save!

## Search

![link](https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/search.png)

Tracks searches as you type, highlighting matching keywords on the fly. It specifically looks in two locations, track **title** and **tags**. Be sure use descriptive titles and _lots_ of tags, so you can easily locate your music later while in session. The search is also **fuzzy**, which means minor misspellings or mistakes should be overlooked, because who has time to spell _fantacy_ correctly when your trying to TPK the group?

## Menu

![menu](https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/menu.png)

You can locate the main menu in the top left corner of the extension

### Add a Track

![add](https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/add.png)

![add-track](https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/add-track.png)

Paste a publicly accessible audio **URL** or YouTube video link, choose a **title** and **tags**, and click **Add track**. Start and end times are optional absolute positions in seconds. To paste several links at once, choose **Multiple tracks** and enter one URL per line, optionally prefixed with `Title | URL`.

#### Having trouble filling up your library?

Just ask for some help on [discord](https://discord.gg/u5RYMkV98s) and a community member will be happy to share an importable CSV of their library with you. This is the quickest way to get started.

### CSV

![csv](https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/csv.png)

Tracks stores your library data in the browser. So if you would like to switch computers or browsers use a **CSV** to easily backup your entire library and restore it in a new location.

**TIP:** Sharing **CSV**s is a fun way of sharing your music library with others in the community.

#### Import

To import a CSV, click the **Import csv** button in the menu. The format looks like:

```
title,url,tags
Descriptive Track Title,https://some-place-on-the-internet.com/some.mp3,descriptive tag|another descriptive tag|one more descriptive tag
```

**NOTE:** Tags are separated by the `|` character.

Optional `start,end` columns preserve clip times in seconds. Files using the original three columns remain supported. The whole import is validated before the library is changed.

Imports always **merge** into your library keyed off URL. This means, new URLs will become new tracks in your library, and existing URLs update existing tracks _already_ present in your library.

#### Export

To export a CSV, click the **Export csv** button in the menu. A file named `tracks.csv` will be downloaded to your computer. Use this file to import into another computer and/or browser.

It's probably a good idea to backup your library regularly by exporting it.

### Clear All Tracks

![clear](https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/clear.png)

As it says on the tin, this clears all your tracks. **You might want to export a CSV _before_ doing this**.

## Context Menu

![context](https://raw.githubusercontent.com/hypergig/obr-tracks/main/docs/context.png)

You can **Edit** and **Delete** tracks via the track context menu (ie, right click a track).

The visible **Edit** button also opens the editor. You can change the **URL**, **title**, **tags** and clip times. Updating a URL replaces the saved entry; if that URL already exists, the entries are merged. The room's currently playing copy is unchanged until you select the edited track again.

## Support

The original Tracks project was created by Jordan Cohen: [hypergig/obr-tracks](https://github.com/hypergig/obr-tracks). Report issues with this modified build to the maintainer of the deployment you installed.
