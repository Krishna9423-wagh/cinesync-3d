/**
 * Movie Night Matcher — AI Preference Engine
 * Analyzes swipe history → smart recommendations
 */

class AIEngine {
  constructor() {
    this.likes      = [];
    this.dislikes   = [];
    this.superlikes = [];
    this.history    = JSON.parse(localStorage.getItem('mnm_ai_history') || '{}');
  }

  /* ── Record a vote ── */
  recordLike(movie)      { this._record(movie, 'like'); }
  recordDislike(movie)   { this._record(movie, 'dislike'); }
  recordSuperlike(movie) { this._record(movie, 'superlike'); }

  _record(movie, type) {
    if (!movie) return;

    const entry = { id: movie.id, genres: movie.genres || [], rating: movie.rating, type };
    if (type === 'like')      this.likes.push(entry);
    if (type === 'dislike')   this.dislikes.push(entry);
    if (type === 'superlike') this.superlikes.push(entry);

    // Update persistent history
    if (!this.history[movie.id]) this.history[movie.id] = {};
    this.history[movie.id] = { type, genres: movie.genres, rating: movie.rating };
    localStorage.setItem('mnm_ai_history', JSON.stringify(this.history));
  }

  /* ── Genre preference scoring ── */
  getGenreScores() {
    const scores = {};

    this.superlikes.forEach(m => {
      m.genres.forEach(g => { scores[g] = (scores[g] || 0) + 3; });
    });
    this.likes.forEach(m => {
      m.genres.forEach(g => { scores[g] = (scores[g] || 0) + 1; });
    });
    this.dislikes.forEach(m => {
      m.genres.forEach(g => { scores[g] = (scores[g] || 0) - 1; });
    });

    return scores;
  }

  /* ── Score a movie for recommendation ── */
  scoreMovie(movie) {
    const genreScores = this.getGenreScores();
    let score = 0;

    (movie.genres || []).forEach(g => {
      score += genreScores[g] || 0;
    });

    // Already seen penalty
    if (this.history[movie.id]) {
      score -= 100;
    }

    // Rating bonus
    const r = parseFloat(movie.rating);
    if (!isNaN(r)) {
      score += (r - 5) * 0.5;
    }

    return score;
  }

  /* ── Sort/tag a movie batch using AI ── */
  rankMovies(movies) {
    const scored = movies.map(m => ({ ...m, _aiScore: this.scoreMovie(m) }));
    scored.sort((a, b) => b._aiScore - a._aiScore);

    // Tag top 3 AI picks
    scored.slice(0, 3).forEach((m, i) => {
      if (m._aiScore > 0) m._aiPick = true;
    });

    return scored;
  }

  /* ── Generate taste summary for display ── */
  getTasteSummary() {
    const scores = this.getGenreScores();
    const sorted = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .filter(([, v]) => v > 0);

    if (sorted.length === 0) {
      return { topGenres: [], mood: 'Explorer', emoji: '🎬' };
    }

    const topGenres = sorted.slice(0, 3).map(([g]) => g);

    let mood = 'Film Buff';
    let emoji = '🎬';

    if (topGenres.includes('Horror') || topGenres.includes('Thriller')) {
      mood = 'Thrill Seeker'; emoji = '😱';
    } else if (topGenres.includes('Romance') || topGenres.includes('Drama')) {
      mood = 'Romantic Heart'; emoji = '💖';
    } else if (topGenres.includes('Action') || topGenres.includes('Adventure')) {
      mood = 'Adrenaline Junkie'; emoji = '⚡';
    } else if (topGenres.includes('Comedy')) {
      mood = 'Laugh Lover'; emoji = '😂';
    } else if (topGenres.includes('Sci-Fi') || topGenres.includes('Fantasy')) {
      mood = 'Dreamer'; emoji = '🚀';
    } else if (topGenres.includes('Animation') || topGenres.includes('Family')) {
      mood = 'Inner Child'; emoji = '✨';
    }

    return { topGenres, mood, emoji };
  }

  /* ── Check if a movie was already seen ── */
  isSeen(movieId) {
    return !!this.history[movieId];
  }

  /* ── Clear history ── */
  reset() {
    this.likes = [];
    this.dislikes = [];
    this.superlikes = [];
    this.history = {};
    localStorage.removeItem('mnm_ai_history');
  }

  /* ── Stats ── */
  getStats() {
    return {
      liked:      this.likes.length,
      disliked:   this.dislikes.length,
      superliked: this.superlikes.length,
      seen:       Object.keys(this.history).length,
    };
  }
}

window.AIEngine = AIEngine;
