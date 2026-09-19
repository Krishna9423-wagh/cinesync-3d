/**
 * Movie Night Matcher — Swipe Deck
 * Touch + mouse drag physics, card stack, stamps, animations
 */

class SwipeDeck {
  constructor(options = {}) {
    this.container  = options.container;
    this.onLike     = options.onLike     || (() => {});
    this.onDislike  = options.onDislike  || (() => {});
    this.onSuperlike= options.onSuperlike|| (() => {});
    this.onEmpty    = options.onEmpty    || (() => {});
    this.onFlip     = options.onFlip     || (() => {});

    this.movies     = [];
    this.currentIdx = 0;
    this.cards      = [];
    this.isDragging = false;
    this.startX     = 0;
    this.startY     = 0;
    this.currentX   = 0;
    this.currentY   = 0;
    this.activeCard = null;

    this.SWIPE_THRESHOLD = 80;
    this.ROTATION_FACTOR = 0.08;
    this.VERTICAL_THRESHOLD = -100;
  }

  /* ── Load Movies into Deck ── */
  load(movies) {
    this.movies     = movies;
    this.currentIdx = 0;
    this.container.innerHTML = '';
    this.cards      = [];
    this._renderTop3();
  }

  _renderTop3() {
    this.container.innerHTML = '';
    this.cards = [];

    const limit = Math.min(3, this.movies.length - this.currentIdx);
    for (let i = limit - 1; i >= 0; i--) {
      const movie = this.movies[this.currentIdx + i];
      if (!movie) continue;
      const card = this._createCard(movie, i);
      this.container.appendChild(card);
      this.cards.unshift(card);
    }

    if (this.cards.length > 0) {
      this._attachDragListeners(this.cards[0]);
    }
  }

  _createCard(movie, stackIdx) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.dataset.movieId = movie.id;

    card.innerHTML = `
      <img class="card-poster" src="${movie.poster}" alt="${movie.title}" draggable="false"
           loading="${stackIdx === 0 ? 'eager' : 'lazy'}">
      <div class="card-gradient-overlay"></div>

      <!-- Stamps -->
      <div class="stamp-like">LIKE</div>
      <div class="stamp-dislike">NOPE</div>
      <div class="stamp-superlike">⭐ SUPER</div>

      <!-- AI Badge -->
      ${movie._aiPick ? '<div class="ai-badge">✦ AI Pick</div>' : ''}

      <!-- Card info -->
      <div class="card-info">
        <div class="streaming-badges" id="badges-${movie.id}">
          ${this._renderStreamingBadges(movie.providers || [])}
        </div>
        <div class="card-genres">
          ${(movie.genres || []).map(g => `<span class="genre-tag">${g}</span>`).join('')}
        </div>
        <div class="card-title">${movie.title}</div>
        <div class="card-meta">
          <span class="card-year">${movie.year}</span>
          ${movie.rating ? `<span class="card-rating">⭐ ${movie.rating}</span>` : ''}
          ${movie.runtime ? `<span class="card-runtime">· ${movie.runtime}</span>` : ''}
        </div>
      </div>
    `;

    // Style stack position
    if (stackIdx === 1) {
      card.style.transform = 'translateY(12px) scale(0.96)';
      card.style.zIndex = '1';
    } else if (stackIdx === 2) {
      card.style.transform = 'translateY(24px) scale(0.92)';
      card.style.zIndex = '0';
    } else {
      card.style.zIndex = '3';
    }

    // Double-click to flip/detail
    card.addEventListener('dblclick', () => {
      this.onFlip(movie);
    });

    return card;
  }

  _renderStreamingBadges(providers) {
    if (!providers || providers.length === 0) return '';
    return providers.slice(0, 4).map(p =>
      `<span class="streaming-badge ${p.cssClass}" title="${p.name}">${p.letter}</span>`
    ).join('');
  }

  /* ── Update badges after enrichment ── */
  updateCardBadges(movieId, providers) {
    const el = document.getElementById(`badges-${movieId}`);
    if (el) el.innerHTML = this._renderStreamingBadges(providers);
  }

  /* ── Drag/Touch Listeners ── */
  _attachDragListeners(card) {
    const onPointerDown = (e) => {
      if (e.target.classList.contains('streaming-badge') ||
          e.target.classList.contains('genre-tag')) return;
      this.isDragging = true;
      this.activeCard = card;
      const pos = e.touches ? e.touches[0] : e;
      this.startX = pos.clientX;
      this.startY = pos.clientY;
      card.style.transition = 'none';
      card.style.willChange = 'transform';
    };

    const onPointerMove = (e) => {
      if (!this.isDragging || this.activeCard !== card) return;
      const pos = e.touches ? e.touches[0] : e;
      this.currentX = pos.clientX - this.startX;
      this.currentY = pos.clientY - this.startY;

      const rotation = this.currentX * this.ROTATION_FACTOR;
      card.style.transform =
        `translate(${this.currentX}px, ${this.currentY}px) rotate(${rotation}deg)`;

      // Show stamps
      const like    = card.querySelector('.stamp-like');
      const dislike = card.querySelector('.stamp-dislike');
      const superl  = card.querySelector('.stamp-superlike');

      const ratio = Math.abs(this.currentX) / this.SWIPE_THRESHOLD;

      if (this.currentY < this.VERTICAL_THRESHOLD && Math.abs(this.currentX) < 40) {
        // Super like (swipe up)
        superl.style.opacity = Math.min(1, Math.abs(this.currentY) / 80);
        like.style.opacity   = 0;
        dislike.style.opacity= 0;
      } else if (this.currentX > 0) {
        like.style.opacity    = Math.min(1, ratio);
        dislike.style.opacity = 0;
        superl.style.opacity  = 0;
      } else {
        dislike.style.opacity = Math.min(1, ratio);
        like.style.opacity    = 0;
        superl.style.opacity  = 0;
      }
    };

    const onPointerUp = () => {
      if (!this.isDragging || this.activeCard !== card) return;
      this.isDragging = false;

      card.style.transition = '';
      card.style.willChange = '';

      const dx = this.currentX;
      const dy = this.currentY;

      if (dy < this.VERTICAL_THRESHOLD && Math.abs(dx) < 60) {
        this._triggerSuperlike(card);
      } else if (dx > this.SWIPE_THRESHOLD) {
        this._triggerLike(card);
      } else if (dx < -this.SWIPE_THRESHOLD) {
        this._triggerDislike(card);
      } else {
        // Snap back
        card.style.transform = '';
        card.querySelector('.stamp-like').style.opacity    = 0;
        card.querySelector('.stamp-dislike').style.opacity = 0;
        card.querySelector('.stamp-superlike').style.opacity = 0;
      }

      this.currentX = 0;
      this.currentY = 0;
    };

    card.addEventListener('mousedown',  onPointerDown);
    card.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('mousemove',  onPointerMove);
    document.addEventListener('touchmove',  onPointerMove, { passive: true });
    document.addEventListener('mouseup',    onPointerUp);
    document.addEventListener('touchend',   onPointerUp);

    // Clean up when card leaves
    card._cleanup = () => {
      document.removeEventListener('mousemove',  onPointerMove);
      document.removeEventListener('touchmove',  onPointerMove);
      document.removeEventListener('mouseup',    onPointerUp);
      document.removeEventListener('touchend',   onPointerUp);
    };
  }

  /* ── Swipe Triggers ── */
  _triggerLike(card) {
    const movie = this._movieFromCard(card);
    card.classList.add('is-leaving-right');
    card.querySelector('.stamp-like').style.opacity = 1;
    setTimeout(() => this._advanceDeck(card), 450);
    this.onLike(movie);
  }

  _triggerDislike(card) {
    const movie = this._movieFromCard(card);
    card.classList.add('is-leaving-left');
    card.querySelector('.stamp-dislike').style.opacity = 1;
    setTimeout(() => this._advanceDeck(card), 450);
    this.onDislike(movie);
  }

  _triggerSuperlike(card) {
    const movie = this._movieFromCard(card);
    card.classList.add('is-leaving-up');
    card.querySelector('.stamp-superlike').style.opacity = 1;
    setTimeout(() => this._advanceDeck(card), 400);
    this.onSuperlike(movie);
  }

  _advanceDeck(removedCard) {
    if (removedCard._cleanup) removedCard._cleanup();
    removedCard.remove();
    this.cards.shift();
    this.currentIdx++;

    // Animate remaining cards up
    if (this.cards[0]) {
      this.cards[0].style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
      this.cards[0].style.transform = 'translateY(0) scale(1)';
      this.cards[0].style.zIndex = '3';
      this._attachDragListeners(this.cards[0]);
    }
    if (this.cards[1]) {
      this.cards[1].style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
      this.cards[1].style.transform = 'translateY(12px) scale(0.96)';
      this.cards[1].style.zIndex = '1';
    }

    // Load next card into stack
    const nextIdx = this.currentIdx + 2;
    if (nextIdx < this.movies.length) {
      const newCard = this._createCard(this.movies[nextIdx], 2);
      newCard.style.transform = 'translateY(24px) scale(0.92)';
      newCard.style.zIndex = '0';
      newCard.style.opacity = '0';
      this.container.insertBefore(newCard, this.container.firstChild);
      this.cards.push(newCard);
      requestAnimationFrame(() => {
        newCard.style.transition = 'opacity 0.3s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
        newCard.style.opacity = '1';
      });
    }

    if (this.cards.length === 0) {
      this.onEmpty();
    }
  }

  _movieFromCard(card) {
    const id = parseInt(card.dataset.movieId);
    return this.movies.find(m => m.id === id);
  }

  /* ── Programmatic swipe (button clicks) ── */
  swipeLike()     { if (this.cards[0]) this._triggerLike(this.cards[0]); }
  swipeDislike()  { if (this.cards[0]) this._triggerDislike(this.cards[0]); }
  swipeSuperlike(){ if (this.cards[0]) this._triggerSuperlike(this.cards[0]); }

  getCurrentMovie() {
    if (!this.cards[0]) return null;
    return this._movieFromCard(this.cards[0]);
  }
}

window.SwipeDeck = SwipeDeck;
