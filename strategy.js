const SCAN = ['up', 'right', 'down', 'left', 'up'];
const BEARING = { right: 0, down: 90, left: 180, up: 270 };
const DEFAULTS = {
    mapWidth: 1280,
    speed: 300,
    startX: 640
};

function configuration(options) {
    const config = { ...DEFAULTS, ...options };
    for (const key of ['mapWidth', 'speed']) {
        if (!Number.isFinite(config[key]) || config[key] <= 0) {
            throw new RangeError(`${key} must be a positive number`);
        }
    }
    if (!Number.isFinite(config.startX)
        || config.startX < 0 || config.startX > config.mapWidth) {
        throw new RangeError('startX must be between zero and mapWidth');
    }
    return config;
}

async function strategy(root, options = {}) {
    const config = configuration(options);
    const position = { x: config.startX, y: 0 };
    let patrol = 'right';

    function observe() {
        const state = root.perceive();
        const facing = BEARING[state.facing];
        if (!Number.isFinite(facing)) return null;
        let nearest = null;
        for (const target of state.targets ?? []) {
            if (!target || !(String(target.type).toLowerCase() === 'chicken'
                || /^chicken/i.test(target.name ?? ''))
                || target.caught || target.isCaught || target.captured
                || !Number.isFinite(target.distance) || target.distance < 0
                || !Number.isFinite(target.direction)) continue;
            if (nearest && nearest.distance <= target.distance) continue;
            // Live game bearings are clockwise offsets from the current facing.
            const angle = (facing + target.direction) * Math.PI / 180;
            nearest = {
                distance: target.distance,
                x: position.x + Math.cos(angle) * target.distance,
                y: position.y + Math.sin(angle) * target.distance
            };
        }
        return nearest;
    }

    async function move(actions, duration) {
        if (!root.isActive()) return 0;
        const dx = Number(actions.includes('right')) - Number(actions.includes('left'));
        const dy = Number(actions.includes('down')) - Number(actions.includes('up'));
        const length = Math.hypot(dx, dy) || 1;
        const vx = dx / length * config.speed / 1000;
        const vy = dy / length * config.speed / 1000;
        if (vx) {
            const available = vx > 0 ? config.mapWidth - position.x : position.x;
            duration = Math.min(duration, available / Math.abs(vx));
            if (available <= 0.01) {
                patrol = vx > 0 ? 'left' : 'right';
                return 0;
            }
        }
        await root.action(actions, duration);
        position.x = Math.max(0, Math.min(config.mapWidth, position.x + vx * duration));
        position.y += vy * duration;
        if (position.x >= config.mapWidth - 0.01) patrol = 'left';
        else if (position.x <= 0.01) patrol = 'right';
        if (root.isActive()) await root.wait(40);
        return Math.hypot(vx, vy) * duration;
    }

    async function scan() {
        let chicken = null;
        for (const direction of SCAN) {
            if (!root.isActive()) break;
            await move([direction], 20);
            const seen = observe();
            if (seen && (!chicken || seen.distance < chicken.distance)) chicken = seen;
        }
        return chicken;
    }

    async function chase(chicken) {
        // Re-scan if a chicken escapes or an obstacle prevents progress.
        for (let step = 0; step < 80 && root.isActive(); step++) {
            const seen = observe();
            if (seen) chicken = seen;
            const dx = chicken.x - position.x;
            const dy = chicken.y - position.y;
            const distance = Math.hypot(dx, dy);
            if (distance <= 24) {
                await root.action('catch', 60);
                if (root.isActive()) await root.wait(40);
                if (!observe()) return;
            } else {
                const heading = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
                const x = Math.round(Math.cos(heading * Math.PI / 4));
                const y = Math.round(Math.sin(heading * Math.PI / 4));
                const actions = [];
                if (x) actions.push(x > 0 ? 'right' : 'left');
                if (y) actions.push(y > 0 ? 'down' : 'up');
                if (distance <= 48) actions.push('catch');
                const duration = Math.min(60, (distance - 12) / config.speed * 1000);
                if (await move(actions, duration) === 0) return;
            }
        }
    }

    while (root.isActive()) {
        const chicken = await scan();
        if (!root.isActive()) return;
        if (chicken) {
            await chase(chicken);
            continue;
        }
        let remaining = 60;
        while (remaining > 0.01 && root.isActive()) {
            const direction = patrol;
            const moved = await move([direction],
                Math.min(40, remaining / config.speed * 1000));
            remaining -= moved;
            const seen = observe();
            if (seen) {
                await chase(seen);
                break;
            }
            if (direction !== patrol || moved === 0) break;
        }
    }
}

async function main() {
    const mapWidth = Number(process.env.MAP_WIDTH ?? DEFAULTS.mapWidth);
    const options = configuration({
        mapWidth,
        speed: Number(process.env.PLAYER_SPEED ?? DEFAULTS.speed),
        startX: Number(process.env.PLAYER_START_X ?? mapWidth / 2)
    });
    console.log(`[strategy] Estimated movement: ${options.speed} px/s; `
        + `map width ${options.mapWidth} px; starting X ${options.startX} px.`);
    const { run } = require('runningroot.js');
    await run(root => strategy(root, options));
}

module.exports = { strategy, main };

if (require.main === module) {
    main().catch(error => {
        console.error('[strategy]', error);
        process.exitCode = 1;
    });
}
