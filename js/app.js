/**
 * Movie Night Matcher — Main App Controller
 * Routes between screens, orchestrates all modules
 */

const App = (() => {
  /* ── State ── */
  const state = {
    screen:       'landing',
    movies:       [],
    currentRoom:  null,
    userId:       null,
    aiEngine:     null,
    swipeDeck:    null,
    threeScene:   null,
    myVotes:      {},   // movieId → 'like'|'dislike'|'superlike'
    roomVotes:    {},   // memberId → { movieId: voteType }
    members:      [],
    matchedMovie: null,
    localMode:    true,
    isHost:       false,
    tmdbKey:      null,
  };

  /* ── DOM refs ── */
  const $ = id => document.getElementById(id);

  /* ── Init ── */
  async function init() {
    console.log('🎬 Movie Night Matcher initializing…');

    // Init Three.js scene
    state.threeScene = new CinematicScene('three-canvas');

    // Init AI engine
    state.aiEngine = new AIEngine();

    // Init Firebase (graceful fail)
    state.localMode = !RoomManager.init();

    // Check TMDB key
    state.tmdbKey = TMDB.getApiKey();

    // Bind global UI events
    _bindGlobalEvents();

    // Show landing
    setTimeout(() => {
      _hideLoading();
      _navigateTo('landing');
    }, 1800);
  }

  /* ── Screen Navigation ── */
  function _navigateTo(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = $(`screen-${screenName}`);
    if (screen) {
      screen.classList.add('active');
      state.screen = screenName;
    }

    // Screen-specific init
    if (screenName === 'landing') _initLandingAnimations();
    if (screenName === 'swipe')   _initSwipeScreen();
    if (screenName === 'match')   _initMatchScreen();
  }

  /* ── Loading ── */
  function _hideLoading() {
    const loader = $('loading-screen');
    if (loader) {
      loader.classList.add('hidden');
      setTimeout(() => loader.remove(), 800);
    }
  }

  /* ── Landing Screen ── */
  function _initLandingAnimations() {
    // Stagger animate feature pills
    document.querySelectorAll('.pill').forEach((pill, i) => {
      pill.style.animationDelay = `${1 + i * 0.1}s`;
      pill.classList.add('anim-fadeInUp');
    });
  }

  /* ── Global Event Bindings ── */
  function _bindGlobalEvents() {
    // Landing CTA buttons
    $('btn-create-room')?.addEventListener('click', () => _showRoomSetup('create'));
    $('btn-join-room')?.addEventListener('click',   () => _showRoomSetup('join'));
    $('nav-logo')?.addEventListener('click', () => _navigateTo('landing'));

    // Room setup form
    $('btn-confirm-create')?.addEventListener('click', _handleCreateRoom);
    $('btn-confirm-join')?.addEventListener('click',   _handleJoinRoom);
    $('btn-back-to-landing')?.addEventListener('click', () => _navigateTo('landing'));

    // Settings modal
    $('btn-settings')?.addEventListener('click', () => _openModal('settings-modal'));
    $('btn-save-settings')?.addEventListener('click', _saveSettings);

    // Lobby
    $('btn-start-swiping')?.addEventListener('click', _startSwiping);
    $('btn-copy-code')?.addEventListener('click', _copyRoomCode);
    $('btn-back-to-room')?.addEventListener('click', () => _navigateTo('room'));

    // Swipe controls
    $('btn-action-dislike')?.addEventListener('click', () => {
      state.swipeDeck?.swipeDislike();
    });
    $('btn-action-like')?.addEventListener('click', () => {
      state.swipeDeck?.swipeLike();
    });
    $('btn-action-superlike')?.addEventListener('click', () => {
      state.swipeDeck?.swipeSuperlike();
    });
    $('btn-action-info')?.addEventListener('click', () => {
      const movie = state.swipeDeck?.getCurrentMovie();
      if (movie) _showMovieDetail(movie);
    });

    // Match screen
    $('btn-watch-again')?.addEventListener('click', () => {
      state.matchedMovie = null;
      _navigateTo('swipe');
    });
    $('btn-new-session')?.addEventListener('click', () => {
      RoomManager.cleanup();
      _navigateTo('landing');
    });

    // Modal overlay clicks
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) _closeAllModals();
      });
    });

    // Detail modal
    $('btn-close-detail')?.addEventListener('click', () => _closeAllModals());

    // TMDB key prompt
    $('btn-save-tmdb')?.addEventListener('click', _saveTmdbKey);
    $('btn-skip-tmdb')?.addEventListener('click', () => {
      _closeAllModals();
      _loadDemoMovies();
    });

    // Tab switching in room screen
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.tab;
        document.querySelectorAll('.tab-panel').forEach(p => {
          p.classList.toggle('active', p.id === target);
        });
      });
    });

    // Genre filter in swipe
    document.querySelectorAll('.genre-filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.genre-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await _loadMoviesByGenre(btn.dataset.genre);
      });
    });
  }

  /* ── Room Setup Modal ── */
  function _showRoomSetup(mode) {
    const createPanel = $('create-panel');
    const joinPanel   = $('join-panel');

    if (mode === 'create') {
      createPanel?.classList.remove('hidden');
      joinPanel?.classList.add('hidden');
    } else {
      joinPanel?.classList.remove('hidden');
      createPanel?.classList.add('hidden');
    }

    _navigateTo('room');
  }

  /* ── Create Room Handler ── */
  async function _handleCreateRoom() {
    const name = $('input-host-name')?.value.trim() || 'Movie Fan';
    if (!name) { _toast('Enter your name', 'error'); return; }

    // Apply TMDB key from form field if provided
    const formTmdbKey = $('input-create-tmdb')?.value.trim();
    if (formTmdbKey) { TMDB.setApiKey(formTmdbKey); state.tmdbKey = formTmdbKey; }

    const btn = $('btn-confirm-create');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    try {
      // Load movies
      let movies = await _fetchMovies();

      const result = await RoomManager.createRoom(name, movies);
      state.currentRoom = result;
      state.userId      = result.userId;
      state.isHost      = true;
      state.movies      = movies;
      state.localMode   = result.local || false;

      _navigateTo('lobby');
      _initLobby(result.code, name, true);
    } catch (e) {
      console.error(e);
      _toast('Failed to create room. Check your connection.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Room';
    }
  }

  /* ── Join Room Handler ── */
  async function _handleJoinRoom() {
    const name = $('input-join-name')?.value.trim() || 'Movie Fan';
    const code = $('input-room-code')?.value.trim().toUpperCase();

    if (!name || !code || code.length !== 6) {
      _toast('Enter your name and a valid 6-digit code', 'error');
      return;
    }

    const btn = $('btn-confirm-join');
    btn.disabled = true;
    btn.textContent = 'Joining…';

    try {
      const result = await RoomManager.joinRoom(code, name);
      state.currentRoom = result;
      state.userId      = result.userId;
      state.isHost      = false;
      state.localMode   = result.local || false;

      // Load movies (same batch if Firebase, fresh if local)
      state.movies = await _fetchMovies();

      _navigateTo('lobby');
      _initLobby(code, name, false);
    } catch (e) {
      const msg = e.message === 'ROOM_NOT_FOUND' ? 'Room not found. Check the code.' :
                  e.message === 'ROOM_ENDED' ? 'This session has ended.' :
                  'Failed to join room.';
      _toast(msg, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Join Room';
    }
  }

  /* ── Fetch Movies ── */
  async function _fetchMovies() {
    if (!TMDB.getApiKey()) {
      return _getDemoMovies();
    }
    try {
      const batch = await TMDB.getSwipeBatch();
      return state.aiEngine.rankMovies(batch);
    } catch (e) {
      console.warn('TMDB fetch failed, using demo data', e);
      return _getDemoMovies();
    }
  }

  /* ── Demo Movies (fallback when no API key) ── */
  function _getDemoMovies() {
    const DEMO = [
      { id:1, title:'Dune: Part Two', year:'2024', rating:'8.0', genres:['Sci-Fi','Adventure','Drama'], overview:'Paul Atreides unites with Chani and the Fremen while on a warpath of revenge against those who destroyed his family.', poster:'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', providers:[] },
      { id:2, title:'Oppenheimer', year:'2023', rating:'8.6', genres:['Drama','History','Thriller'], overview:'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.', poster:'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', providers:[] },
      { id:3, title:'Interstellar', year:'2014', rating:'8.7', genres:['Sci-Fi','Drama','Adventure'], overview:'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.', poster:'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', providers:[] },
      { id:4, title:'The Dark Knight', year:'2008', rating:'9.0', genres:['Action','Crime','Drama'], overview:'When the menace known as the Joker wreaks havoc on Gotham City, Batman must accept one of the greatest tests.', poster:'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', providers:[] },
      { id:5, title:'Parasite', year:'2019', rating:'8.5', genres:['Thriller','Drama','Comedy'], overview:'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and destitute Kim clan.', poster:'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', providers:[] },
      { id:6, title:'Everything Everywhere All at Once', year:'2022', rating:'8.0', genres:['Sci-Fi','Comedy','Action'], overview:'A middle-aged Chinese immigrant is swept up in an insane adventure, where she alone can save the world.', poster:'https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg', providers:[] },
      { id:7, title:'Avengers: Endgame', year:'2019', rating:'8.4', genres:['Action','Sci-Fi','Adventure'], overview:'After the devastating events of Infinity War, the Avengers assemble once more in order to reverse Thanos\'s actions.', poster:'https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg', providers:[] },
      { id:8, title:'The Grand Budapest Hotel', year:'2014', rating:'8.1', genres:['Comedy','Drama'], overview:'A writer encounters the owner of an aging European hotel between the first and second World Wars.', poster:'https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg', providers:[] },
      { id:9, title:'Soul', year:'2020', rating:'8.0', genres:['Animation','Comedy','Drama'], overview:'After landing the gig of a lifetime, a New York jazz musician suddenly finds himself in a fantastical place between Earth and the afterlife.', poster:'https://image.tmdb.org/t/p/w500/hm58Jw4Lw8OIeECIq5Wvoportkn.jpg', providers:[] },
      { id:10, title:'Blade Runner 2049', year:'2017', rating:'8.0', genres:['Sci-Fi','Thriller'], overview:'Officer K, a new blade runner for the LAPD, unearths a long-buried secret that has the potential to plunge what\'s left of society into chaos.', poster:'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg', providers:[] },
      { id:11, title:'Mad Max: Fury Road', year:'2015', rating:'8.1', genres:['Action','Adventure','Sci-Fi'], overview:'In a post-apocalyptic wasteland, a woman rebels against a tyrannical ruler in search of her homeland.', poster:'https://image.tmdb.org/t/p/w500/kqjL17yufvn9OVLyXYpvtyrFfak.jpg', providers:[] },
      { id:12, title:'La La Land', year:'2016', rating:'7.9', genres:['Romance','Drama','Music'], overview:'While navigating their careers in Los Angeles, a pianist and an actress fall in love.', poster:'https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg', providers:[] },
      { id:13, title:'1917', year:'2019', rating:'8.3', genres:['War','Drama'], overview:'Two British soldiers must cross enemy territory and deliver a message that will stop 1,600 men from walking into a deadly trap.', poster:'https://image.tmdb.org/t/p/w500/iZf0KyrE25z1sage4SYFLCCrMi9.jpg', providers:[] },
      { id:14, title:'Joker', year:'2019', rating:'8.4', genres:['Thriller','Crime','Drama'], overview:'Arthur Fleck, a failed comedian and part-time clown, descends into madness and becomes the Joker.', poster:'https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg', providers:[] },
      { id:15, title:'Arrival', year:'2016', rating:'7.9', genres:['Sci-Fi','Drama','Mystery'], overview:'A linguist works with the military to communicate with alien lifeforms after twelve mysterious spacecraft appear around the world.', poster:'https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg', providers:[] },
    ];
    return DEMO;
  }

  async function _loadDemoMovies() {
    state.movies = _getDemoMovies();
    _toast('Using demo movies. Add your TMDB key in Settings for real data.', 'gold');
  }

  async function _loadMoviesByGenre(genreId) {
    if (!TMDB.getApiKey()) return;
    try {
      const movies = await TMDB.getByGenre(parseInt(genreId));
      state.movies = state.aiEngine.rankMovies(movies);
      state.swipeDeck?.load(state.movies);
      _toast('Loaded ' + state.movies.length + ' movies', 'success');
    } catch {}
  }

  /* ── Lobby ── */
  function _initLobby(code, userName, isHost) {
    // Display room code
    const codeEl = $('lobby-room-code');
    if (codeEl) codeEl.textContent = code;

    // Generate QR code
    _generateQR(code);

    // Add self to members list
    _updateMembersUI([
      { id: state.userId, name: userName, emoji: '🎬', isSelf: true }
    ]);

    // Host can start, guest waits
    const startBtn = $('btn-start-swiping');
    if (startBtn) {
      startBtn.style.display = isHost ? 'flex' : 'none';
    }

    const waitMsg = $('lobby-wait-msg');
    if (waitMsg) {
      waitMsg.style.display = isHost ? 'none' : 'flex';
    }

    // Listen for room updates (Firebase)
    if (!state.localMode) {
      RoomManager.onRoomUpdate(room => {
        const members = Object.entries(room.members || {}).map(([id, m]) => ({
          id, name: m.name, emoji: m.emoji, isSelf: id === state.userId
        }));
        _updateMembersUI(members);

        if (room.status === 'swiping' && state.screen !== 'swipe') {
          _startSwiping();
        }
        if (room.status === 'matched' && room.matchedMovie) {
          const movie = state.movies.find(m => m.id === room.matchedMovie) ||
                        (room.movieData?.[room.matchedMovie] ? _normalizeFirebaseMovie(room.movieData[room.matchedMovie]) : null);
          if (movie) _showMatch(movie);
        }
      });
    }

    // Simulate a second member joining (demo)
    if (state.localMode && isHost) {
      setTimeout(() => {
        _updateMembersUI([
          { id: state.userId, name: userName, emoji: '🎬', isSelf: true },
          { id: 'demo_friend', name: 'Demo Friend', emoji: '🍿', isSelf: false },
        ]);
        _toast('Demo Friend joined! 🍿', 'success');
      }, 2000);
    }
  }

  function _updateMembersUI(members) {
    state.members = members;
    const container = $('lobby-members-list');
    if (!container) return;

    container.innerHTML = members.map(m => `
      <div class="member-card ${m.isSelf ? 'is-self' : ''}" style="animation-delay:${Math.random()*0.3}s">
        <div class="member-avatar">
          <span>${m.emoji}</span>
          <div class="member-status"></div>
        </div>
        <div class="member-name">${m.isSelf ? m.name + ' (you)' : m.name}</div>
      </div>
    `).join('');

    // Update start button state
    const startBtn = $('btn-start-swiping');
    if (startBtn) {
      startBtn.disabled = members.length < 2;
      startBtn.title = members.length < 2 ? 'Waiting for at least one more person…' : '';
    }
  }

  function _generateQR(code) {
    const qrContainer = $('qr-code-container');
    if (!qrContainer) return;

    const url = `${window.location.href.split('?')[0]}?join=${code}`;
    // Use a QR library CDN if available, else display text
    if (window.QRCode) {
      qrContainer.innerHTML = '';
      new QRCode(qrContainer, {
        text: url,
        width: 120,
        height: 120,
        colorDark: '#0A0A0F',
        colorLight: '#ffffff',
      });
    } else {
      qrContainer.innerHTML = `
        <div style="text-align:center; padding: 12px;">
          <div style="font-size:0.65rem; color:var(--clr-text-muted); letter-spacing:0.08em; margin-bottom:4px;">SHARE LINK</div>
          <div style="font-size:0.7rem; color:var(--clr-gold); word-break:break-all;">${url}</div>
        </div>
      `;
    }
  }

  function _copyRoomCode() {
    const code = $('lobby-room-code')?.textContent;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      _toast('Room code copied! 📋', 'gold');
    });
  }

  /* ── Start Swiping ── */
  async function _startSwiping() {
    if (!state.localMode) {
      await RoomManager.startSwiping();
    }
    _navigateTo('swipe');
  }

  /* ── Swipe Screen ── */
  function _initSwipeScreen() {
    const deckContainer = $('card-stack');
    if (!deckContainer) return;

    // Clear old deck
    deckContainer.innerHTML = '';

    // Init SwipeDeck
    state.swipeDeck = new SwipeDeck({
      container: deckContainer,
      onLike:      movie => _handleVote(movie, 'like'),
      onDislike:   movie => _handleVote(movie, 'dislike'),
      onSuperlike: movie => _handleVote(movie, 'superlike'),
      onEmpty:     () => _handleDeckEmpty(),
      onFlip:      movie => _showMovieDetail(movie),
    });

    state.swipeDeck.load(state.movies);

    // Update room stats
    _updateSwipeStats();

    // Update member vote avatars
    _initVoteAvatars();

    // Lazy-load providers for top 5 movies
    _enrichTopMovies();
  }

  async function _enrichTopMovies() {
    const top = state.movies.slice(0, 5);
    for (const movie of top) {
      if (!movie.providers || movie.providers.length === 0) {
        try {
          const enriched = await TMDB.enrichMovie(movie);
          Object.assign(movie, enriched);
          state.swipeDeck?.updateCardBadges(movie.id, enriched.providers);
        } catch {}
      }
    }
  }

  function _initVoteAvatars() {
    const container = $('vote-avatars');
    if (!container) return;

    container.innerHTML = state.members.map(m => `
      <div class="vote-avatar" id="vote-avatar-${m.id}" title="${m.name}">
        ${m.emoji || '🎬'}
      </div>
    `).join('');
  }

  function _updateSwipeStats() {
    const stats = state.aiEngine.getStats();
    const taste = state.aiEngine.getTasteSummary();

    const moodEl = $('swipe-mood');
    if (moodEl) moodEl.textContent = taste.emoji + ' ' + taste.mood;

    const countEl = $('swipe-count');
    if (countEl) countEl.textContent = `${stats.liked + stats.superliked}/${state.movies.length}`;
  }

  /* ── Handle Vote ── */
  async function _handleVote(movie, voteType) {
    if (!movie) return;

    // Record in AI engine
    if (voteType === 'like')      state.aiEngine.recordLike(movie);
    if (voteType === 'dislike')   state.aiEngine.recordDislike(movie);
    if (voteType === 'superlike') state.aiEngine.recordSuperlike(movie);

    // Record in state
    state.myVotes[movie.id] = voteType;

    // Record in Firebase / local
    await RoomManager.recordVote(movie.id, voteType);

    // Update vote avatar
    const avatarEl = $(`vote-avatar-${state.userId}`);
    if (avatarEl) {
      avatarEl.className = `vote-avatar voted-${voteType}`;
      setTimeout(() => avatarEl.className = 'vote-avatar', 800);
    }

    // Update stats
    _updateSwipeStats();

    // Check for match (local mode)
    if (state.localMode) {
      await _checkLocalMatch(movie, voteType);
    }

    // Enrich next card lazily
    const nextMovie = state.swipeDeck?.getCurrentMovie();
    if (nextMovie && !nextMovie.providers?.length) {
      TMDB.enrichMovie(nextMovie).then(enriched => {
        Object.assign(nextMovie, enriched);
        state.swipeDeck?.updateCardBadges(nextMovie.id, enriched.providers);
      }).catch(() => {});
    }
  }

  /* ── Local Match Check (simulated) ── */
  async function _checkLocalMatch(movie, myVote) {
    // Simulate: "Demo Friend" also votes randomly with slight preference to like
    const friendVote = Math.random() > 0.35 ? 'like' : 'dislike';

    // Update friend avatar
    const friendAvatar = $('vote-avatar-demo_friend');
    if (friendAvatar) {
      friendAvatar.className = `vote-avatar voted-${friendVote}`;
      setTimeout(() => friendAvatar.className = 'vote-avatar', 800);
    }

    const didMatch = (myVote === 'like' || myVote === 'superlike') &&
                     (friendVote === 'like' || friendVote === 'superlike');

    if (didMatch) {
      // Enrich movie before showing match
      let matchMovie = movie;
      try {
        matchMovie = await TMDB.enrichMovie(movie);
        Object.assign(movie, matchMovie);
      } catch {}

      await new Promise(r => setTimeout(r, 500));
      _showMatch(movie);
    }
  }

  /* ── Deck Empty ── */
  function _handleDeckEmpty() {
    _toast('You\'ve seen all movies! Loading more…', 'gold');
    setTimeout(async () => {
      state.movies = await _fetchMovies();
      state.swipeDeck?.load(state.movies);
    }, 1500);
  }

  /* ── Match Screen ── */
  function _showMatch(movie) {
    state.matchedMovie = movie;

    // Trigger confetti
    _launchConfetti();

    // Navigate to match
    _navigateTo('match');
  }

  function _initMatchScreen() {
    const movie = state.matchedMovie;
    if (!movie) return;

    // Movie poster
    const poster = $('match-poster');
    if (poster) { poster.src = movie.poster; poster.alt = movie.title; }

    // Title, overview
    const titleEl = $('match-movie-title');
    if (titleEl) titleEl.textContent = movie.title;

    const overviewEl = $('match-overview');
    if (overviewEl) overviewEl.textContent = movie.overview || '';

    // Meta
    const metaEl = $('match-meta');
    if (metaEl) {
      metaEl.innerHTML = `
        <span>${movie.year}</span>
        ${movie.rating ? `<span>⭐ ${movie.rating}</span>` : ''}
        ${movie.runtime ? `<span>${movie.runtime}</span>` : ''}
        ${(movie.genres || []).map(g => `<span class="genre-tag">${g}</span>`).join('')}
      `;
    }

    // Streaming providers
    _renderMatchStreamingList(movie.providers || []);

    // Load trailer
    _loadMatchTrailer(movie);

    // Taste summary
    const taste = state.aiEngine.getTasteSummary();
    const tasteEl = $('match-taste');
    if (tasteEl) {
      tasteEl.innerHTML = `
        <span>${taste.emoji}</span>
        <span style="color:var(--clr-gold); font-weight:600">${taste.mood}</span>
        <span style="color:var(--clr-text-muted)"> · Loves ${taste.topGenres.slice(0,2).join(', ')}</span>
      `;
    }
  }

  function _renderMatchStreamingList(providers) {
    const container = $('match-streaming-list');
    if (!container) return;

    if (!providers || providers.length === 0) {
      container.innerHTML = `
        <div class="streaming-row">
          <div style="font-size:1.2rem">🔍</div>
          <div class="streaming-row-info">
            <div class="streaming-row-name">Not available on major platforms</div>
            <div class="streaming-row-type">Try searching your favorite service</div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = providers.slice(0, 5).map(p => `
      <div class="streaming-row">
        <div class="streaming-row-icon ${p.cssClass}">${p.letter}</div>
        <div class="streaming-row-info">
          <div class="streaming-row-name">${p.name}</div>
          <div class="streaming-row-type">${p.type === 'rent' ? 'Rent' : p.type === 'buy' ? 'Buy' : 'Streaming'}</div>
        </div>
        <span style="color:var(--clr-text-muted); font-size:0.8rem">›</span>
      </div>
    `).join('');
  }

  async function _loadMatchTrailer(movie) {
    const trailerContainer = $('match-trailer-container');
    if (!trailerContainer) return;

    if (!TMDB.getApiKey()) {
      trailerContainer.style.display = 'none';
      return;
    }

    try {
      const key = await TMDB.getTrailerKey(movie.id);
      if (key) {
        trailerContainer.innerHTML = `
          <div style="position:relative; padding-bottom:56.25%; border-radius:var(--radius-lg); overflow:hidden; margin-top:var(--sp-lg);">
            <iframe
              src="https://www.youtube.com/embed/${key}?autoplay=1&mute=1&rel=0&modestbranding=1"
              style="position:absolute; inset:0; width:100%; height:100%; border:none;"
              allow="autoplay; fullscreen"
              loading="lazy"
            ></iframe>
          </div>
        `;
      }
    } catch {}
  }

  /* ── Movie Detail Modal ── */
  async function _showMovieDetail(movie) {
    const modal = $('detail-modal');
    if (!modal) return;

    modal.querySelector('.modal-panel').innerHTML = `
      <div class="modal-handle"></div>
      <div style="display:flex; gap:var(--sp-lg); align-items:flex-start;">
        <img src="${movie.poster}" alt="${movie.title}"
             style="width:100px; height:150px; object-fit:cover; border-radius:var(--radius-md); flex-shrink:0; box-shadow:var(--shadow-card);">
        <div style="flex:1; display:flex; flex-direction:column; gap:var(--sp-sm);">
          <div style="font-family:var(--font-display); font-size:1.4rem; font-weight:800; line-height:1.2;">${movie.title}</div>
          <div style="display:flex; gap:var(--sp-sm); flex-wrap:wrap; align-items:center;">
            <span style="color:var(--clr-text-muted); font-size:0.8rem;">${movie.year}</span>
            ${movie.rating ? `<span style="color:var(--clr-gold); font-size:0.8rem; font-weight:700;">⭐ ${movie.rating}</span>` : ''}
            ${movie.runtime ? `<span style="color:var(--clr-text-muted); font-size:0.8rem;">${movie.runtime}</span>` : ''}
          </div>
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            ${(movie.genres || []).map(g => `<span class="genre-tag">${g}</span>`).join('')}
          </div>
        </div>
      </div>

      <p style="color:var(--clr-text-secondary); font-size:0.9rem; line-height:1.7; margin-top:var(--sp-lg);">
        ${movie.overview || 'No description available.'}
      </p>

      <div style="margin-top:var(--sp-lg);">
        <div style="font-size:0.7rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--clr-text-muted); margin-bottom:var(--sp-sm);">Where to Watch</div>
        <div id="detail-streaming-list">
          ${movie.providers?.length
            ? movie.providers.slice(0, 5).map(p => `
                <div class="streaming-row">
                  <div class="streaming-row-icon ${p.cssClass}">${p.letter}</div>
                  <div class="streaming-row-info">
                    <div class="streaming-row-name">${p.name}</div>
                    <div class="streaming-row-type">${p.type === 'rent' ? 'Rent' : 'Streaming'}</div>
                  </div>
                </div>
              `).join('')
            : '<div class="streaming-row"><span>Loading streaming info…</span></div>'
          }
        </div>
      </div>

      <div style="display:flex; gap:var(--sp-md); margin-top:var(--sp-xl);">
        <button class="btn btn-primary" onclick="App.swipeLikeFromDetail(${movie.id})">👍 Like</button>
        <button class="btn btn-ghost" onclick="App.swipeDislikeFromDetail(${movie.id})">👎 Nope</button>
        <button class="btn btn-ghost" id="btn-close-detail" onclick="App.closeDetail()">✕ Close</button>
      </div>
    `;

    modal.classList.add('open');

    // Enrich if needed
    if (!movie.providers?.length && TMDB.getApiKey()) {
      try {
        const enriched = await TMDB.enrichMovie(movie);
        Object.assign(movie, enriched);
        const listEl = document.getElementById('detail-streaming-list');
        if (listEl) {
          listEl.innerHTML = enriched.providers.slice(0, 5).map(p => `
            <div class="streaming-row">
              <div class="streaming-row-icon ${p.cssClass}">${p.letter}</div>
              <div class="streaming-row-info">
                <div class="streaming-row-name">${p.name}</div>
                <div class="streaming-row-type">${p.type === 'rent' ? 'Rent' : 'Streaming'}</div>
              </div>
            </div>
          `).join('') || '<div class="streaming-row"><span>Not found on major streaming platforms</span></div>';
        }
        state.swipeDeck?.updateCardBadges(movie.id, enriched.providers);
      } catch {}
    }
  }

  /* ── Confetti ── */
  function _launchConfetti() {
    const COLORS = ['#D4A017', '#F5C842', '#FF4455', '#1CE783', '#A855F7', '#fff'];
    for (let i = 0; i < 80; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'confetti-particle';
        el.style.cssText = `
          left: ${Math.random() * 100}vw;
          background: ${COLORS[Math.floor(Math.random() * COLORS.length)]};
          width: ${6 + Math.random() * 8}px;
          height: ${6 + Math.random() * 8}px;
          animation-duration: ${2 + Math.random() * 2}s;
          animation-delay: ${Math.random() * 0.5}s;
          border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        `;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
      }, i * 30);
    }
  }

  /* ── Settings ── */
  function _saveSettings() {
    const key = $('input-tmdb-key')?.value.trim();
    if (key) {
      TMDB.setApiKey(key);
      state.tmdbKey = key;
      _toast('TMDB API key saved! ✓', 'success');
    }
    _closeAllModals();
  }

  function _saveTmdbKey() {
    const key = $('input-tmdb-setup-key')?.value.trim();
    if (!key) { _toast('Please enter your API key', 'error'); return; }
    TMDB.setApiKey(key);
    state.tmdbKey = key;
    _closeAllModals();
    _toast('TMDB connected! 🎬', 'success');
  }

  /* ── Modals ── */
  function _openModal(id) {
    const modal = $(id);
    if (modal) modal.classList.add('open');
  }

  function _closeAllModals() {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }

  /* ── Toast Notifications ── */
  function _toast(message, type = 'info') {
    const container = $('toast-container');
    if (!container) return;

    const icons = { success: '✅', error: '❌', gold: '⭐', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type === 'gold' ? 'gold' : type === 'success' ? 'success' : type === 'error' ? 'error' : ''}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('show'));
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }, 3500);
  }

  /* ── Helpers for inline onclick ── */
  function swipeLikeFromDetail(movieId) {
    _closeAllModals();
    state.swipeDeck?.swipeLike();
  }

  function swipeDislikeFromDetail(movieId) {
    _closeAllModals();
    state.swipeDeck?.swipeDislike();
  }

  function closeDetail() {
    _closeAllModals();
  }

  function _normalizeFirebaseMovie(m) {
    return { ...m, providers: [], runtime: '' };
  }

  /* ── URL Param: ?join=CODE ── */
  function _checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode) {
      setTimeout(() => {
        _showRoomSetup('join');
        const codeInput = $('input-room-code');
        if (codeInput) codeInput.value = joinCode;
      }, 2000);
    }
  }

  return {
    init,
    swipeLikeFromDetail,
    swipeDislikeFromDetail,
    closeDetail,
    toast: _toast,
    navigateTo: _navigateTo,
  };
})();

// Boot
window.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
