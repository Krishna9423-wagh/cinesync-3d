/**
 * Movie Night Matcher — TMDB API Integration
 * Fetches movies, details, streaming providers
 *
 * SETUP: Replace YOUR_TMDB_API_KEY with your actual key from themoviedb.org
 */

const TMDB = (() => {
  const BASE    = 'https://api.themoviedb.org/3';
  const IMG_BASE = 'https://image.tmdb.org/t/p';
  // ⚠️ Replace with your TMDB API key:
  let API_KEY   = localStorage.getItem('mnm_tmdb_key') || '';

  const REGION  = 'IN'; // Change to your country code for accurate streaming data

  const GENRE_MAP = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller',
    10752: 'War', 37: 'Western', 10770: 'TV Movie',
  };

  const PROVIDER_META = {
    8:   { name: 'Netflix',       class: 'sb-netflix',  letter: 'N' },
    9:   { name: 'Amazon Prime',  class: 'sb-prime',    letter: 'P' },
    337: { name: 'Disney+',       class: 'sb-disney',   letter: 'D+' },
    384: { name: 'HBO Max',       class: 'sb-hbo',      letter: 'HBO' },
    15:  { name: 'Hulu',          class: 'sb-hulu',     letter: 'H' },
    2:   { name: 'Apple TV+',     class: 'sb-apple',    letter: '🍎' },
    283: { name: 'Crunchyroll',   class: 'sb-default',  letter: 'CR' },
    11:  { name: 'MUBI',          class: 'sb-default',  letter: 'M' },
    191: { name: 'Star+',         class: 'sb-default',  letter: 'S+' },
  };

  function setApiKey(key) {
    API_KEY = key;
    localStorage.setItem('mnm_tmdb_key', key);
  }

  function getApiKey() { return API_KEY; }

  async function fetchJSON(endpoint, params = {}) {
    if (!API_KEY) throw new Error('NO_API_KEY');
    const url = new URL(`${BASE}${endpoint}`);
    url.searchParams.set('api_key', API_KEY);
    url.searchParams.set('language', 'en-US');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) {
      if (res.status === 401) throw new Error('INVALID_KEY');
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }

  function posterUrl(path, size = 'w500') {
    if (!path) return 'https://via.placeholder.com/500x750/1a1a2e/D4A017?text=No+Poster';
    return `${IMG_BASE}/${size}${path}`;
  }

  function backdropUrl(path, size = 'w1280') {
    if (!path) return '';
    return `${IMG_BASE}/${size}${path}`;
  }

  function mapGenres(ids = []) {
    return ids.slice(0, 3).map(id => GENRE_MAP[id]).filter(Boolean);
  }

  function formatRuntime(mins) {
    if (!mins) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  /* ── Fetch popular movies (paginated) ── */
  async function getPopular(page = 1) {
    const data = await fetchJSON('/movie/popular', { page });
    return data.results.map(normalizeMovie);
  }

  /* ── Fetch trending (week) ── */
  async function getTrending(page = 1) {
    const data = await fetchJSON('/trending/movie/week', { page });
    return data.results.map(normalizeMovie);
  }

  /* ── Fetch by genre ── */
  async function getByGenre(genreId, page = 1) {
    const data = await fetchJSON('/discover/movie', {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page,
      'vote_count.gte': 100,
    });
    return data.results.map(normalizeMovie);
  }

  /* ── Fetch movie details (runtime, etc.) ── */
  async function getDetails(id) {
    return fetchJSON(`/movie/${id}`);
  }

  /* ── Fetch streaming providers ── */
  async function getWatchProviders(id) {
    try {
      const data = await fetchJSON(`/movie/${id}/watch/providers`);
      const regionData = data.results?.[REGION] || data.results?.US || {};
      const allProviders = [
        ...(regionData.flatrate || []),
        ...(regionData.rent    || []).map(p => ({ ...p, _type: 'rent' })),
        ...(regionData.buy     || []).map(p => ({ ...p, _type: 'buy' })),
      ];

      // Deduplicate by provider_id
      const seen = new Set();
      return allProviders.filter(p => {
        if (seen.has(p.provider_id)) return false;
        seen.add(p.provider_id);
        return true;
      }).map(p => ({
        id:   p.provider_id,
        name: PROVIDER_META[p.provider_id]?.name || p.provider_name,
        cssClass: PROVIDER_META[p.provider_id]?.class || 'sb-default',
        letter:   PROVIDER_META[p.provider_id]?.letter || p.provider_name.slice(0, 2),
        type: p._type || 'stream',
        logo: `${IMG_BASE}/w92${p.logo_path}`,
      }));
    } catch {
      return [];
    }
  }

  /* ── Get trailer key ── */
  async function getTrailerKey(id) {
    try {
      const data = await fetchJSON(`/movie/${id}/videos`);
      const trailer = data.results?.find(v =>
        v.type === 'Trailer' && v.site === 'YouTube'
      );
      return trailer?.key || null;
    } catch {
      return null;
    }
  }

  /* ── Normalize raw TMDB movie ── */
  function normalizeMovie(raw) {
    return {
      id:          raw.id,
      title:       raw.title,
      overview:    raw.overview,
      poster:      posterUrl(raw.poster_path),
      backdrop:    backdropUrl(raw.backdrop_path),
      year:        raw.release_date?.slice(0, 4) || '—',
      rating:      raw.vote_average?.toFixed(1) || '—',
      genres:      mapGenres(raw.genre_ids || []),
      popularity:  raw.popularity,
      adult:       raw.adult,
      providers:   [],   // filled lazily
      runtime:     '',   // filled lazily
      trailerKey:  null, // filled lazily
    };
  }

  /* ── Enrich movie with providers + runtime ── */
  async function enrichMovie(movie) {
    const [details, providers] = await Promise.all([
      getDetails(movie.id),
      getWatchProviders(movie.id),
    ]);
    return {
      ...movie,
      runtime:   formatRuntime(details.runtime),
      providers,
      tagline:   details.tagline || '',
    };
  }

  /* ── Search movies ── */
  async function search(query, page = 1) {
    const data = await fetchJSON('/search/movie', { query, page, include_adult: false });
    return data.results.map(normalizeMovie);
  }

  /* ── Fetch a curated mixed batch for swiping ── */
  async function getSwipeBatch(preferences = {}) {
    // Mix trending + popular for variety
    const [trending, popular] = await Promise.all([
      getTrending(1),
      getPopular(Math.floor(Math.random() * 3) + 1),
    ]);

    const seen = new Set();
    const combined = [...trending, ...popular].filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return !m.adult && m.poster.includes('image.tmdb.org');
    });

    // Shuffle
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]];
    }

    return combined.slice(0, 20);
  }

  return {
    setApiKey,
    getApiKey,
    getPopular,
    getTrending,
    getByGenre,
    getDetails,
    getWatchProviders,
    getTrailerKey,
    getSwipeBatch,
    enrichMovie,
    search,
    posterUrl,
    PROVIDER_META,
  };
})();

window.TMDB = TMDB;
