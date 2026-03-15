(() => {
'use strict';

let video, canvas, ctx;
let drawDebugLandmarks = false;
let handLandmarker = null;
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let fpsValue = 0;

const DETECTION_INTERVAL_MS = 100;
let lastLabels = [];
let lastDetectionTime = 0;
let detectionPending = false;

let bladeTargets = [];
let bladeCurrent = [];
const LERP_SPEED = 0.35;

let gameState = 'PLAYING';
let bladeTrails = [];
const TRAIL_LENGTH = 14;

const NINJA_LIVES_DEFAULT = 7;
const FRUIT_EMOJIS = ['🍉', '🍎', '🍋', '🍊', '🍇', '🍓', '🍑', '🥝', '🍌', '🫐'];
const FRUIT_JUICE_COLORS = ['#ff3366', '#ffb703', '#8338ec', '#00dfd8', '#39ff14', '#ff6ec7'];
const COMBO_DECAY_MS = 1200;
const BLADE_HIT_EXTRA = 32;
const CUT_ANIMATION_MS = 600;
const EXPLODE_ANIMATION_MS = 500;
const MAX_PARTICLES = 120;

const COMBO_MESSAGES = [
    { min: 2, text: 'NICE!', color: '#00dfd8', size: 36 },
    { min: 4, text: 'GREAT!', color: '#39ff14', size: 42 },
    { min: 6, text: 'AWESOME!', color: '#ffb703', size: 50 },
    { min: 8, text: 'INSANE!!', color: '#ff6ec7', size: 58 },
    { min: 10, text: 'UNSTOPPABLE!!!', color: '#ff3366', size: 64 },
    { min: 15, text: 'GODLIKE!!!!', color: '#fff', size: 72 },
];

const LEVELS = [
    { name: 'Apprentice',   minScore: 0,   spawnMs: 2200, bombChance: 0.10, maxWave: 1, speed: 11, gravity: 0.26 },
    { name: 'Slicer',       minScore: 50,  spawnMs: 2000, bombChance: 0.12, maxWave: 1, speed: 12, gravity: 0.27 },
    { name: 'Warrior',      minScore: 120, spawnMs: 1800, bombChance: 0.15, maxWave: 2, speed: 13, gravity: 0.28 },
    { name: 'Master',       minScore: 250, spawnMs: 1500, bombChance: 0.18, maxWave: 2, speed: 14, gravity: 0.29 },
    { name: 'Grandmaster',  minScore: 400, spawnMs: 1300, bombChance: 0.20, maxWave: 3, speed: 15, gravity: 0.30 },
    { name: 'Legend',       minScore: 600, spawnMs: 1100, bombChance: 0.22, maxWave: 3, speed: 16, gravity: 0.31 },
    { name: 'Mythic',       minScore: 900, spawnMs: 950,  bombChance: 0.25, maxWave: 4, speed: 17, gravity: 0.32 },
];

const DIFFICULTY = {
    easy:   { spawnMult: 1.4,  speedMult: 0.85, bombMult: 0.6 },
    normal: { spawnMult: 1,    speedMult: 1,    bombMult: 1 },
    hard:   { spawnMult: 0.65, speedMult: 1.2,  bombMult: 1.4 },
};

let gameDifficulty = 'normal';
let initialLives = NINJA_LIVES_DEFAULT;
let volumeGain = 0.8;
let musicEnabled = true;
let sfxEnabled = true;

let score = 0, lives = NINJA_LIVES_DEFAULT;
let fruits = [], bombs = [];
let combo = 0, bestCombo = 0, comboTimeout = null;
let spawnRate = 0, lastSpawn = 0;
let ninjaParticles = [], floatingTexts = [];
let screenFlash = 0;
let totalCuts = 0, totalMissed = 0;
let shakeX = 0, shakeY = 0;
let comboMsgTimer = 0, comboMsgText = '', comboMsgColor = '#fff', comboMsgSize = 48;
let currentLevel = 0;
let levelUpTimer = 0, levelUpName = '';

function getLevel() {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (score >= LEVELS[i].minScore) return i;
    }
    return 0;
}

function getEffectiveLevelConfig() {
    const cfg = LEVELS[getLevel()];
    const d = DIFFICULTY[gameDifficulty] || DIFFICULTY.normal;
    return {
        spawnMs: Math.round(cfg.spawnMs * d.spawnMult),
        speed: cfg.speed * d.speedMult,
        bombChance: Math.min(0.5, cfg.bombChance * d.bombMult),
        gravity: cfg.gravity * d.speedMult,
        maxWave: cfg.maxWave,
    };
}

// ─── Web Audio API ───
let audioCtx = null;
let musicGain = null;
let sfxGain = null;
let musicPlaying = false;

function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = audioCtx.createGain();
    musicGain.connect(audioCtx.destination);
    sfxGain = audioCtx.createGain();
    sfxGain.connect(audioCtx.destination);
    updateAudioGains();
}

function updateAudioGains() {
    if (!musicGain || !sfxGain) return;
    musicGain.gain.value = musicEnabled ? volumeGain * 0.12 : 0;
    sfxGain.gain.value = sfxEnabled ? volumeGain : 0;
}

function connectOsc(osc, gain) {
    osc.connect(gain);
    gain.connect(sfxGain || audioCtx.destination);
}

function sfxSlice() {
    ensureAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    connectOsc(osc, g);
    osc.start(t); osc.stop(t + 0.15);
}

function sfxCombo(level) {
    ensureAudio();
    const t = audioCtx.currentTime;
    const baseFreq = 400 + level * 80;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2, t + 0.15);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    connectOsc(osc, g);
    osc.start(t); osc.stop(t + 0.25);
}

function sfxBomb() {
    ensureAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.35);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    connectOsc(osc, g);
    osc.start(t); osc.stop(t + 0.4);

    const noise = audioCtx.createBufferSource();
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0, len = ch.length; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noise.buffer = buf;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.12, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    noise.connect(ng); ng.connect(sfxGain || audioCtx.destination);
    noise.start(t); noise.stop(t + 0.3);
}

function sfxMiss() {
    ensureAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    connectOsc(osc, g);
    osc.start(t); osc.stop(t + 0.25);
}

function sfxGameOver() {
    ensureAudio();
    const t = audioCtx.currentTime;
    const freqs = [400, 350, 280, 200];
    for (let i = 0; i < freqs.length; i++) {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freqs[i];
        g.gain.setValueAtTime(0.12, t + i * 0.2);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.3);
        connectOsc(osc, g);
        osc.start(t + i * 0.2); osc.stop(t + i * 0.2 + 0.35);
    }
}

const MUSIC_NOTES = [261.6, 329.6, 392, 440, 392, 329.6];

function startMusic() {
    if (musicPlaying) return;
    ensureAudio();
    musicPlaying = true;
    let noteIdx = 0;
    function playNote() {
        if (!musicPlaying) return;
        const t = audioCtx.currentTime;
        const freq = MUSIC_NOTES[noteIdx % MUSIC_NOTES.length];

        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc.connect(g); g.connect(musicGain);
        osc.start(t); osc.stop(t + 0.85);

        const pad = audioCtx.createOscillator();
        pad.type = 'triangle';
        pad.frequency.value = freq / 2;
        const pg = audioCtx.createGain();
        pg.gain.setValueAtTime(0.03, t);
        pg.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        pad.connect(pg); pg.connect(musicGain);
        pad.start(t); pad.stop(t + 0.85);

        noteIdx++;
        if (musicPlaying) setTimeout(playNote, 900);
    }
    playNote();
}

function stopMusic() { musicPlaying = false; }

document.addEventListener('DOMContentLoaded', async () => {
    video = document.getElementById('video');
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d', { alpha: false });

    const landmarksCb = document.getElementById('draw-landmarks-cb');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValue = document.getElementById('volume-value');
    const musicCb = document.getElementById('music-cb');
    const sfxCb = document.getElementById('sfx-cb');
    const difficultySelect = document.getElementById('difficulty-select');
    const livesSlider = document.getElementById('lives-slider');
    const livesValue = document.getElementById('lives-value');
    const elScore = document.getElementById('game-score');
    const elLives = document.getElementById('game-lives');
    const elLevel = document.getElementById('game-level');
    const elFps = document.getElementById('fps-value');
    const overScreen = document.getElementById('game-over-screen');
    const finalScore = document.getElementById('final-score');
    const statCuts = document.getElementById('stat-cuts');
    const statCombo = document.getElementById('stat-combo');
    const statMissed = document.getElementById('stat-missed');
    const btnRestart = document.getElementById('btn-restart');

    volumeSlider.oninput = (e) => {
        volumeGain = parseInt(e.target.value, 10) / 100;
        volumeValue.textContent = e.target.value + '%';
        updateAudioGains();
    };
    musicCb.onchange = (e) => {
        musicEnabled = e.target.checked;
        updateAudioGains();
        if (!musicEnabled) stopMusic();
        else if (gameState === 'PLAYING') startMusic();
    };
    sfxCb.onchange = (e) => { sfxEnabled = e.target.checked; updateAudioGains(); };
    difficultySelect.onchange = (e) => { gameDifficulty = e.target.value || 'normal'; };
    livesSlider.oninput = (e) => {
        initialLives = parseInt(e.target.value, 10);
        livesValue.textContent = initialLives;
    };
    livesValue.textContent = initialLives;
    landmarksCb.onchange = (e) => { drawDebugLandmarks = e.target.checked; };

    function resetGame() {
        score = 0; lives = initialLives; combo = 0; bestCombo = 0;
        spawnRate = 0; currentLevel = 0;
        fruits.length = 0; bombs.length = 0;
        ninjaParticles.length = 0; bladeTrails.length = 0;
        floatingTexts.length = 0;
        screenFlash = 0; totalCuts = 0; totalMissed = 0;
        shakeX = 0; shakeY = 0; comboMsgTimer = 0;
        levelUpTimer = 0; levelUpName = '';
        gameState = 'PLAYING';
        if (musicEnabled) startMusic();
    }

    btnRestart.onclick = () => {
        resetGame();
        overScreen.classList.add('hidden');
        updateHUD();
    };

    function updateHUD() {
        elScore.textContent = score;
        let heartsStr = '';
        for (let i = 0; i < initialLives; i++) heartsStr += i < lives ? '🍉' : '💀';
        elLives.textContent = heartsStr;

        const newLvl = getLevel();
        if (newLvl > currentLevel) {
            currentLevel = newLvl;
            levelUpName = LEVELS[newLvl].name;
            levelUpTimer = 1;
        }
        const lvl = LEVELS[getLevel()];
        elLevel.textContent = `LV${getLevel() + 1} ${lvl.name}`;

        if (lives <= 0 && gameState !== 'GAMEOVER') {
            gameState = 'GAMEOVER';
            finalScore.textContent = score;
            statCuts.textContent = totalCuts;
            statCombo.textContent = bestCombo;
            statMissed.textContent = totalMissed;
            overScreen.classList.remove('hidden');
            sfxGameOver();
            stopMusic();
        }
    }

    function addFloatingText(x, y, text, color, size) {
        floatingTexts.push({ x, y, text, color, size, life: 1, vy: -2.5 });
    }

    function triggerComboMsg() {
        if (combo > bestCombo) bestCombo = combo;
        let msg = null;
        for (let i = COMBO_MESSAGES.length - 1; i >= 0; i--) {
            if (combo >= COMBO_MESSAGES[i].min) { msg = COMBO_MESSAGES[i]; break; }
        }
        if (msg) {
            comboMsgText = msg.text;
            comboMsgColor = msg.color;
            comboMsgSize = msg.size;
            comboMsgTimer = 1;
            sfxCombo(Math.min(combo, 15));
        }
    }

    function spawnFruitOrBomb() {
        if (gameState !== 'PLAYING') return;
        const cfg = getEffectiveLevelConfig();
        const maxW = cfg.maxWave;
        const waveSize = maxW <= 1 ? 1 : (Math.random() < 0.25 ? Math.min(maxW, 2 + Math.floor(Math.random() * (maxW - 1))) : 1);

        for (let w = 0; w < waveSize; w++) {
            const isBomb = Math.random() < cfg.bombChance;
            const margin = 80;
            const xPos = margin + Math.random() * (canvas.width - margin * 2);
            const entity = {
                x: xPos, y: canvas.height + 60,
                vx: (Math.random() - 0.5) * 4,
                vy: -(Math.random() * 4 + cfg.speed),
                radius: isBomb ? 28 : 34,
                color: isBomb ? '#333' : FRUIT_JUICE_COLORS[(Math.random() * FRUIT_JUICE_COLORS.length) | 0],
                isBomb,
                emoji: isBomb ? '💣' : FRUIT_EMOJIS[(Math.random() * FRUIT_EMOJIS.length) | 0],
                active: true,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.15,
                cutAt: 0, cutAngle: 0,
            };
            (isBomb ? bombs : fruits).push(entity);
        }
    }

    function checkCollisions() {
        if (gameState !== 'PLAYING') return;
        let hitThisFrame = false;

        for (let ti = 0; ti < bladeTrails.length; ti++) {
            const trail = bladeTrails[ti];
            if (trail.length < 2) continue;
            const tip = trail[trail.length - 1];
            const prev = trail[trail.length - 2];
            const dx = tip.x - prev.x, dy = tip.y - prev.y;
            if (dx * dx + dy * dy < 9) continue;

            for (let fi = fruits.length - 1; fi >= 0; fi--) {
                const f = fruits[fi];
                if (!f.active || f.cutAt) continue;
                const fdx = tip.x - f.x, fdy = tip.y - f.y;
                const dist = f.radius + BLADE_HIT_EXTRA;
                if (fdx * fdx + fdy * fdy < dist * dist) {
                    f.active = false;
                    f.cutAt = performance.now();
                    f.cutAngle = Math.atan2(dy, dx);
                    hitThisFrame = true;
                    combo++; totalCuts++;
                    triggerComboMsg();
                    sfxSlice();

                    const points = 10 + (combo >= 2 ? Math.min(combo, 8) * 5 : 0);
                    score += points;
                    screenFlash = 0.25;

                    const txtColor = combo >= 5 ? '#ffb703' : combo >= 2 ? '#00dfd8' : '#fff';
                    addFloatingText(f.x, f.y - 20, `+${points}`, txtColor, combo >= 5 ? 28 : 22);

                    const pCount = Math.min(14, MAX_PARTICLES - ninjaParticles.length);
                    for (let i = 0; i < pCount; i++) {
                        const angle = (Math.PI * 2 * i) / pCount + Math.random() * 0.6;
                        const speed = 3 + Math.random() * 4;
                        ninjaParticles.push({
                            x: f.x, y: f.y,
                            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
                            color: f.color, life: 1, r: 3 + Math.random() * 5, type: 0,
                        });
                    }
                    if (comboTimeout) clearTimeout(comboTimeout);
                    comboTimeout = setTimeout(() => { combo = 0; }, COMBO_DECAY_MS);
                    updateHUD();
                }
            }

            for (let bi = bombs.length - 1; bi >= 0; bi--) {
                const b = bombs[bi];
                if (!b.active || b.cutAt) continue;
                const bdx = tip.x - b.x, bdy = tip.y - b.y;
                const dist = b.radius + BLADE_HIT_EXTRA;
                if (bdx * bdx + bdy * bdy < dist * dist) {
                    b.active = false;
                    b.cutAt = performance.now();
                    b.cutAngle = Math.atan2(dy, dx);
                    sfxBomb();

                    screenFlash = 0.5;
                    shakeX = (Math.random() - 0.5) * 18;
                    shakeY = (Math.random() - 0.5) * 12;
                    setTimeout(() => { shakeX = 0; shakeY = 0; }, 140);

                    const pCount = Math.min(16, MAX_PARTICLES - ninjaParticles.length);
                    for (let i = 0; i < pCount; i++) {
                        const angle = (Math.PI * 2 * i) / pCount + Math.random() * 0.4;
                        const speed = 5 + Math.random() * 8;
                        ninjaParticles.push({
                            x: b.x, y: b.y,
                            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 3,
                            color: i & 1 ? '#ff4d4d' : '#ffaa00',
                            life: 1, r: 4 + Math.random() * 8, type: 1,
                        });
                    }
                    addFloatingText(b.x, b.y - 30, 'BOMB!', '#ff4d4d', 30);
                    lives--; combo = 0;
                    updateHUD();
                }
            }
        }

        if (!hitThisFrame && combo > 0) {
            if (comboTimeout) clearTimeout(comboTimeout);
            comboTimeout = setTimeout(() => { combo = 0; }, COMBO_DECAY_MS);
        }
    }

    function updatePhysics(now) {
        if (gameState !== 'PLAYING') return;

        for (let i = ninjaParticles.length - 1; i >= 0; i--) {
            const p = ninjaParticles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += p.type === 1 ? 0.18 : 0.12;
            p.life -= 0.03;
            if (p.life <= 0) ninjaParticles.splice(i, 1);
        }

        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const ft = floatingTexts[i];
            ft.y += ft.vy; ft.vy -= 0.02; ft.life -= 0.022;
            if (ft.life <= 0) floatingTexts.splice(i, 1);
        }

        if (screenFlash > 0) screenFlash -= 0.04;
        if (comboMsgTimer > 0) comboMsgTimer -= 0.018;

        const grav = getEffectiveLevelConfig().gravity;
        const bottomLimit = canvas.height + 120;

        for (let i = fruits.length - 1; i >= 0; i--) {
            const f = fruits[i];
            if (f.cutAt) {
                if (now - f.cutAt > CUT_ANIMATION_MS) fruits.splice(i, 1);
                continue;
            }
            f.x += f.vx; f.y += f.vy; f.vy += grav; f.rotation += f.rotSpeed;
            if (f.y > bottomLimit) {
                if (f.active) { lives--; totalMissed++; sfxMiss(); updateHUD(); }
                fruits.splice(i, 1);
            }
        }

        for (let i = bombs.length - 1; i >= 0; i--) {
            const b = bombs[i];
            if (b.cutAt) {
                if (now - b.cutAt > EXPLODE_ANIMATION_MS) bombs.splice(i, 1);
                continue;
            }
            b.x += b.vx; b.y += b.vy; b.vy += grav; b.rotation += b.rotSpeed;
            if (b.y > bottomLimit) bombs.splice(i, 1);
        }

        if (levelUpTimer > 0) levelUpTimer -= 0.015;
    }

    function renderGameEngine(now) {
        if (gameState === 'PLAYING' && now - lastSpawn > spawnRate) {
            spawnFruitOrBomb();
            lastSpawn = now;
            spawnRate = getEffectiveLevelConfig().spawnMs;
        }

        updatePhysics(now);
        checkCollisions();

        ctx.save();
        ctx.translate(shakeX, shakeY);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const cw = canvas.width, ch = canvas.height;

        for (let i = 0; i < fruits.length; i++) {
            const f = fruits[i];
            const sz = (f.radius * 2.4) | 0;
            ctx.save();
            ctx.translate(f.x, f.y);
            if (f.cutAt) {
                const p = Math.min(1, (now - f.cutAt) / CUT_ANIMATION_MS);
                const a = f.cutAngle, cos = Math.cos(a), sin = Math.sin(a);
                if (p < 0.3) {
                    ctx.globalAlpha = 1;
                    ctx.font = `${sz}px sans-serif`;
                    ctx.fillText(f.emoji, 0, 0);
                    const len = (p / 0.3) * f.radius * 3;
                    ctx.strokeStyle = '#00dfd8'; ctx.lineWidth = 7;
                    ctx.beginPath();
                    ctx.moveTo(-cos * len, -sin * len);
                    ctx.lineTo(cos * len, sin * len);
                    ctx.stroke();
                } else {
                    const sep = ((p - 0.3) / 0.7) * 60;
                    ctx.globalAlpha = p >= 0.65 ? Math.max(0, 1 - (p - 0.65) / 0.35) : 1;
                    ctx.font = `${sz}px sans-serif`;
                    ctx.fillText(f.emoji, -cos * sep, -sin * sep);
                    ctx.fillText(f.emoji, cos * sep, sin * sep);
                }
            } else {
                ctx.globalAlpha = 1;
                ctx.rotate(f.rotation);
                ctx.font = `${sz}px sans-serif`;
                ctx.fillText(f.emoji, 0, 0);
            }
            ctx.restore();
        }

        for (let i = 0; i < bombs.length; i++) {
            const b = bombs[i];
            if (!b.active && !b.cutAt) continue;
            const sz = (b.radius * 2.4) | 0;
            ctx.save();
            ctx.translate(b.x, b.y);
            if (b.cutAt) {
                const p = Math.min(1, (now - b.cutAt) / EXPLODE_ANIMATION_MS);
                const a = b.cutAngle, cos = Math.cos(a), sin = Math.sin(a);
                if (p < 0.2) {
                    ctx.globalAlpha = 1;
                    ctx.font = `${sz}px sans-serif`;
                    ctx.fillText('💣', 0, 0);
                    const len = (p / 0.2) * b.radius * 3;
                    ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 7;
                    ctx.beginPath();
                    ctx.moveTo(-cos * len, -sin * len);
                    ctx.lineTo(cos * len, sin * len);
                    ctx.stroke();
                } else if (p < 0.45) {
                    const ring = ((p - 0.2) / 0.25) * 80;
                    ctx.globalAlpha = 1;
                    ctx.font = `${sz}px sans-serif`;
                    ctx.fillText('💣', 0, 0);
                    ctx.globalAlpha = 1 - (p - 0.2) / 0.25;
                    ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(0, 0, b.radius + ring, 0, Math.PI * 2);
                    ctx.stroke();
                } else {
                    const sep = ((p - 0.45) / 0.55) * 65;
                    ctx.globalAlpha = Math.max(0, 1 - (p - 0.45) / 0.55);
                    ctx.font = `${sz}px sans-serif`;
                    ctx.fillText('💣', -cos * sep, -sin * sep);
                    ctx.fillText('💣', cos * sep, sin * sep);
                }
            } else {
                ctx.globalAlpha = 1;
                ctx.rotate(b.rotation);
                ctx.font = `${sz}px sans-serif`;
                ctx.fillText('💣', 0, 0);
            }
            ctx.restore();
        }

        ctx.globalAlpha = 1;
        for (let i = 0; i < ninjaParticles.length; i++) {
            const p = ninjaParticles[i];
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * (0.4 + p.life * 0.6), 0, Math.PI * 2);
            ctx.fill();
        }

        for (let i = 0; i < floatingTexts.length; i++) {
            const ft = floatingTexts[i];
            ctx.globalAlpha = ft.life;
            ctx.font = `bold ${ft.size}px 'Outfit', sans-serif`;
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 3;
            ctx.strokeText(ft.text, ft.x, ft.y);
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, ft.x, ft.y);
        }

        if (comboMsgTimer > 0) {
            const s = 0.6 + Math.min(comboMsgTimer, 0.4) / 0.4 * 0.8;
            ctx.save();
            ctx.globalAlpha = Math.min(comboMsgTimer * 2, 1);
            ctx.translate(cw / 2, 85);
            ctx.scale(s, s);
            ctx.font = `900 ${comboMsgSize}px 'Outfit', sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 5;
            ctx.strokeText(comboMsgText, 0, 0);
            ctx.fillStyle = comboMsgColor;
            ctx.fillText(comboMsgText, 0, 0);
            ctx.font = `700 18px 'Outfit', sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.fillText(`${combo}x COMBO`, 0, comboMsgSize * 0.5);
            ctx.restore();
        }

        if (levelUpTimer > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(levelUpTimer * 2.5, 1);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            const bh = 50;
            ctx.fillRect(0, ch / 2 - bh / 2, cw, bh);
            ctx.font = `800 28px 'Outfit', sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffb703';
            ctx.fillText(`⬆ LEVEL ${getLevel() + 1} — ${levelUpName} ⬆`, cw / 2, ch / 2);
            ctx.restore();
        }

        ctx.restore();

        for (let ti = 0; ti < bladeTrails.length; ti++) {
            const trail = bladeTrails[ti];
            if (trail.length < 2) continue;
            for (let i = 1; i < trail.length; i++) {
                const t = i / trail.length;
                ctx.beginPath();
                ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
                ctx.lineTo(trail[i].x, trail[i].y);
                ctx.lineWidth = 3 + t * 12;
                ctx.lineCap = 'round';
                ctx.strokeStyle = `rgba(0, 223, 216, ${t * 0.85})`;
                ctx.stroke();
            }
            const tip = trail[trail.length - 1];
            ctx.beginPath();
            ctx.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = 1;
            ctx.fill();
        }

        if (screenFlash > 0) {
            ctx.globalAlpha = Math.min(screenFlash, 0.3);
            ctx.fillStyle = screenFlash > 0.35 ? '#ff4d4d' : '#fff';
            ctx.fillRect(0, 0, cw, ch);
            ctx.globalAlpha = 1;
        }

        if (combo >= 3) {
            const intensity = Math.min((combo - 2) * 0.08, 0.5);
            const glowColor = combo >= 10 ? '#ff3366' : combo >= 6 ? '#ffb703' : '#00dfd8';
            ctx.globalAlpha = intensity * (0.7 + Math.sin(now * 0.008) * 0.3);
            ctx.strokeStyle = glowColor;
            ctx.lineWidth = 3;
            ctx.strokeRect(1, 1, cw - 2, ch - 2);
            ctx.globalAlpha = 1;
        }
    }

    async function initHandLandmarker() {
        try {
            const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs');
            const { HandLandmarker, FilesetResolver } = vision;
            const wasm = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
            handLandmarker = await HandLandmarker.createFromOptions(wasm, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                },
                numHands: 2,
                runningMode: 'VIDEO',
                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });
        } catch (err) {
            console.error('MediaPipe init error:', err);
        }
    }

    function processDetectionResult(result) {
        if (!result || !result.landmarks || result.landmarks.length === 0) {
            lastLabels = [];
            bladeTargets.length = 0;
            bladeCurrent.length = 0;
            return;
        }

        lastLabels.length = 0;
        for (let i = 0; i < result.landmarks.length; i++) {
            const lms = result.landmarks[i];
            lastLabels.push(lms);

            if (!bladeTargets[i]) bladeTargets[i] = { x: 0, y: 0 };
            if (!bladeCurrent[i]) bladeCurrent[i] = { x: 0, y: 0 };

            if (lms.length > 8) {
                const lm = lms[8];
                const tx = (1 - lm.x) * canvas.width;
                const ty = lm.y * canvas.height;
                bladeTargets[i].x = tx;
                bladeTargets[i].y = ty;
                if (bladeCurrent[i].x === 0 && bladeCurrent[i].y === 0) {
                    bladeCurrent[i].x = tx;
                    bladeCurrent[i].y = ty;
                }
            }
        }
        bladeTargets.length = result.landmarks.length;
        bladeCurrent.length = result.landmarks.length;
    }

    function renderLoop() {
        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) { requestAnimationFrame(renderLoop); return; }
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

        fpsFrameCount++;
        const now = performance.now();
        if (now - fpsLastTime >= 1000) {
            fpsValue = fpsFrameCount;
            fpsFrameCount = 0;
            fpsLastTime = now;
            elFps.textContent = fpsValue;
        }

        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -w, 0, w, h);
        ctx.restore();

        if (handLandmarker && !detectionPending && (now - lastDetectionTime >= DETECTION_INTERVAL_MS)) {
            lastDetectionTime = now;
            detectionPending = true;
            const run = () => {
                try {
                    const result = handLandmarker.detectForVideo(video, video.currentTime * 1000);
                    processDetectionResult(result);
                } catch (e) {
                    if (e.message && !e.message.includes('out of range')) console.warn(e);
                }
                detectionPending = false;
            };
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(run, { timeout: 80 });
            } else {
                run();
            }
        }

        if (bladeTargets.length > 0) {
            while (bladeTrails.length < bladeTargets.length) bladeTrails.push([]);
            if (bladeTrails.length > bladeTargets.length) bladeTrails.length = bladeTargets.length;
            for (let idx = 0; idx < bladeTargets.length; idx++) {
                const t = bladeTargets[idx], c = bladeCurrent[idx];
                c.x += (t.x - c.x) * LERP_SPEED;
                c.y += (t.y - c.y) * LERP_SPEED;
                bladeTrails[idx].push({ x: c.x, y: c.y });
                if (bladeTrails[idx].length > TRAIL_LENGTH) bladeTrails[idx].shift();
            }
        } else {
            for (let i = 0; i < bladeTrails.length; i++) {
                if (bladeTrails[i].length > 0) bladeTrails[i].shift();
            }
        }

        if (drawDebugLandmarks && lastLabels.length > 0) {
            ctx.fillStyle = '#ff3366';
            for (let h = 0; h < lastLabels.length; h++) {
                const lms = lastLabels[h];
                for (let l = 0; l < lms.length; l++) {
                    ctx.beginPath();
                    ctx.arc((1 - lms[l].x) * canvas.width, lms[l].y * canvas.height, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        renderGameEngine(now);
        requestAnimationFrame(renderLoop);
    }

    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, frameRate: { ideal: 30 } },
            });
            video.srcObject = stream;
            await video.play();
            await initHandLandmarker();
            renderLoop();
        } catch (err) {
            console.error('Camera error:', err);
        }
    }

    startMusic();
    startCamera();
});

})();
