#!/usr/bin/env node
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;

// ─── QUESTIONS with FUN FACTS ─────────────────────────────────────────────
const QUESTIONS = [
  { pct:100, q:"What color is the sky on a clear day?",
    a:["Red","Blue","Green","Yellow"], c:1,
    fact:"The sky looks blue because air molecules scatter short blue light waves much more than red ones — a phenomenon called Rayleigh scattering, named after Lord Rayleigh who explained it in 1871." },

  { pct: 95, q:"How many legs does a spider have?",
    a:["4","6","8","10"], c:2,
    fact:"Spiders have 8 legs, but they also have 2 extra appendages called pedipalps near their mouth — so they might look like 10 limbs! Insects only have 6 legs, which is how you tell them apart from spiders." },

  { pct: 92, q:"What is 10 × 10?",
    a:["10","100","1000","110"], c:1,
    fact:"The word 'percent' literally means 'per hundred' from Latin — which is why 100% means everything! The number 100 is called a perfect square because it equals 10²." },

  { pct: 90, q:"What is the capital of France?",
    a:["Berlin","Rome","Paris","Madrid"], c:2,
    fact:"Paris has been the capital of France for over 1,000 years. Its nickname 'The City of Light' came partly because it was one of the first European cities to use gas street lighting, back in the 1820s." },

  { pct: 88, q:"How many sides does a triangle have?",
    a:["2","3","4","5"], c:1,
    fact:"The triangle is the strongest shape in engineering — that's why bridges and roof trusses use triangular frames. The word 'triangle' comes from Latin meaning 'three angles.'" },

  { pct: 85, q:"Which planet is closest to the Sun?",
    a:["Venus","Earth","Mars","Mercury"], c:3,
    fact:"Despite being closest to the Sun, Mercury is NOT the hottest planet — Venus is! Venus's thick atmosphere traps heat like a greenhouse, reaching 465°C, while Mercury has no atmosphere and swings wildly between -180°C and 430°C." },

  { pct: 83, q:"What is the largest ocean on Earth?",
    a:["Atlantic","Indian","Arctic","Pacific"], c:3,
    fact:"The Pacific Ocean is so enormous it covers more area than all of Earth's land combined! Explorer Ferdinand Magellan named it 'Pacific' (meaning peaceful in Latin) after experiencing unusually calm waters in 1520." },

  { pct: 80, q:"How many colors are in a rainbow?",
    a:["5","6","7","8"], c:2,
    fact:"Technically a rainbow is a continuous spectrum of millions of colors, but Isaac Newton listed 7 (Red, Orange, Yellow, Green, Blue, Indigo, Violet) to match the 7 notes in a musical scale — a choice that stuck forever!" },

  { pct: 78, q:"What gas do plants absorb during photosynthesis?",
    a:["Oxygen","Nitrogen","CO₂","Helium"], c:2,
    fact:"Plants absorb CO₂ and release oxygen — the exact opposite of what we do! A single large tree absorbs up to 48 lbs of CO₂ per year and releases enough oxygen to support 2 people breathing for an entire year." },

  { pct: 75, q:"How many days are in a non-leap year?",
    a:["360","364","365","366"], c:2,
    fact:"A year is actually 365.2422 days long. We add a leap day every 4 years to compensate — but even that's slightly too much, so century years (like 1900) skip the leap day unless also divisible by 400 (like 2000)." },

  { pct: 73, q:"What is the chemical symbol for water?",
    a:["CO₂","H₂O","NaCl","O₂"], c:1,
    fact:"Water is the only natural substance that exists as a solid, liquid, and gas at normal Earth temperatures. Uniquely, it EXPANDS when it freezes — which is why ice floats. If ice sank, lakes would freeze solid and most aquatic life would die." },

  { pct: 70, q:"Which animal is the largest on Earth?",
    a:["African elephant","Whale shark","Blue whale","Giraffe"], c:2,
    fact:"A blue whale can reach 100 feet long and weigh 200 tons — heavier than any dinosaur ever found! Its heart is the size of a small car, and a human could crawl through its largest arteries." },

  { pct: 68, q:"How many hours are in a week?",
    a:["124","148","168","192"], c:2,
    fact:"7 × 24 = 168 hours. The 7-day week has been used for at least 4,000 years, likely originating in ancient Mesopotamia. The days were originally named after the 7 celestial bodies visible to the naked eye: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn." },

  { pct: 65, q:"Who painted the Mona Lisa?",
    a:["Michelangelo","Raphael","Botticelli","Leonardo da Vinci"], c:3,
    fact:"Leonardo worked on the Mona Lisa for over 4 years and painted it on a poplar wood panel, not canvas. The subject has no visible eyebrows — either Leonardo left them out intentionally, or they faded over 500+ years." },

  { pct: 63, q:"What is the longest bone in the human body?",
    a:["Humerus","Radius","Tibia","Femur"], c:3,
    fact:"The femur (thigh bone) is about 1/4 of your total height and can withstand forces of up to 1,700 pounds per square inch. By contrast, the smallest bone is the stirrup (stapes) in your inner ear — just 3mm long!" },

  { pct: 60, q:"In what year did World War II end?",
    a:["1943","1944","1945","1946"], c:2,
    fact:"WWII ended in 1945: Germany surrendered May 8 (V-E Day) and Japan on September 2 (V-J Day). It was the deadliest conflict in history with an estimated 70–85 million deaths — roughly 3% of the entire world population at the time." },

  { pct: 58, q:"What is the square root of 144?",
    a:["10","11","12","14"], c:2,
    fact:"The number 144 is also known as a 'gross' — a dozen dozens, used by merchants for centuries. There are also 144 total squares on a chessboard if you count squares of ALL sizes, not just the 64 individual ones!" },

  { pct: 55, q:"What currency does Japan use?",
    a:["Yuan","Won","Yen","Baht"], c:2,
    fact:"Japan's 1-yen coin weighs exactly 1 gram and is so light it can float on still water due to surface tension. The Yen was introduced in 1871 to modernize Japan's monetary system. 'Yen' means 'round object' in Japanese." },

  { pct: 53, q:"What is the smallest country in the world?",
    a:["Monaco","Liechtenstein","San Marino","Vatican City"], c:3,
    fact:"Vatican City covers just 0.44 km² — smaller than most city parks — yet has its own postal system, newspaper, radio station, and army (the Swiss Guard, founded in 1506). With ~800 residents, it has the smallest population of any country." },

  { pct: 50, q:"How many sides does a hexagon have?",
    a:["5","6","7","8"], c:1,
    fact:"Hexagons are nature's favorite shape! Honeycombs, snowflakes, and basalt columns all form hexagons naturally because they pack perfectly without gaps and use the least material to enclose the most space — it's mathematical optimization by nature." },

  { pct: 48, q:"What is the capital of Australia?",
    a:["Sydney","Melbourne","Canberra","Brisbane"], c:2,
    fact:"Canberra was purpose-built as a compromise between rivals Sydney and Melbourne. American architects Walter Burley Griffin and Marion Mahony Griffin won an international design competition in 1913. The city's name likely means 'meeting place' in the local Aboriginal language." },

  { pct: 45, q:"Which element has the chemical symbol 'Au'?",
    a:["Silver","Aluminum","Gold","Copper"], c:2,
    fact:"'Au' comes from 'aurum,' Latin for gold. All the gold ever mined in human history would fit into about 3.5 Olympic swimming pools. Gold is so rare that more steel is poured every single hour than all the gold ever mined throughout history." },

  { pct: 43, q:"How many chromosomes do humans have?",
    a:["23","44","46","48"], c:2,
    fact:"Humans have 46 chromosomes in 23 pairs. Interestingly, a potato has 48 chromosomes — 2 more than us! The number of chromosomes has nothing to do with complexity; it's just how DNA happens to be packaged in that species." },

  { pct: 40, q:"A train travels 60 mph for 2.5 hours. How far does it go?",
    a:["100 mi","120 mi","140 mi","150 mi"], c:3,
    fact:"60 mph × 2.5 hrs = 150 miles. The world's fastest passenger train, China's Shanghai Maglev, reaches 267 mph — it would cover 150 miles in just 34 minutes. It levitates above the track using magnets, so there's zero friction!" },

  { pct: 38, q:"What is the speed of light (km/s, rounded)?",
    a:["100,000","200,000","300,000","400,000"], c:2,
    fact:"Light travels at exactly 299,792,458 m/s — it circles Earth about 7.5 times per second! Sunlight takes ~8 minutes to reach us, meaning we always see the Sun as it was 8 minutes ago. If the Sun vanished, we wouldn't notice for 8 minutes." },

  { pct: 35, q:"Who composed the Ninth Symphony?",
    a:["Mozart","Bach","Beethoven","Brahms"], c:2,
    fact:"Beethoven composed the Ninth Symphony while completely deaf, relying entirely on his inner musical imagination. At the 1824 premiere, he had to be turned around to see the standing ovation — he couldn't hear any of the thunderous applause." },

  { pct: 33, q:"What is 17 × 19?",
    a:["303","313","323","333"], c:2,
    fact:"Quick trick: 17 × 19 = (18-1)(18+1) = 18² - 1² = 324 - 1 = 323. This uses the 'difference of squares' formula: (a-b)(a+b) = a²-b². Spotting the 'middle number' makes mental multiplication much faster!" },

  { pct: 30, q:"Which is the longest river in the world?",
    a:["Amazon","Mississippi","Nile","Yangtze"], c:2,
    fact:"The Nile vs. Amazon debate is still ongoing — some measurements put the Amazon longer! But the Amazon wins on water volume: it discharges about 20% of all fresh river water on Earth into the ocean, far more than the Nile." },

  { pct: 28, q:"What is the atomic number of hydrogen?",
    a:["1","2","3","4"], c:0,
    fact:"Hydrogen is the simplest and most abundant element in the universe — about 75% of all normal matter by mass. Every star is essentially a massive hydrogen fusion reactor. Hydrogen was the very first element to form after the Big Bang, 13.8 billion years ago." },

  { pct: 26, q:"How many bones are in the adult human body?",
    a:["186","196","206","216"], c:2,
    fact:"Babies are born with ~270 bones, but many fuse during childhood. Adults end up with 206. More than half of all your bones are in your hands and feet — 54 in the hands and 52 in the feet!" },

  { pct: 24, q:"What is the largest desert in the world?",
    a:["Sahara","Gobi","Arabian","Antarctic"], c:3,
    fact:"Most people say Sahara, but Antarctica is the largest desert at 14.2 million km²! A desert is defined by low precipitation, not temperature. Antarctica receives less than 200mm of precipitation per year, making it the driest continent on Earth." },

  { pct: 22, q:"A snail goes 10 ft forward and 3 ft back each day. Days to cross 50 ft?",
    a:["10","7","12","13"], c:1,
    fact:"The key insight: on day 6 the snail is at 42 ft (6×7). On day 7 it moves forward 10 ft, reaching 52 ft and crossing the 50 ft mark BEFORE sliding back. So the answer is 7 days! These 'trick' problems test whether you check your instinct." },

  { pct: 20, q:"What is the chemical symbol for iron?",
    a:["Ir","In","Fe","Fr"], c:2,
    fact:"'Fe' comes from 'ferrum,' the Latin word for iron. Iron is the most abundant element on Earth by mass, making up about 32% of our planet — most of it locked in Earth's molten core. That core's movement is what creates Earth's magnetic field protecting us from solar radiation." },

  { pct: 18, q:"Which country has the most freshwater lakes?",
    a:["Russia","Brazil","Canada","Finland"], c:2,
    fact:"Canada has approximately 879,800 lakes — about 60% of the world's total! Finland is nicknamed 'the land of a thousand lakes' but actually has over 187,000. Canada's lakes collectively hold about 20% of all the world's surface fresh water." },

  { pct: 16, q:"What is the 8th planet from the Sun?",
    a:["Saturn","Uranus","Neptune","Jupiter"], c:2,
    fact:"Neptune was the first planet discovered through pure mathematics before it was ever seen. Astronomers noticed Uranus wasn't moving as predicted, calculated where a hidden planet must be pulling on it, then found Neptune within 1° of that exact spot in 1846." },

  { pct: 14, q:"How many prime numbers are between 1 and 20?",
    a:["6","7","8","9"], c:2,
    fact:"The 8 primes are: 2, 3, 5, 7, 11, 13, 17, 19. Primes are the 'atoms' of mathematics — every whole number is built by multiplying primes together. The largest known prime (as of 2024) has over 41 million digits!" },

  { pct: 12, q:"Which philosopher said 'I think, therefore I am'?",
    a:["Voltaire","Rousseau","Descartes","Pascal"], c:2,
    fact:"Descartes wrote 'Cogito, ergo sum' in 1637 while trying to find one thing he couldn't doubt. He also invented the coordinate system — x and y axes! That's why they're called 'Cartesian coordinates' to this day." },

  { pct: 10, q:"What is the atomic number of gold?",
    a:["74","79","82","47"], c:1,
    fact:"All gold on Earth was formed in ancient neutron star collisions billions of years ago and arrived via asteroid impacts. Gold is so chemically stable it never tarnishes — gold artifacts from ancient Egypt still shine perfectly today, over 3,000 years later." },

  { pct:  9, q:"What is the capital of Bhutan?",
    a:["Thimphu","Kathmandu","Dhaka","Rangoon"], c:0,
    fact:"Thimphu is one of the only capital cities in the world with no traffic lights — police officers direct traffic instead, as lights were considered undignified. Bhutan also measures national success by 'Gross National Happiness' rather than just GDP." },

  { pct:  8, q:"A bat and ball cost $1.10 total. The bat costs $1 more. How much is the ball?",
    a:["$0.10","$0.05","$0.15","$0.20"], c:1,
    fact:"Most people instinctively say $0.10 — that's wrong! If ball = $0.10, bat = $1.10, total = $1.20 ≠ $1.10. Correct algebra: ball = x, bat = x+1, so 2x+1 = 1.10, giving x = $0.05. This is a famous 'Cognitive Reflection Test' question that catches even smart people!" },

  { pct:  7, q:"What is the chemical formula for sulfuric acid?",
    a:["HCl","H₂SO₄","HNO₃","H₃PO₄"], c:1,
    fact:"Sulfuric acid is the world's most-produced industrial chemical — about 200 million tons per year. It's used in fertilizers, car batteries, paper manufacturing, and metal processing. So widespread that its global production is often used as an indicator of a country's industrial health." },

  { pct:  6, q:"5 machines make 5 widgets in 5 min. How long for 100 machines to make 100 widgets?",
    a:["100 min","10 min","5 min","1 min"], c:2,
    fact:"Each machine makes 1 widget in 5 minutes regardless of how many machines there are. 100 machines working simultaneously each produce 1 widget in 5 minutes = 100 widgets total in 5 minutes. Adding machines adds output — not speed!" },

  { pct:  5, q:"How many light-years away is Proxima Centauri, the nearest star to our Sun?",
    a:["4.2","8.6","2.1","12.4"], c:0,
    fact:"At 4.2 light-years away, if you drove at 60 mph it would take 48 million years to reach Proxima Centauri. Even the fastest spacecraft ever built (NASA's Parker Solar Probe at 430,000 mph) would take over 6,500 years to get there." },

  { pct:  4, q:"What is 2 to the power of 10?",
    a:["512","1024","2048","256"], c:1,
    fact:"2¹⁰ = 1,024. This is why a 'kilobyte' is 1,024 bytes, not 1,000. Each doubling explains why digital storage grows so dramatically: 2²⁰ = 1 million, 2³⁰ = 1 billion, 2⁴⁰ = 1 trillion. Exponential growth is shockingly fast!" },

  { pct:  3, q:"Which mathematician proved Fermat's Last Theorem in 1995?",
    a:["Gauss","Euler","Andrew Wiles","Riemann"], c:2,
    fact:"Fermat's Last Theorem sat unsolved for 358 years. Andrew Wiles secretly worked on it alone for 7 years, announced a proof in 1993 — found an error, fixed it in secret for another year, and finally published in 1995. He called the discovery 'the most important moment of my working life.'" },

  { pct:  2, q:"What is the unit of electrical inductance?",
    a:["Farad","Ohm","Henry","Tesla"], c:2,
    fact:"The Henry (H) is named after Joseph Henry, who discovered electromagnetic induction independently of Faraday. Inductance powers transformers, electric motors, and radio tuners. Your phone's wireless charger uses inductive coupling to transfer electricity without any physical contact!" },

  { pct:  1, q:"What is the only even prime number?",
    a:["0","2","4","6"], c:1,
    fact:"2 is the only even prime because every other even number is divisible by 2 (giving more than 2 factors). This makes 2 uniquely special — it's even, yet prime. Mathematicians jokingly call it 'the oddest prime' even though it's even!" },

  // Extra three to reach 50
  { pct: 77, q:"What is the capital of Spain?",
    a:["Barcelona","Seville","Valencia","Madrid"], c:3,
    fact:"Madrid sits at 667 meters above sea level, making it one of the highest capital cities in Europe. Its famous Prado Museum houses over 20,000 artworks. Barcelona, though not the capital, is home to 9 UNESCO World Heritage Sites — more per city than almost anywhere on Earth." },

  { pct: 62, q:"What year did Christopher Columbus reach the Americas?",
    a:["1482","1492","1502","1512"], c:1,
    fact:"Columbus landed in the Bahamas on October 12, 1492 — but he died in 1506 still believing he'd reached Asia! The Americas were named after Amerigo Vespucci, who correctly argued it was a previously unknown continent. Columbus never got a continent named after him." },

  { pct: 47, q:"How many strings does a standard guitar have?",
    a:["4","5","6","7"], c:2,
    fact:"A standard guitar's 6 strings are tuned E-A-D-G-B-E from low to high. Bass guitars have 4 strings; 7-string guitars are popular in metal. The guitar evolved from ancient lutes and reached its modern form in the 1850s. There are now over 50 million guitar players worldwide." },
];

// ─── STATE ─────────────────────────────────────────────────────────────────
let game = {
  phase:    'lobby',
  players:  [],
  hostWs:   null,
  currentQ: -1,
  answers:  {},
  timerEnd: null,
  timerTO:  null,
};

const COLORS = ['#FFD700','#00D4FF','#FF6B6B','#76FF7A'];
const ICONS  = ['👑','🌟','🔥','💎'];

// ─── HELPERS ───────────────────────────────────────────────────────────────
function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function broadcast(obj, excludeWs = null) {
  const msg = JSON.stringify(obj);
  game.players.forEach(p => {
    if (p.ws !== excludeWs && p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  });
  if (game.hostWs && game.hostWs !== excludeWs && game.hostWs.readyState === WebSocket.OPEN)
    game.hostWs.send(msg);
}
function broadcastLobby() {
  broadcast({ type:'lobby', players: game.players.map(p=>({ id:p.id, name:p.name, color:p.color, icon:p.icon, score:p.score })) });
}
function publicScores() {
  return game.players.map(p => ({ id:p.id, name:p.name, color:p.color, icon:p.icon, score:p.score }));
}

// ─── GAME LOGIC ─────────────────────────────────────────────────────────────
function startQuestion() {
  if (game.currentQ >= QUESTIONS.length - 1) { finishGame(); return; }
  game.currentQ++;
  game.answers = {};
  game.phase   = 'question';

  const q = QUESTIONS[game.currentQ];
  const timeLimit = 30;
  game.timerEnd = Date.now() + timeLimit * 1000;
  clearTimeout(game.timerTO);
  game.timerTO = setTimeout(doReveal, timeLimit * 1000);

  broadcast({
    type: 'question',
    index: game.currentQ,
    total: QUESTIONS.length,
    pct:   q.pct,
    q:     q.q,
    answers: q.a,
    timeLimit,
    timerEnd: game.timerEnd,
  });
}

function submitAnswer(playerId, answerIndex) {
  if (game.phase !== 'question') return;
  if (game.answers[playerId] !== undefined) return;

  game.answers[playerId] = answerIndex;
  const q = QUESTIONS[game.currentQ];
  const correct = answerIndex === q.c;
  const pts = correct ? Math.round((101 - q.pct) * 10) : 0;

  const player = game.players.find(p => p.id === playerId);
  if (player) player.score += pts;

  send(game.hostWs, {
    type: 'answer-in',
    playerId, answerIndex, correct, pts,
    answeredCount: Object.keys(game.answers).length,
    totalPlayers:  game.players.length,
    scores: publicScores(),
  });

  const pWs = game.players.find(p => p.id === playerId)?.ws;
  send(pWs, { type: 'answer-ack', answerIndex, correct, pts });

  if (Object.keys(game.answers).length >= game.players.length) {
    clearTimeout(game.timerTO);
    setTimeout(doReveal, 800);
  }
}

function doReveal() {
  if (game.phase !== 'question') return;
  game.phase = 'reveal';
  clearTimeout(game.timerTO);

  const q = QUESTIONS[game.currentQ];
  broadcast({
    type:         'reveal',
    correctIndex: q.c,
    correctText:  q.a[q.c],
    fact:         q.fact,
    answers:      game.answers,
    scores:       publicScores(),
    isLast:       game.currentQ >= QUESTIONS.length - 1,
  });
}

function finishGame() {
  game.phase = 'finished';
  broadcast({ type: 'finished', scores: publicScores() });
}

// ─── HTTP SERVER ────────────────────────────────────────────────────────────
let localIP = 'localhost';
let QRCode;
try { QRCode = require('qrcode'); } catch(e) { QRCode = null; }

const server = http.createServer((req, res) => {
  const rawUrl = req.url.split('?')[0];
  const qs     = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '');

  // QR code endpoint — generates PNG server-side, no internet needed
  if (rawUrl === '/qr.png') {
    const data = qs.get('d') || `http://${localIP}:${PORT}/player`;
    if (!QRCode) {
      res.writeHead(503); res.end('qrcode not installed');
      return;
    }
    QRCode.toBuffer(data, { type:'png', width:220, margin:2 }, (err, buf) => {
      if (err) { res.writeHead(500); res.end('QR error'); return; }
      res.writeHead(200, { 'Content-Type':'image/png', 'Cache-Control':'no-store' });
      res.end(buf);
    });
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
    // Serve the suspense music file
    const musicPath = path.join(__dirname, 'suspensmusic.mp3');
    if (fs.existsSync(musicPath)) {
      const stat = fs.statSync(musicPath);
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(musicPath).pipe(res);
    } else {
      res.writeHead(404); res.end('Music file not found');
    }
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

// ─── WEBSOCKET ──────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let myId   = null;
  let isHost = false;

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case 'host-connect':
        isHost = true; game.hostWs = ws;
        send(ws, { type:'host-ack', players: game.players.map(p=>({ id:p.id, name:p.name, color:p.color, icon:p.icon, score:p.score })), phase: game.phase });
        break;

      case 'player-join': {
        const colorIdx = game.players.length % COLORS.length;
        myId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
        const player = { id:myId, name:(msg.name||'Player').slice(0,16), color:COLORS[colorIdx], icon:ICONS[colorIdx], score:0, ws };
        game.players.push(player);
        send(ws, { type:'join-ack', id:myId, color:player.color, icon:player.icon, name:player.name });
        broadcastLobby();
        break;
      }

      case 'host-start':
        if (!isHost) break;
        game.currentQ = -1;
        game.players.forEach(p => p.score = 0);
        startQuestion();
        break;

      case 'host-next':
        if (!isHost || game.phase !== 'reveal') break;
        startQuestion();
        break;

      case 'host-reveal':
        if (!isHost) break;
        doReveal();
        break;

      case 'player-answer':
        if (myId) submitAnswer(myId, msg.answerIndex);
        break;

      case 'host-reset':
        if (!isHost) break;
        clearTimeout(game.timerTO);
        game.phase = 'lobby'; game.currentQ = -1; game.answers = {};
        game.players.forEach(p => p.score = 0);
        broadcastLobby();
        send(ws, { type:'reset-ack' });
        break;
    }
  });

  ws.on('close', () => {
    if (isHost) { game.hostWs = null; return; }
    if (myId) { game.players = game.players.filter(p => p.id !== myId); broadcastLobby(); }
  });
});

// ─── START ──────────────────────────────────────────────────────────────────
// Detect local IP (for local play) or use Railway public URL (for online play)
(function detectIP() {
  // If running on Railway or similar, the public URL is in the env
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    localIP = process.env.RAILWAY_PUBLIC_DOMAIN;
    return;
  }
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { localIP = net.address; return; }
    }
  }
})();

server.listen(PORT, '0.0.0.0', () => {
  const isOnline = !!process.env.RAILWAY_PUBLIC_DOMAIN;
  const baseUrl = isOnline
    ? `https://${localIP}`
    : `http://${localIP}:${PORT}`;
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║       100% LOGIQUE — Game Server         ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Host (iPad)  →  ${baseUrl}          ║`);
  console.log(`║  Players      →  ${baseUrl}/player   ║`);
  console.log('╚══════════════════════════════════════════╝\n');
});
