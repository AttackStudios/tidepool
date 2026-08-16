/* Landing page behaviour: the cycling headline, nav highlighting, and picking
   the right download link for whoever is visiting. */
(function () {
  'use strict'

  // ---- cycling headline ---------------------------------------------------

  var PHRASES = ['Launcher', 'Mod Manager', 'Multiplayer Solution']
  var swap = document.getElementById('swap')
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (swap) {
    var i = 0
    setInterval(function () {
      i = (i + 1) % PHRASES.length
      if (reduce) {
        swap.textContent = PHRASES[i]
        return
      }
      // Fade out, swap the text while it is invisible, fade back in — so the
      // change reads as one motion rather than a flicker.
      swap.classList.add('is-out')
      setTimeout(function () {
        swap.textContent = PHRASES[i]
        swap.classList.remove('is-out')
      }, 220)
    }, 3000)
  }

  // ---- download button follows the visitor's platform ---------------------

  var primary = document.getElementById('dl-primary')
  if (primary && /Mac|iPhone|iPad/.test(navigator.platform || '')) {
    var label = primary.querySelector('span')
    if (label) {
      label.innerHTML =
        'Download for macOS<span class="btn__sub">Surf Sandbox itself is Windows only</span>'
    }
  }

  // ---- nav highlights the section you are actually looking at -------------

  var links = Array.prototype.slice.call(document.querySelectorAll('.navlink[href^="#"]'))
  var targets = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')) })
    .filter(Boolean)

  if ('IntersectionObserver' in window && targets.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return
          links.forEach(function (a) {
            a.classList.toggle('is-on', a.getAttribute('href') === '#' + entry.target.id)
          })
        })
      },
      { rootMargin: '-45% 0px -50% 0px' }
    )
    targets.forEach(function (t) { observer.observe(t) })
  }
})()
