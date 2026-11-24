/* Old links (invites, password reset, email confirmation) point at "/".
   Forward them to the app with their query string and hash intact. */
(function () {
  var authHash = /access_token=|type=recovery|type=signup|error_code=/.test(location.hash);
  var authQuery = /(^|[?&])(invite|recovery|code)=/.test(location.search);
  if (location.pathname === '/' && (authHash || authQuery)) {
    location.replace('/app/' + location.search + location.hash);
    return;
  }
})();
/* VoxelSpase landing: platform poll (local only) and the "What's new" story. */
(function () {
  // ---- platform poll: the choice is kept on this device; results are not collected yet
  var poll = document.querySelector('.poll-row');
  if (poll) {
    var saved = null;
    try { saved = localStorage.getItem('vs.poll'); } catch (e) {}
    var thanks = document.getElementById('poll-thanks');
    function mark(choice) {
      poll.querySelectorAll('.poll-opt').forEach(function (b) {
        b.classList.toggle('on', b.dataset.poll === choice);
      });
      if (thanks) thanks.hidden = !choice;
    }
    if (saved) mark(saved);
    poll.addEventListener('click', function (e) {
      var b = e.target.closest('.poll-opt');
      if (!b) return;
      try { localStorage.setItem('vs.poll', b.dataset.poll); } catch (err) {}
      mark(b.dataset.poll);
    });
  }

  // ---- "What's new" story
  var stage = document.getElementById('stage');
  if (!stage) return;
  var slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
  var dots = Array.prototype.slice.call(document.querySelectorAll('.w-dots .dot'));
  var bar = document.querySelector('.w-progress i');
  var pp = document.getElementById('pp');
  var skip = document.getElementById('skip');
  var homeHref = (document.querySelector('.w-brand') || {}).href || '/';
  var i = 0, elapsed = 0, paused = false, last = 0;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function show(n) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    elapsed = 0;
    slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
    dots.forEach(function (d, k) { d.classList.toggle('is-on', k === i); });
  }
  function dur() { return Number(slides[i].dataset.dur) || 0; }
  function next() { if (i < slides.length - 1) show(i + 1); else paused = true; }

  function tick(now) {
    if (!last) last = now;
    var dt = now - last;
    last = now;
    var d = dur();
    if (!paused && d > 0) {
      elapsed += dt;
      if (elapsed >= d) next();
    }
    var frac = dur() > 0 ? Math.min(1, elapsed / dur()) : 1;
    if (bar) bar.style.transform = 'scaleX(' + ((i + frac) / slides.length) + ')';
    requestAnimationFrame(tick);
  }

  function togglePause() {
    paused = !paused;
    if (pp) {
      pp.textContent = paused ? '▶' : '❚❚';
      pp.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    }
  }

  if (skip) skip.addEventListener('click', function () { location.href = homeHref; });
  if (pp) pp.addEventListener('click', togglePause);
  dots.forEach(function (d, k) { d.addEventListener('click', function () { show(k); }); });

  // tap left/right side to step back or forward (not on buttons)
  stage.addEventListener('click', function (e) {
    if (e.target.closest('a, button')) return;
    if (e.clientX > innerWidth / 2) next(); else show(i - 1);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'Escape') location.href = homeHref;
  });

  show(0);
  if (reduce) paused = true;
  requestAnimationFrame(tick);
})();
