#!/usr/bin/env node
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;

// ─── QUESTIONS (loaded from questions.json) ──────────────────────────────────
const ALL_QUESTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'))
  .filter(q => !q.disabled);
const MINI_GAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'minigames.json'), 'utf8'))
  .filter(g => !g.disabled);

// ─── STATE ─────────────────────────────────────────────────────────────────
let game = {
  phase:      'lobby',
  players:    [],
  hostWs:     null,
  currentQ:   -1,
  answers:    {},
  timerEnd:   null,
  timerTO:    null,
  questions:  [],   // selected subset for this game
  gameLength: 20,   // 20, 40, or 60
  lastReveal: null, // cached for reconnecting players
  currentMiniGame: null,
  miniGameCursor:  0,
  lastMiniGame:    null,
  miniGameResumeTO:null,
};

const COLORS = ['#FFD700','#00D4FF','#FF6B6B','#76FF7A','#FF9F43','#A29BFE','#FD79A8','#00CEC9'];

// ─── HELPERS ───────────────────────────────────────────────────────────────
function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function broadcast(obj, excludeWs = null) {
  const msg = JSON.stringify(obj);
  game.players.forEach(p => {
    if (p.ws && p.ws !== excludeWs && p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  });
  if (game.hostWs && game.hostWs !== excludeWs && game.hostWs.readyState === WebSocket.OPEN)
    game.hostWs.send(msg);
}
function broadcastLobby() {
  broadcast({ type:'lobby', players: game.players.map(p=>({
    id:p.id, name:p.name, color:p.color, avatar:p.avatar, score:p.score, ageGroup:p.ageGroup
  })), takenAvatars: game.players.map(p => p.avatar) });
}
function publicScores() {
  return game.players.map(p => ({
    id:p.id, name:p.name, color:p.color, avatar:p.avatar, score:p.score, ageGroup:p.ageGroup
  }));
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function getCurrentMiniGamePayload() {
  if (!game.currentMiniGame) return null;
  const {
    id, type, title, description, bonus, gridSize, baseEmoji, impostorEmoji,
    cells, startsAt, lockedOutIds, winnerId, resolved, lastWrongPlayerId,
    equations, targetEmoji, word
  } = game.currentMiniGame;
  return {
    type: 'mini-game',
    id,
    gameType: type,
    title,
    description,
    bonus,
    gridSize,
    baseEmoji,
    impostorEmoji,
    cells,
    equations,
    targetEmoji,
    word,
    startsAt,
    lockedOutIds,
    winnerId,
    resolved,
    lastWrongPlayerId,
    scores: publicScores(),
  };
}

function buildMiniGameFromTemplate(template) {
  const common = {
    id: template.id,
    type: template.type,
    title: template.title,
    description: template.description || '',
    bonus: Number(template.bonus) || 300,
    startsAt: Date.now() + 5000,
    lockedOutIds: [],
    winnerId: null,
    resolved: false,
    lastWrongPlayerId: null,
  };

  if (template.type === 'emoji-math') {
    const emojiSet = Array.isArray(template.emojiSet) && template.emojiSet.length >= 3
      ? template.emojiSet.slice(0, 3)
      : ['🦊', '🐻', '🐸'];
    const firstValue = 1 + Math.floor(Math.random() * 6);
    const secondValue = firstValue + 1 + Math.floor(Math.random() * 4);
    const thirdValue = 1 + Math.floor(Math.random() * 6);
    const values = {
      [emojiSet[0]]: firstValue,
      [emojiSet[1]]: secondValue,
      [emojiSet[2]]: thirdValue,
    };
    const equations = [
      `${emojiSet[0]} + ${emojiSet[0]} = ${values[emojiSet[0]] * 2}`,
      `${emojiSet[1]} + ${emojiSet[2]} = ${values[emojiSet[1]] + values[emojiSet[2]]}`,
      `${emojiSet[1]} - ${emojiSet[0]} = ${values[emojiSet[1]] - values[emojiSet[0]]}`,
    ];

    return {
      ...common,
      equations,
      targetEmoji: template.targetEmoji || emojiSet[0],
      targetValue: values[template.targetEmoji || emojiSet[0]],
    };
  }

  if (template.type === 'mirror-word') {
    const words = Array.isArray(template.words) && template.words.length
      ? template.words
      : ['MOM', 'WOW', 'TOT', 'OTTO', 'HI', 'TIT'];
    const word = String(words[Math.floor(Math.random() * words.length)] || 'MOM').toUpperCase();

    return {
      ...common,
      word,
    };
  }

  const gridSize = Number(template.gridSize) || 10;
  const totalCells = gridSize * gridSize;
  const baseEmoji = template.baseEmoji || '🍎';
  const impostorEmoji = template.impostorEmoji || '🍅';
  const impostorIndex = Math.floor(Math.random() * totalCells);
  const cells = Array.from({ length: totalCells }, (_, index) =>
    index === impostorIndex ? impostorEmoji : baseEmoji
  );

  return {
    ...common,
    gridSize,
    baseEmoji,
    impostorEmoji,
    impostorIndex,
    cells,
  };
}

// ─── GAME LOGIC ─────────────────────────────────────────────────────────────
function startQuestion() {
  if (game.currentQ >= game.questions.length - 1) { finishGame(); return; }
  game.currentQ++;
  game.answers = {};
  game.phase   = 'question';

  const q = game.questions[game.currentQ];
  const timeLimit = 30;
  game.timerEnd = Date.now() + timeLimit * 1000;
  clearTimeout(game.timerTO);
  game.timerTO = setTimeout(doReveal, timeLimit * 1000);

  // Send question to host (no hints)
  send(game.hostWs, {
    type: 'question',
    index: game.currentQ,
    total: game.questions.length,
    q:     q.q,
    answers: q.a,
    timeLimit,
    timerEnd: game.timerEnd,
  });

  // Send question to each player with their personalised hint
  game.players.forEach(p => {
    const hint = p.ageGroup === 'teen' ? q.hint_teen
               : p.ageGroup === 'young' ? q.hint_young
               : null;
    send(p.ws, {
      type: 'question',
      index: game.currentQ,
      total: game.questions.length,
      q:     q.q,
      answers: q.a,
      timeLimit,
      timerEnd: game.timerEnd,
      hint,
    });
  });

  // Every 5 questions (but not Q1) trigger a mid-game podium on host
  const qNum = game.currentQ + 1;
  if (qNum > 1 && qNum % 5 === 1) {
    // After previous reveal host will have triggered this — handled via host-next
  }
}

function startMiniGame() {
  if (!MINI_GAMES.length) {
    startQuestion();
    return;
  }

  const template = MINI_GAMES[game.miniGameCursor % MINI_GAMES.length];
  game.miniGameCursor++;

  game.phase = 'minigame';
  game.currentMiniGame = buildMiniGameFromTemplate(template);
  clearTimeout(game.miniGameResumeTO);

  const payload = getCurrentMiniGamePayload();
  game.lastMiniGame = payload;
  broadcast(payload);
}

function submitAnswer(playerId, answerIndex) {
  if (game.phase !== 'question') return;
  if (game.answers[playerId] !== undefined) return;

  const position = Object.keys(game.answers).length; // 0-based submission order
  game.answers[playerId] = { index: answerIndex, position };

  const q = game.questions[game.currentQ];
  const correct = answerIndex === q.c;
  const pts = correct ? Math.max(10, 100 - position * 10) : 0;

  const player = game.players.find(p => p.id === playerId);
  if (player) player.score += pts;

  send(game.hostWs, {
    type: 'answer-in',
    playerId, answerIndex, correct, pts, position,
    answeredCount: Object.keys(game.answers).length,
    totalPlayers:  game.players.length,
    scores: publicScores(),
  });

  const pWs = game.players.find(p => p.id === playerId)?.ws;
  send(pWs, { type: 'answer-ack', answerIndex, correct, pts, position: position + 1 });

  if (Object.keys(game.answers).length >= game.players.length) {
    clearTimeout(game.timerTO);
    setTimeout(doReveal, 800);
  }
}

function doReveal() {
  if (game.phase !== 'question') return;
  game.phase = 'reveal';
  clearTimeout(game.timerTO);

  const q = game.questions[game.currentQ];
  const qNum = game.currentQ + 1;
  // Trigger mid-game podium after every 5th question
  const showPodium = qNum % 5 === 0 && qNum < game.questions.length;

  // First player to answer correctly (by submission order)
  const firstCorrectId = Object.entries(game.answers)
    .filter(([, ans]) => ans.index === q.c)
    .sort((a, b) => a[1].position - b[1].position)[0]?.[0] || null;

  // Flatten to { playerId: answerIndex } for clients
  const answersFlat = Object.fromEntries(
    Object.entries(game.answers).map(([id, ans]) => [id, ans.index])
  );

  const revealData = {
    type:         'reveal',
    correctIndex: q.c,
    correctText:  q.a[q.c],
    fact:         q.fact,
    answers:      answersFlat,
    scores:       publicScores(),
    isLast:       game.currentQ >= game.questions.length - 1,
    showPodium,
    qNum,
    firstCorrectId,
  };
  game.lastReveal = revealData;
  broadcast(revealData);
}

function finishGame() {
  game.phase = 'finished';
  broadcast({ type: 'finished', scores: publicScores() });
}

function resolveMiniGame(winnerId) {
  if (game.phase !== 'minigame' || !game.currentMiniGame || game.currentMiniGame.resolved) return;
  if (winnerId) {
    const player = game.players.find(p => p.id === winnerId);
    if (!player) return;
    player.score += game.currentMiniGame.bonus;
  }
  game.currentMiniGame.winnerId = winnerId || null;
  game.currentMiniGame.resolved = true;

  const payload = {
    type: 'mini-game-result',
    id: game.currentMiniGame.id,
    gameType: game.currentMiniGame.type,
    title: game.currentMiniGame.title,
    description: game.currentMiniGame.description,
    gridSize: game.currentMiniGame.gridSize,
    baseEmoji: game.currentMiniGame.baseEmoji,
    impostorEmoji: game.currentMiniGame.impostorEmoji,
    cells: game.currentMiniGame.cells,
    equations: game.currentMiniGame.equations,
    targetEmoji: game.currentMiniGame.targetEmoji,
    word: game.currentMiniGame.word,
    startsAt: game.currentMiniGame.startsAt,
    lockedOutIds: game.currentMiniGame.lockedOutIds,
    winnerId,
    lastWrongPlayerId: game.currentMiniGame.lastWrongPlayerId,
    bonus: game.currentMiniGame.bonus,
    scores: publicScores(),
  };
  game.lastMiniGame = { ...getCurrentMiniGamePayload(), ...payload };
  broadcast(payload);

  game.miniGameResumeTO = setTimeout(() => {
    if (game.phase !== 'minigame' || !game.currentMiniGame?.resolved) return;
    game.currentMiniGame = null;
    game.lastMiniGame = null;
    startQuestion();
  }, 4000);
}

function submitMiniGameGuess(playerId, index) {
  if (game.phase !== 'minigame' || !game.currentMiniGame || game.currentMiniGame.resolved) return;
  if (Date.now() < game.currentMiniGame.startsAt) return;
  if (game.currentMiniGame.lockedOutIds.includes(playerId)) return;

  if (game.currentMiniGame.type === 'emoji-math') {
    const guess = Number(index);
    if (Number.isFinite(guess) && guess === game.currentMiniGame.targetValue) {
      resolveMiniGame(playerId);
      return;
    }
  } else if (game.currentMiniGame.type === 'mirror-word') {
    const guess = String(index || '').trim().toUpperCase();
    if (guess && guess === game.currentMiniGame.word) {
      resolveMiniGame(playerId);
      return;
    }
  } else {
    if (index === game.currentMiniGame.impostorIndex) {
      resolveMiniGame(playerId);
      return;
    }
  }

  if (!game.currentMiniGame.lockedOutIds.includes(playerId)) {
    game.currentMiniGame.lockedOutIds.push(playerId);
  }
  game.currentMiniGame.lastWrongPlayerId = playerId;

  const activePlayers = game.players
    .filter(p => p.ws)
    .map(p => p.id)
    .filter(id => !game.currentMiniGame.lockedOutIds.includes(id));

  if (!activePlayers.length) {
    skipMiniGame();
    return;
  }

  const payload = {
    ...getCurrentMiniGamePayload(),
    lastWrongPlayerId: playerId,
  };
  game.lastMiniGame = payload;
  broadcast(payload);
}

function skipMiniGame() {
  if (game.phase !== 'minigame' || !game.currentMiniGame || game.currentMiniGame.resolved) return;
  resolveMiniGame(null);
}

// ─── HTTP SERVER ────────────────────────────────────────────────────────────
let localIP = 'localhost';
let QRCode;
try { QRCode = require('qrcode'); } catch(e) { QRCode = null; }

const server = http.createServer((req, res) => {
  const rawUrl = req.url.split('?')[0];
  const qs = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '');

  if (rawUrl === '/qr.png') {
    const data = qs.get('d') || `http://${localIP}:${PORT}/player`;
    if (!QRCode) { res.writeHead(503); res.end('qrcode not installed'); return; }
    QRCode.toBuffer(data, { type:'png', width:260, margin:2 }, (err, buf) => {
      if (err) { res.writeHead(500); res.end('QR error'); return; }
      res.writeHead(200, { 'Content-Type':'image/png', 'Cache-Control':'no-store' });
      res.end(buf);
    });
    return;
  }

  // Serve avatar images
  if (rawUrl.match(/^\/avatars\/[^/]+\.(png|jpg|jpeg|webp)$/i)) {
    const imgPath = path.join(__dirname, 'avatars', path.basename(decodeURIComponent(rawUrl)));
    if (fs.existsSync(imgPath)) {
      const ext = rawUrl.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(imgPath).pipe(res);
    } else {
      res.writeHead(404); res.end('Avatar not found');
    }
    return;
  }

  const files = {
    '/':       path.join(__dirname, 'host.html'),
    '/host':   path.join(__dirname, 'host.html'),
    '/player': path.join(__dirname, 'player.html'),
  };
  const filePath = files[rawUrl];
  if (filePath && fs.existsSync(filePath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(filePath));
  } else if (rawUrl === '/music') {
    const musicPath = path.join(__dirname, 'suspensmusic.mp3');
    if (fs.existsSync(musicPath)) {
      const stat = fs.statSync(musicPath);
      res.writeHead(200, { 'Content-Type':'audio/mpeg', 'Content-Length':stat.size, 'Accept-Ranges':'bytes' });
      fs.createReadStream(musicPath).pipe(res);
    } else { res.writeHead(404); res.end('Music not found'); }
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

// ─── WEBSOCKET ──────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

const ALL_AVATARS = ['Amelia.png','Cleopatra.png','Einstein.png','Joan of Arc.png','MLK.png','Shakespear.png'];

wss.on('connection', (ws) => {
  let myId   = null;
  let isHost = false;
  // Immediately tell the new client which avatars are taken
  send(ws, { type:'avatar-info', takenAvatars: game.players.map(p => p.avatar) });

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {

      case 'host-connect':
        isHost = true; game.hostWs = ws;
        send(ws, { type:'host-ack', players: publicScores(), phase: game.phase });
        break;

      case 'player-join': {
        const colorIdx = game.players.length % COLORS.length;
        myId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
        const takenAvatars = game.players.map(p => p.avatar);
        const requested = msg.avatar || 'Amelia.png';
        const chosenAvatar = !takenAvatars.includes(requested)
          ? requested
          : ALL_AVATARS.find(a => !takenAvatars.includes(a)) || requested;
        const player = {
          id:       myId,
          name:     (msg.name||'Player').slice(0,16),
          color:    COLORS[colorIdx],
          avatar:   chosenAvatar,
          ageGroup: msg.ageGroup || 'adult',   // 'teen' | 'young' | 'adult'
          score:    0,
          ws,
        };
        game.players.push(player);
        send(ws, { type:'join-ack', id:myId, color:player.color, avatar:player.avatar, name:player.name, ageGroup:player.ageGroup });
        broadcastLobby();
        break;
      }

      case 'host-start': {
        if (!isHost) break;
        const len = msg.gameLength || 20;
        game.gameLength = len;
        // Shuffle, pick, then sort by difficulty (easy → hard)
        game.questions = shuffle(ALL_QUESTIONS)
          .slice(0, len)
          .sort((a, b) => (a.difficulty || 3) - (b.difficulty || 3));
        game.currentQ  = -1;
        game.currentMiniGame = null;
        game.lastMiniGame = null;
        game.miniGameCursor = 0;
        game.players.forEach(p => p.score = 0);
        startQuestion();
        break;
      }

      case 'host-next':
        if (!isHost) break;
        if (game.phase === 'reveal') startQuestion();
        if (game.phase === 'minigame' && game.currentMiniGame?.resolved) {
          clearTimeout(game.miniGameResumeTO);
          game.currentMiniGame = null;
          game.lastMiniGame = null;
          startQuestion();
        }
        break;

      case 'host-start-mini-game':
        if (!isHost) break;
        if (game.phase !== 'reveal') break;
        if ((game.currentQ + 1) % 5 !== 0 || game.currentQ >= game.questions.length - 1) break;
        startMiniGame();
        break;

      case 'host-skip-mini-game':
        if (!isHost) break;
        skipMiniGame();
        break;

      case 'host-reveal':
        if (!isHost) break;
        doReveal();
        break;

      case 'player-rejoin': {
        const player = game.players.find(p => p.id === msg.savedId);
        if (player && game.phase !== 'lobby' && game.phase !== 'finished') {
          myId = msg.savedId;
          player.ws = ws;
          const myAnswerEntry = game.answers[myId];
          send(ws, {
            type: 'rejoin-ack',
            id: myId, color: player.color, avatar: player.avatar,
            name: player.name, ageGroup: player.ageGroup, score: player.score,
            phase: game.phase,
            lastAnswer: myAnswerEntry
              ? { answerIndex: myAnswerEntry.index, position: myAnswerEntry.position + 1 }
              : null,
          });
          if (game.phase === 'question') {
            const q = game.questions[game.currentQ];
            const hint = player.ageGroup === 'teen' ? q.hint_teen
                       : player.ageGroup === 'young' ? q.hint_young : null;
            send(ws, {
              type: 'question',
              index: game.currentQ, total: game.questions.length,
              q: q.q, answers: q.a, timeLimit: 30, timerEnd: game.timerEnd, hint,
              myAnswerIndex: myAnswerEntry ? myAnswerEntry.index : null,
            });
          } else if (game.phase === 'reveal' && game.lastReveal) {
            send(ws, game.lastReveal);
          } else if (game.phase === 'minigame' && game.currentMiniGame) {
            send(ws, getCurrentMiniGamePayload());
            if (game.currentMiniGame.resolved && game.lastMiniGame?.type === 'mini-game-result') {
              send(ws, game.lastMiniGame);
            }
          }
        } else {
          send(ws, { type: 'rejoin-fail' });
        }
        break;
      }

      case 'player-answer':
        if (myId) submitAnswer(myId, msg.answerIndex);
        break;

      case 'player-mini-game-guess':
        if (myId) submitMiniGameGuess(myId, msg.index);
        break;

      case 'host-reset':
        if (!isHost) break;
        clearTimeout(game.timerTO);
        clearTimeout(game.miniGameResumeTO);
        game.phase = 'lobby'; game.currentQ = -1; game.answers = {};
        game.questions = []; game.lastReveal = null; game.currentMiniGame = null;
        game.lastMiniGame = null; game.miniGameCursor = 0;
        // Remove disconnected players; reset scores for connected ones
        game.players = game.players.filter(p => p.ws && p.ws.readyState === WebSocket.OPEN);
        game.players.forEach(p => p.score = 0);
        broadcastLobby();
        send(ws, { type:'reset-ack' });
        break;
    }
  });

  ws.on('close', () => {
    if (isHost) { game.hostWs = null; return; }
    if (myId) {
      if (game.phase === 'lobby' || game.phase === 'finished') {
        game.players = game.players.filter(p => p.id !== myId);
        broadcastLobby();
      } else {
        // Mid-game: keep player's score, just mark them offline
        const player = game.players.find(p => p.id === myId);
        if (player) player.ws = null;
      }
    }
  });
});

// ─── START ──────────────────────────────────────────────────────────────────
(function detectIP() {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) { localIP = process.env.RAILWAY_PUBLIC_DOMAIN; return; }
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family === 'IPv4' && !net.internal) { localIP = net.address; return; }
})();

server.listen(PORT, '0.0.0.0', () => {
  const isOnline = !!process.env.RAILWAY_PUBLIC_DOMAIN;
  const baseUrl  = isOnline ? `https://${localIP}` : `http://${localIP}:${PORT}`;
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║       100% LOGIQUE — Game Server  X      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Host  →  ${baseUrl}             ║`);
  console.log(`║  Play  →  ${baseUrl}/player      ║`);
  console.log('╚══════════════════════════════════════════╝\n');
});
