/**
 * Movie Night Matcher — Firebase Room Manager
 * Real-time multiplayer rooms via Firebase Realtime DB
 *
 * SETUP: Replace firebaseConfig with your project's config from Firebase Console
 */

const RoomManager = (() => {
  // ⚠️ Replace with YOUR Firebase project config:
  const FIREBASE_CONFIG = {
    apiKey:            localStorage.getItem('mnm_fb_apikey')    || "YOUR_API_KEY",
    authDomain:        localStorage.getItem('mnm_fb_auth')      || "YOUR_PROJECT.firebaseapp.com",
    databaseURL:       localStorage.getItem('mnm_fb_dburl')     || "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId:         localStorage.getItem('mnm_fb_project')   || "YOUR_PROJECT_ID",
    storageBucket:     localStorage.getItem('mnm_fb_bucket')    || "YOUR_PROJECT.appspot.com",
    messagingSenderId: localStorage.getItem('mnm_fb_sender')    || "YOUR_SENDER_ID",
    appId:             localStorage.getItem('mnm_fb_appid')     || "YOUR_APP_ID",
  };

  let db = null;
  let currentRoomId = null;
  let currentUserId = null;
  let currentUserName = null;
  let listeners = [];

  /* ── Firebase Initialization ── */
  function init() {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      db = firebase.database();
      return true;
    } catch (e) {
      console.warn('Firebase not configured:', e.message);
      return false;
    }
  }

  function isConfigured() {
    return FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY' &&
           !!FIREBASE_CONFIG.databaseURL &&
           !FIREBASE_CONFIG.databaseURL.includes('YOUR_PROJECT');
  }

  /* ── User ID ── */
  function getUserId() {
    let uid = localStorage.getItem('mnm_uid');
    if (!uid) {
      uid = 'user_' + Math.random().toString(36).slice(2, 9);
      localStorage.setItem('mnm_uid', uid);
    }
    return uid;
  }

  function getUserName() {
    return localStorage.getItem('mnm_username') || 'Movie Fan';
  }

  function setUserName(name) {
    localStorage.setItem('mnm_username', name);
    currentUserName = name;
  }

  /* ── Room Code Generator ── */
  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  /* ── Create Room ── */
  async function createRoom(hostName, movieBatch) {
    currentUserId   = getUserId();
    currentUserName = hostName;
    setUserName(hostName);

    const code = generateRoomCode();
    currentRoomId = code;

    if (!db || !isConfigured()) {
      // Demo mode: simulate room locally
      return _createLocalRoom(code, hostName, movieBatch);
    }

    const roomData = {
      code,
      hostId:    currentUserId,
      createdAt: Date.now(),
      status:    'waiting', // waiting | swiping | matched
      members: {
        [currentUserId]: {
          name:   hostName,
          emoji:  _randomEmoji(),
          joined: Date.now(),
          online: true,
          votes:  {},
        }
      },
      movies: movieBatch.map(m => m.id),
      movieData: Object.fromEntries(movieBatch.map(m => [m.id, {
        id: m.id, title: m.title, poster: m.poster, year: m.year,
        rating: m.rating, genres: m.genres, overview: m.overview,
      }])),
      currentMovieIdx: 0,
      matchedMovie: null,
    };

    await db.ref(`rooms/${code}`).set(roomData);

    // Set presence
    const presenceRef = db.ref(`rooms/${code}/members/${currentUserId}/online`);
    presenceRef.set(true);
    presenceRef.onDisconnect().set(false);

    return { code, userId: currentUserId };
  }

  /* ── Join Room ── */
  async function joinRoom(code, userName) {
    currentUserId   = getUserId();
    currentUserName = userName;
    currentRoomId   = code.toUpperCase();
    setUserName(userName);

    if (!db || !isConfigured()) {
      return _joinLocalRoom(currentRoomId, userName);
    }

    const snap = await db.ref(`rooms/${currentRoomId}`).get();
    if (!snap.exists()) throw new Error('ROOM_NOT_FOUND');

    const room = snap.val();
    if (room.status === 'matched') throw new Error('ROOM_ENDED');

    // Add member
    await db.ref(`rooms/${currentRoomId}/members/${currentUserId}`).set({
      name:   userName,
      emoji:  _randomEmoji(),
      joined: Date.now(),
      online: true,
      votes:  {},
    });

    // Presence
    const presenceRef = db.ref(`rooms/${currentRoomId}/members/${currentUserId}/online`);
    presenceRef.onDisconnect().set(false);

    return { code: currentRoomId, userId: currentUserId, room };
  }

  /* ── Record Vote ── */
  async function recordVote(movieId, voteType) {
    if (!currentRoomId || !currentUserId) return;

    if (!db || !isConfigured()) {
      _localVote(movieId, voteType);
      return;
    }

    await db.ref(
      `rooms/${currentRoomId}/members/${currentUserId}/votes/${movieId}`
    ).set(voteType);
  }

  /* ── Listen to Room Changes ── */
  function onRoomUpdate(callback) {
    if (!db || !isConfigured()) {
      // Local simulation — no-op, handled by local state
      return;
    }
    const ref = db.ref(`rooms/${currentRoomId}`);
    const handler = ref.on('value', snap => {
      if (snap.exists()) callback(snap.val());
    });
    listeners.push({ ref, handler });
  }

  /* ── Listen to Votes (check for match) ── */
  function onVotesUpdate(movieId, allMemberIds, callback) {
    if (!db || !isConfigured()) return;

    const votePath = `rooms/${currentRoomId}`;
    const ref = db.ref(votePath);

    const handler = ref.on('value', snap => {
      if (!snap.exists()) return;
      const room = snap.val();
      const members = room.members || {};

      const votes = {};
      Object.entries(members).forEach(([uid, member]) => {
        const vote = member.votes?.[movieId];
        if (vote) votes[uid] = vote;
      });

      const memberIds = Object.keys(members);
      const allVoted  = memberIds.every(uid => votes[uid]);
      const allLiked  = memberIds.every(uid =>
        votes[uid] === 'like' || votes[uid] === 'superlike'
      );

      callback({ votes, allVoted, allLiked, memberCount: memberIds.length });
    });

    listeners.push({ ref, handler });
  }

  /* ── Start Swiping ── */
  async function startSwiping() {
    if (!db || !isConfigured()) return;
    await db.ref(`rooms/${currentRoomId}/status`).set('swiping');
  }

  /* ── Set Match ── */
  async function setMatch(movieId) {
    if (!db || !isConfigured()) return;
    await db.ref(`rooms/${currentRoomId}`).update({
      status: 'matched',
      matchedMovie: movieId,
    });
  }

  /* ── Clean up ── */
  function cleanup() {
    listeners.forEach(({ ref, handler }) => ref.off('value', handler));
    listeners = [];
    currentRoomId = null;
  }

  /* ── LOCAL / DEMO MODE (no Firebase) ── */
  const _localRoom = {
    code: null,
    members: {},
    votes: {},
    status: 'waiting',
  };

  function _createLocalRoom(code, hostName, movies) {
    _localRoom.code = code;
    _localRoom.members = {
      [getUserId()]: { name: hostName, emoji: _randomEmoji(), votes: {} }
    };
    _localRoom.votes  = {};
    _localRoom.status = 'waiting';
    _localRoom.movies = movies.map(m => m.id);
    return { code, userId: getUserId(), local: true };
  }

  function _joinLocalRoom(code, userName) {
    if (_localRoom.code !== code) {
      // Simulate: allow joining any code in demo mode
      _localRoom.code = code;
    }
    _localRoom.members[getUserId()] = {
      name: userName, emoji: _randomEmoji(), votes: {}
    };
    return { code, userId: getUserId(), room: _localRoom, local: true };
  }

  function _localVote(movieId, voteType) {
    if (!_localRoom.votes[movieId]) _localRoom.votes[movieId] = {};
    _localRoom.votes[movieId][getUserId()] = voteType;
  }

  function getLocalRoom() { return _localRoom; }
  function isLocalMode()  { return !db || !isConfigured(); }

  /* ── Utilities ── */
  function _randomEmoji() {
    const emojis = ['🎬','🍿','🎭','🦸','🧑‍🚀','🧙','🦹','👾','🤖','🐉','🌟','💎'];
    return emojis[Math.floor(Math.random() * emojis.length)];
  }

  function saveFirebaseConfig(config) {
    Object.entries(config).forEach(([k, v]) => {
      localStorage.setItem(`mnm_fb_${k}`, v);
    });
  }

  return {
    init,
    isConfigured,
    isLocalMode,
    getUserId,
    getUserName,
    setUserName,
    generateRoomCode,
    createRoom,
    joinRoom,
    recordVote,
    onRoomUpdate,
    onVotesUpdate,
    startSwiping,
    setMatch,
    cleanup,
    getLocalRoom,
    saveFirebaseConfig,
  };
})();

window.RoomManager = RoomManager;
