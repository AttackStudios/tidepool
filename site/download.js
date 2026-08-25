/*
 * Builds the download list from the GitHub release.
 *
 * Hardcoding asset URLs would rot: the filenames carry the version, and
 * /releases/latest/download/ 404s while the only release is a prerelease.
 * Reading the API means this page keeps working when 1.0 ships, with no edit.
 */
(function () {
  'use strict'

  var API = 'https://api.github.com/repos/AttackStudios/tidepool/releases'
  var options = document.getElementById('options')
  var locked = document.getElementById('locked')
  var version = document.getElementById('version')

  /** Work out what each asset is, from its name. */
  /** Is this asset one of the app's own builds, rather than shipped content? */
  function isAppBuild(name) {
    return /^tidepool[-_]/i.test(name)
  }

  function classify(asset) {
    var n = asset.name.toLowerCase()
    if (/setup.*\.exe$/.test(n)) {
      return { kind: 'win-installer', title: 'Windows installer', sub: 'Recommended — sets up shortcuts and auto-updates', order: 1 }
    }
    if (/\.exe$/.test(n)) {
      return { kind: 'win-exe', title: 'Windows executable', sub: 'Standalone build', order: 2 }
    }
    if (/(mac|darwin|arm64|x64)?.*\.dmg$/.test(n)) {
      return { kind: 'mac', title: 'macOS disk image', sub: 'For development — Surf Sandbox is Windows only', order: 4 }
    }
    if (/\.zip$/.test(n)) {
      return { kind: 'win-portable', title: 'Windows portable', sub: 'Runs from a folder, no installer, no auto-update', order: 3 }
    }
    return null
  }

  function megabytes(bytes) {
    return (bytes / 1024 / 1024).toFixed(0) + ' MB'
  }

  function card(asset, meta) {
    var a = document.createElement('a')
    // The href is the asset's own browser_download_url, so the file downloads
    // directly rather than bouncing anyone through a GitHub release page.
    a.href = asset.browser_download_url
    a.className = 'dlcard'
    a.setAttribute('download', '')
    a.innerHTML =
      '<div class="dlcard__top">' +
      '<span class="dlcard__title">' + meta.title + '</span>' +
      '<span class="dlcard__size">' + megabytes(asset.size) + '</span>' +
      '</div>' +
      '<p class="dlcard__sub">' + meta.sub + '</p>' +
      '<p class="dlcard__file">' + asset.name + '</p>' +
      '<span class="dlcard__go">Download</span>'
    return a
  }

  function render(release) {
    var assets = (release.assets || [])
      .map(function (a) { return { asset: a, meta: classify(a) } })
      .filter(function (x) { return x.meta })
      .sort(function (a, b) { return a.meta.order - b.meta.order })

    if (assets.length === 0) return

    assets.forEach(function (x) { options.appendChild(card(x.asset, x.meta)) })
    options.hidden = false
    locked.hidden = true

    version.textContent =
      release.name || release.tag_name
    if (release.prerelease) {
      version.textContent += ' — pre-release'
      version.className = 'dlhero__ver dlhero__ver--pre'
    }
  }

  fetch(API)
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)) })
    .then(function (releases) {
      // Only a full release counts. A prerelease is a test build and should not
      // be handed to someone arriving from an announcement.
      // Content ships as releases too, and Break Pack's zip classifies as a
      // Windows portable purely because it ends in .zip. Newest-stable alone
      // would eventually offer a 3 KB level pack as the app.
      var stable = releases.filter(function (r) {
        if (r.prerelease || r.draft) return false
        return (r.assets || []).some(function (a) { return isAppBuild(a.name) })
      })
      if (stable.length > 0) {
        render(stable[0])
      } else {
        version.textContent = 'Releasing 25 August 2026'
      }
    })
    .catch(function () {
      version.textContent = 'Releasing 25 August 2026'
    })
})()
