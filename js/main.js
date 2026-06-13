// ========== 画布基础配置 ==========
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1100;
canvas.height = 700;

// 全局固定参数
const tileSize = 55;
const groundOffset = 160;
const groundY = canvas.height - groundOffset; // 540
const bgTotalWidth = 11700;

let cameraX = 0;
let score = 0;
let loadDone = false;
let gameOver = false;

// 悬崖配置（严格对照原版大地图留出空隙）
const cliffs = [
    { start: 3310, width: 110 },
    { start: 4230, width: 110 },
    { start: 7870, width: 110 }
];

// 终点配置（世界坐标）
const flagWorldX = 9700;
const castleWorldX = 10300;

// 旗子状态
let flagState = {
    sliding: false,
    y: groundY - 465,
    targetY: groundY - 55,
    reached: false
};

// ========== 图片资源加载 ==========
const img = {
    bg: new Image(),
    mario_idle: new Image(),
    mario_walk: new Image(),
    tile_ground: new Image(),
    tile_question: new Image(),
    tile_brick: new Image(),
    tile_pipe_top: new Image(),
    tile_pipe_body1: new Image(),
    tile_pipe_body2: new Image(),
    step: new Image(),
    mushroom: new Image(),
    goomba: new Image(),
    goomba_flat: new Image(),
    turtle: new Image(),
    turtle_shell: new Image(),
    coin: new Image(),
    flag: new Image(),
    flag_cloth: new Image(),
    castle: new Image()
};

// 资源路径
img.bg.src = 'assets/images/bg.png';
img.mario_idle.src = 'assets/images/player/mario_idle.png';
img.mario_walk.src = 'assets/images/player/mario_walk.png';
img.tile_ground.src = 'assets/images/tiles/tile_ground.png';
img.tile_question.src = 'assets/images/tiles/tile_question.png';
img.tile_brick.src = 'assets/images/tiles/tile_brick.png';
img.tile_pipe_top.src = 'assets/images/tiles/tile_pipe_top.png';
img.tile_pipe_body1.src = 'assets/images/tiles/tile_pipe_body1.png';
img.tile_pipe_body2.src = 'assets/images/tiles/tile_pipe_body2.png';
img.step.src = 'assets/images/tiles/step.png';
img.mushroom.src = 'assets/images/enemies/mushroom.png';
img.goomba.src = 'assets/images/enemies/goomba.png';
img.goomba_flat.src = 'assets/images/enemies/goomba_flat.png';
img.turtle.src = 'assets/images/enemies/turtle.png';
img.turtle_shell.src = 'assets/images/enemies/turtle_shell.png';
img.coin.src = 'assets/images/props/coin.png';
img.flag.src = 'assets/images/props/flag.png';
img.flag_cloth.src = 'assets/images/props/flag_cloth.png';
img.castle.src = 'assets/images/props/castle.png';

let loadCount = 0;
const totalImg = Object.keys(img).length;
for(let key in img){
    img[key].onload = () => {
        loadCount++;
        if(loadCount >= totalImg) loadDone = true;
    };
}

// ========== 音频资源配置 ==========
const audio = {
    music: new Audio('assets/music.mp3'),
    getScore: new Audio('assets/getscore.mp3'),
    lose: new Audio('assets/lose.mp3')
};
audio.music.loop = true;
audio.music.volume = 0.5;
audio.getScore.volume = 0.1;
audio.lose.volume = 1;

let audioInitialized = false;
function initAudio() {
    if (!audioInitialized) {
        audio.music.play().catch(() => {});
        audioInitialized = true;
    }
}
window.addEventListener('keydown', initAudio);
window.addEventListener('click', initAudio);

// 音量控制
const volumeSlider = document.getElementById('volumeSlider');
volumeSlider.addEventListener('input', (e) => {
    audio.music.volume = e.target.value / 100;
});

// ========== 键盘监听 ==========
const keys = {};
document.addEventListener('keydown', e => keys[e.code] = true);
document.addEventListener('keyup', e => keys[e.code] = false);

// ========== 角色配置 ==========
const player = {
    worldX: 100,
    y: groundY - 55,
    w: 55,
    h: 55,
    speed: 5.5,
    vy: 0,
    gravity: 0.65,
    jumpPower: -19,
    isGround: true,
    facingLeft: false
};

let walkTimer = 0;
let walkState = 0;

// ========== 问号砖爆出的金币和蘑菇特效数组 ==========
let bouncingItems = [];

function spawnBouncingCoin(bx, by) {
    bouncingItems.push({
        x: bx + 7,
        y: by - 30,
        vy: -9,
        gravity: 0.5,
        timer: 0,
        maxLife: 30,
        type: 'coin'
    });
}

function spawnBouncingMushroom(bx, by) {
    bouncingItems.push({
        x: bx + (tileSize - 55) / 2,
        y: by - 55,
        vy: -8,
        gravity: 0.5,
        timer: 0,
        maxLife: 40,
        type: 'mushroom'
    });
}

// ========== 动态粒子特效更新 ==========
function updateParticles() {
    for (let i = bouncingItems.length - 1; i >= 0; i--) {
        let item = bouncingItems[i];
        item.vy += item.gravity;
        item.y += item.vy;
        item.timer++;
        if (item.timer > item.maxLife) {
            bouncingItems.splice(i, 1);
        }
    }
}

// ========== 根据参考图完整还原整横版大关卡 (世界坐标) ==========
const staticBlocks = [
    // 隐藏的物理路面盒（底部不渲染任何平铺 tile_ground.png 干扰视觉）
    { x: 0, y: groundY, w: 3310, h: groundOffset, type: 'ground_invisible' },
    { x: 3420, y: groundY, w: 810, h: groundOffset, type: 'ground_invisible' },
    { x: 4340, y: groundY, w: 3530, h: groundOffset, type: 'ground_invisible' },
    { x: 7980, y: groundY, w: 4000, h: groundOffset, type: 'ground_invisible' },
    
    // 【阶段一】序盘砖块与山丘段 (0m ~ 1500m)
    { x: 400, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 500, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 555, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 610, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 555, y: groundY - tileSize * 7, w: tileSize, h: tileSize, type: 'question', hit: false },

    // 【参考图第一处左小山丘群】(金字塔阶梯拼法)
    { x: 900, y: groundY - tileSize * 1, w: tileSize, h: tileSize, type: 'step' },
    { x: 955, y: groundY - tileSize * 1, w: tileSize, h: tileSize, type: 'step' },
    { x: 955, y: groundY - tileSize * 2, w: tileSize, h: tileSize, type: 'step' },
    { x: 1010, y: groundY - tileSize * 1, w: tileSize, h: tileSize, type: 'step' },
    { x: 1010, y: groundY - tileSize * 2, w: tileSize, h: tileSize, type: 'step' },
    { x: 1010, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'step' },
    
    // 更多内容在阶段一
    { x: 1150, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 1205, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 1260, y: groundY - tileSize * 2, w: tileSize, h: tileSize, type: 'brick', hit: false },
    
    // 【阶段二】一号、二号经典水管防御带 (1500m ~ 3300m)
    { x: 1400, y: groundY - 56, w: 107, h: 56, type: 'pipe_body1' },
    { x: 1400, y: groundY - 56 - 50, w: 110, h: 50, type: 'pipe_top', spawnPipe: true, spawnTimer: 0 },
    
    { x: 1600, y: groundY - tileSize * 2, w: tileSize, h: tileSize, type: 'step' },
    { x: 1655, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'step' },
    { x: 1710, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    
    { x: 2200, y: groundY - 164, w: 108, h: 164, type: 'pipe_body2' },
    { x: 2200, y: groundY - 164 - 50, w: 110, h: 50, type: 'pipe_top', spawnPipe: true, spawnTimer: 120 },
    
    { x: 2400, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 2455, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 2510, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 2565, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'question', hit: false },
    
    // 【阶段三】中场长条空中方块天桥段 (3500m ~ 6500m)
    { x: 3500, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 3555, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 3610, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 3665, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 3720, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    
    { x: 4000, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'step' },
    { x: 4055, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'step' },
    { x: 4110, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'brick', hit: false },
    
    { x: 4500, y: groundY - 56, w: 107, h: 56, type: 'pipe_body1' },
    { x: 4500, y: groundY - 56 - 50, w: 110, h: 50, type: 'pipe_top', spawnPipe: true, spawnTimer: 60 },
    
    { x: 4700, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 4755, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 4810, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 4865, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 4920, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    
    { x: 5200, y: groundY - tileSize * 4, w: tileSize * 6, h: tileSize, type: 'long_brick' },
    
    { x: 5700, y: groundY - tileSize * 2, w: tileSize, h: tileSize, type: 'step' },
    { x: 5755, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'step' },
    { x: 5800, y: groundY - tileSize * 7, w: tileSize * 4, h: tileSize, type: 'long_brick' },
    
    { x: 6200, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 6255, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 6310, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 6365, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 6420, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    
    { x: 6700, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'step' },
    { x: 6755, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'step' },
    { x: 6810, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 6865, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'brick', hit: false },
    
    { x: 7100, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 7155, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 7210, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'question', hit: false },
    
    // 【阶段四】更多内容
    { x: 8100, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 8155, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 8210, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    { x: 8265, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 8320, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    
    { x: 8600, y: groundY - tileSize * 2, w: tileSize, h: tileSize, type: 'step' },
    { x: 8655, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'step' },
    { x: 8710, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'step' },
    { x: 8765, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 8820, y: groundY - tileSize * 4, w: tileSize, h: tileSize, type: 'question', hit: false },
    
    { x: 9000, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'brick', hit: false },
    { x: 9055, y: groundY - tileSize * 3, w: tileSize, h: tileSize, type: 'question', hit: false },
    
    // 【阶段五】终点大金字塔大台阶（靠近旗子）
    { x: 9150, y: groundY - tileSize * 1, w: tileSize * 8, h: tileSize, type: 'step_row' },
    { x: 9205, y: groundY - tileSize * 2, w: tileSize * 7, h: tileSize, type: 'step_row' },
    { x: 9260, y: groundY - tileSize * 3, w: tileSize * 6, h: tileSize, type: 'step_row' },
    { x: 9315, y: groundY - tileSize * 4, w: tileSize * 5, h: tileSize, type: 'step_row' },
    { x: 9370, y: groundY - tileSize * 5, w: tileSize * 4, h: tileSize, type: 'step_row' },
    { x: 9425, y: groundY - tileSize * 6, w: tileSize * 3, h: tileSize, type: 'step_row' },
    { x: 9480, y: groundY - tileSize * 7, w: tileSize * 2, h: tileSize, type: 'step_row' },
    { x: 9535, y: groundY - tileSize * 8, w: tileSize * 1, h: tileSize, type: 'step_row' }
];

// ========== 金币固定大关卡分布 ==========
let coins = [
    { x: 300, y: groundY - 60, w: 40, h: 40, exist: true },
    { x: 505, y: groundY - tileSize * 5, w: 40, h: 40, exist: true },
    { x: 1200, y: groundY - 80, w: 40, h: 40, exist: true },
    { x: 1700, y: groundY - tileSize * 6, w: 40, h: 40, exist: true },
    { x: 2500, y: groundY - tileSize * 5, w: 40, h: 40, exist: true },
    { x: 3600, y: groundY - tileSize * 6, w: 40, h: 40, exist: true },
    { x: 4100, y: groundY - tileSize * 5, w: 40, h: 40, exist: true },
    { x: 4850, y: groundY - tileSize * 6, w: 40, h: 40, exist: true },
    { x: 5300, y: groundY - tileSize * 6, w: 40, h: 40, exist: true },
    { x: 5400, y: groundY - tileSize * 6, w: 40, h: 40, exist: true },
    { x: 5900, y: groundY - tileSize * 9, w: 40, h: 40, exist: true },
    { x: 6300, y: groundY - tileSize * 6, w: 40, h: 40, exist: true },
    { x: 7150, y: groundY - tileSize * 5, w: 40, h: 40, exist: true },
    { x: 8200, y: groundY - tileSize * 6, w: 40, h: 40, exist: true },
    { x: 8850, y: groundY - tileSize * 6, w: 40, h: 40, exist: true }
];

// ========== 蘑菇数组（直接收集加分，分散放置不重叠） ==========
let mushrooms = [
    { x: 800, y: groundY - 55, w: 55, h: 55, exist: true },
    { x: 1800, y: groundY - 55, w: 55, h: 55, exist: true },
    { x: 2900, y: groundY - 55, w: 55, h: 55, exist: true },
    { x: 3800, y: groundY - 55, w: 55, h: 55, exist: true },
    { x: 4900, y: groundY - 55, w: 55, h: 55, exist: true },
    { x: 5600, y: groundY - 55, w: 55, h: 55, exist: true },
    { x: 6500, y: groundY - 55, w: 55, h: 55, exist: true },
    { x: 7300, y: groundY - 55, w: 55, h: 55, exist: true },
    { x: 8400, y: groundY - 55, w: 55, h: 55, exist: true },
    { x: 8900, y: groundY - 55, w: 55, h: 55, exist: true }
];

// ========== 动态小怪池（分散放置不重叠） ==========
let enemies = [
    { x: 750, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
    { x: 1500, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
    { x: 2600, y: groundY - 55, w: 55, h: 55, type: 'turtle', alive: true, isShell: false, direction: -1, speed: 0.8, onPipe: false },
    { x: 3700, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
    { x: 4200, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
    { x: 5100, y: groundY - 55, w: 55, h: 55, type: 'turtle', alive: true, isShell: false, direction: -1, speed: 0.8, onPipe: false },
    { x: 6000, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
    { x: 6900, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
    { x: 7600, y: groundY - 55, w: 55, h: 55, type: 'turtle', alive: true, isShell: false, direction: -1, speed: 0.8, onPipe: false },
    { x: 8500, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false }
];

// ========== AABB 框体提取函数 ==========
function getRect(obj, isPlayer = false) {
    return {
        x: isPlayer ? obj.worldX : obj.x,
        y: obj.y,
        w: obj.w || tileSize,
        h: obj.h || tileSize
    };
}

function collideCheck(r1, r2) {
    return r1.x < r2.x + r2.w &&
           r1.x + r1.w > r2.x &&
           r1.y < r2.y + r2.h &&
           r1.y + r1.h > r2.y;
}

function playScoreSound() {
    audio.getScore.currentTime = 0;
    audio.getScore.play().catch(() => {});
}

function triggerLose(reason) {
    audio.music.pause();
    audio.lose.currentTime = 0;
    audio.lose.play().catch(() => {});
    alert(reason);
    
    for (let key in keys) keys[key] = false;
    
    player.worldX = 100;
    player.y = groundY - 55;
    player.vy = 0;
    player.isGround = true;
    cameraX = 0;
    score = 0;
    bouncingItems = [];
    flagState.sliding = false;
    flagState.y = groundY - 465;
    flagState.reached = false;
    
    coins.forEach(c => c.exist = true);
    mushrooms.forEach(m => m.exist = true);
    staticBlocks.forEach(b => { 
        if(b.type==='question') b.hit = false;
        if(b.type==='brick') b.hit = false;
    });
    enemies = [
        { x: 750, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
        { x: 1500, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
        { x: 2600, y: groundY - 55, w: 55, h: 55, type: 'turtle', alive: true, isShell: false, direction: -1, speed: 0.8, onPipe: false },
        { x: 3700, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
        { x: 4200, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
        { x: 5100, y: groundY - 55, w: 55, h: 55, type: 'turtle', alive: true, isShell: false, direction: -1, speed: 0.8, onPipe: false },
        { x: 6000, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
        { x: 6900, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false },
        { x: 7600, y: groundY - 55, w: 55, h: 55, type: 'turtle', alive: true, isShell: false, direction: -1, speed: 0.8, onPipe: false },
        { x: 8500, y: groundY - 55, w: 55, h: 55, type: 'goomba', alive: true, flat: false, timer: 0, direction: -1, speed: 1, onPipe: false }
    ];
    
    if (audioInitialized) audio.music.play().catch(() => {});
}

// ========== 游戏核心更新 ==========
function update() {
    if (gameOver) return;

    // 更新旗子滑下
    if (flagState.sliding && !flagState.reached) {
        if (flagState.y < flagState.targetY) {
            flagState.y += 3;
        } else {
            flagState.y = flagState.targetY;
            flagState.reached = true;
        }
    }

    // 1. 左右水平坐标移动与挤压挡墙判定
    let moveX = 0;
    if (keys['ArrowLeft']) { moveX = -player.speed; player.facingLeft = true; }
    if (keys['ArrowRight']) { moveX = player.speed; player.facingLeft = false; }

    player.worldX += moveX;
    if (player.worldX < 0) player.worldX = 0;
    
    let pRect = getRect(player, true);
    for (let block of staticBlocks) {
        if (block.hit && block.type === 'brick') continue;
        let bRect = getRect(block);
        if (collideCheck(pRect, bRect)) {
            if (moveX > 0) player.worldX = block.x - player.w;
            if (moveX < 0) player.worldX = block.x + block.w;
        }
    }

    // 2. 纵向跳跃及重力模拟
    if (keys['Space'] && player.isGround) {
        player.vy = player.jumpPower;
        player.isGround = false;
    }
    player.vy += player.gravity;
    player.y += player.vy;

    // 3. Y 轴与障碍物的顶头/站立二次修正判定
    pRect = getRect(player, true);
    player.isGround = false;

    for (let block of staticBlocks) {
        if (block.hit && block.type === 'brick') continue;
        let bRect = getRect(block);
        if (collideCheck(pRect, bRect)) {
            if (player.vy > 0) {
                player.y = block.y - player.h;
                player.vy = 0;
                player.isGround = true;
            } else if (player.vy < 0) {
                player.y = block.y + bRect.h;
                player.vy = 0;
                
                if (block.type === 'question' && !block.hit) {
                    block.hit = true;
                    score += 10;
                    playScoreSound();
                    spawnBouncingCoin(block.x, block.y);
                } else if (block.type === 'brick' && !block.hit) {
                    block.hit = true;
                    if (Math.random() > 0.3) {
                        score += 10;
                        playScoreSound();
                        spawnBouncingMushroom(block.x, block.y);
                    }
                }
            }
        }
    }

    // 4. 粒子系统更新
    updateParticles();

    // 5. 谷底悬崖空洞坠毁判定
    if (player.y > canvas.height + 50) {
        triggerLose('掉入悬崖深谷，再接再厉！');
        return;
    }

    // 6. 镜头黄金视界居中算法
    cameraX = player.worldX - canvas.width / 2;
    if (cameraX < 0) cameraX = 0;
    if (cameraX > bgTotalWidth - canvas.width) cameraX = bgTotalWidth - canvas.width;

    // 7. 步行动画
    if (keys.ArrowLeft || keys.ArrowRight) {
        walkTimer++;
        if (walkTimer > 6) { walkState = !walkState; walkTimer = 0; }
    }

    // 8. 场景常规金币收集
    coins.forEach(coin => {
        if (coin.exist && collideCheck(getRect(player, true), getRect(coin))) {
            coin.exist = false;
            score += 10;
            playScoreSound();
        }
    });

    // 9. 蘑菇收集
    mushrooms.forEach(mushroom => {
        if (mushroom.exist && collideCheck(getRect(player, true), getRect(mushroom))) {
            mushroom.exist = false;
            score += 10;
            playScoreSound();
        }
    });

    // 10. 水管冷却孵化出怪
    staticBlocks.forEach(block => {
        if (block.spawnPipe) {
            block.spawnTimer++;
            if (block.spawnTimer > 400) { // 降低出现频率
                block.spawnTimer = 0;
                let dist = Math.abs(player.worldX - block.x);
                if (dist > 250 && dist < 750 && enemies.length < 15) {
                    // 检查水管上是否已经有敌人
                    let hasEnemyOnPipe = false;
                    for (let enemy of enemies) {
                        if (enemy.alive && Math.abs(enemy.x - (block.x + 28)) < 60 && Math.abs(enemy.y - (block.y - 55)) < 60) {
                            hasEnemyOnPipe = true;
                            break;
                        }
                    }
                    if (!hasEnemyOnPipe) {
                        enemies.push({
                            x: block.x + 28,
                            y: block.y - 55,
                            w: 55, h: 55,
                            type: 'goomba',
                            alive: true,
                            flat: false,
                            timer: 0,
                            direction: -1,
                            speed: 1,
                            onPipe: true // 标记是水管上的敌人，不动
                        });
                    }
                }
            }
        }
    });

    // 11. 敌人移动和碰撞检测
    enemies.forEach(enemy => {
        if (!enemy.alive) return;
        if (enemy.flat) {
            enemy.timer++;
            if (enemy.timer > 25) enemy.alive = false;
            return;
        }

        // 移动敌人 - 水管上的不动
        if (!enemy.onPipe && (enemy.type === 'goomba' || (enemy.type === 'turtle' && !enemy.isShell))) {
            let oldX = enemy.x;
            enemy.x += enemy.direction * enemy.speed;
            
            // 检测碰撞障碍物
            let eRect = getRect(enemy);
            let collision = false;
            
            for (let block of staticBlocks) {
                if (block.hit && block.type === 'brick') continue;
                let bRect = getRect(block);
                
                if (collideCheck(eRect, bRect)) {
                    collision = true;
                    break;
                }
            }
            
            if (collision) {
                enemy.x = oldX;
                enemy.direction *= -1;
            }
        }

        // 与玩家碰撞检测
        let eRect = getRect(enemy);
        let pRect = getRect(player, true);

        if (collideCheck(pRect, eRect)) {
            let playerBottom = player.y + player.h;
            let enemyThreshold = enemy.y + enemy.h * 0.4;

            if (player.vy > 0 && playerBottom <= enemyThreshold + player.vy + 2) {
                player.vy = -11;
                player.y = enemy.y - player.h;
                
                if (enemy.type === 'goomba') {
                    enemy.flat = true;
                    score += 20;
                    playScoreSound();
                } else if (enemy.type === 'turtle') {
                    if (!enemy.isShell) {
                        enemy.isShell = true;
                        score += 20;
                        playScoreSound();
                    } else {
                        enemy.alive = false;
                    }
                }
            } else {
                triggerLose('呜哇！遭遇怪物突袭受伤失败。');
            }
        }
    });

    // 12. 接触旗子判定
    if (!flagState.sliding && player.worldX >= flagWorldX - 30) {
        flagState.sliding = true;
    }

    // 13. 进入城堡判定
    if (flagState.reached && player.worldX >= castleWorldX) {
        alert('⭐ 恭喜通关！完美摘旗，胜利会师城堡！ ⭐');
        triggerLose('重启新的一轮挑战');
    }
}

// ========== 页面图形渲染 ==========
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. 远景背景图滚动
    ctx.drawImage(img.bg, -cameraX, 0);

    // 2. 绘制大关卡各障碍模块
    staticBlocks.forEach(block => {
        let rx = block.x - cameraX;
        if (rx + 500 >= 0 && rx <= canvas.width + 150) {
            if (block.type === 'question') {
                ctx.drawImage(block.hit ? img.tile_brick : img.tile_question, rx, block.y, tileSize, tileSize);
            }
            if (block.type === 'brick' && !block.hit) {
                ctx.drawImage(img.tile_brick, rx, block.y, tileSize, tileSize);
            }
            if (block.type === 'step') ctx.drawImage(img.step, rx, block.y, tileSize, tileSize);
            
            if (block.type === 'long_brick') {
                for(let i=0; i<block.w; i+=tileSize) {
                    ctx.drawImage(img.tile_brick, rx + i, block.y, tileSize, tileSize);
                }
            }
            if (block.type === 'step_row') {
                for(let i=0; i<block.w; i+=tileSize) {
                    ctx.drawImage(img.step, rx + i, block.y, tileSize, tileSize);
                }
            }
            if (block.type === 'pipe_body1') ctx.drawImage(img.tile_pipe_body1, rx, block.y, block.w, block.h);
            if (block.type === 'pipe_body2') ctx.drawImage(img.tile_pipe_body2, rx, block.y, block.w, block.h);
            if (block.type === 'pipe_top') ctx.drawImage(img.tile_pipe_top, rx, block.y, block.w, block.h);
        }
    });

    // 3. 绘制问号砖蹦出的动态动画
    bouncingItems.forEach(item => {
        ctx.globalAlpha = 1 - (item.timer / item.maxLife) * 0.5;
        if (item.type === 'coin') {
            ctx.drawImage(img.coin, item.x - cameraX, item.y, 40, 40);
        } else if (item.type === 'mushroom') {
            ctx.drawImage(img.mushroom, item.x - cameraX, item.y, item.w, item.h);
        }
        ctx.globalAlpha = 1;
    });

    // 4. 绘制自然堆放的常规金币
    coins.forEach(coin => {
        if (coin.exist) {
            ctx.drawImage(img.coin, coin.x - cameraX, coin.y, coin.w, coin.h);
        }
    });

    // 5. 绘制蘑菇
    mushrooms.forEach(mushroom => {
        if (mushroom.exist) {
            ctx.drawImage(img.mushroom, mushroom.x - cameraX, mushroom.y, mushroom.w, mushroom.h);
        }
    });

    // 6. 绘制移动小怪
    enemies.forEach(enemy => {
        if (!enemy.alive) return;
        let ex = enemy.x - cameraX;
        let ey = enemy.y;

        if (enemy.type === 'goomba') {
            if (enemy.flat) {
                ctx.drawImage(img.goomba_flat, ex, ey + 35, enemy.w, 20);
            } else {
                ctx.save();
                if (enemy.direction > 0) {
                    ctx.translate(ex + enemy.w, ey);
                    ctx.scale(-1, 1);
                    ctx.drawImage(img.goomba, 0, 0, enemy.w, enemy.h);
                } else {
                    ctx.drawImage(img.goomba, ex, ey, enemy.w, enemy.h);
                }
                ctx.restore();
            }
        }
        if (enemy.type === 'turtle') {
            if (enemy.isShell) {
                ctx.drawImage(img.turtle_shell, ex, ey, enemy.w, enemy.h);
            } else {
                ctx.save();
                if (enemy.direction > 0) {
                    ctx.translate(ex + enemy.w, ey);
                    ctx.scale(-1, 1);
                    ctx.drawImage(img.turtle, 0, 0, enemy.w, enemy.h);
                } else {
                    ctx.drawImage(img.turtle, ex, ey, enemy.w, enemy.h);
                }
                ctx.restore();
            }
        }
    });

    // 7. 终点物标点绘制
    let flagX = flagWorldX - cameraX;
    // 旗杆固定在上面，不移动
    ctx.drawImage(img.flag, flagX, groundY - 465, 55, 465);
    // 旗帜滑下的动画
    let clothY = flagState.sliding ? flagState.y : groundY - 465;
    ctx.drawImage(img.flag_cloth, flagX, clothY, 55, 55);

    let castleX = castleWorldX - cameraX;
    ctx.drawImage(img.castle, castleX, groundY - 274, 280, 274);

    // 8. 渲染马里奥
    let screenX = player.worldX - cameraX;
    let screenY = player.y;

    ctx.save();
    if (player.facingLeft) {
        ctx.translate(screenX + player.w, screenY);
        ctx.scale(-1, 1);
        screenX = 0;
        screenY = 0;
    }
    
    if (keys.ArrowLeft || keys.ArrowRight) {
        ctx.drawImage(img.mario_walk, screenX, screenY, player.w, player.h);
    } else {
        ctx.drawImage(img.mario_idle, screenX, screenY, player.w, player.h);
    }
    ctx.restore();

    // 9. 顶部信息栏
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px Arial';
    ctx.fillText(`分数：${score}`, 20, 45);
}

// ========== 统一心跳循环 ==========
function gameLoop() {
    if (loadDone) {
        update();
        render();
    }
    requestAnimationFrame(gameLoop);
}

gameLoop();
