const { test } = require('node:test');
const assert = require('node:assert/strict');
const { strategy } = require('./strategy');

function fakeRoot(onAction) {
    let active = true;
    const state = { facing: 'down', targets: [], entities: {} };
    const actions = [];
    return {
        state,
        actions,
        stop() { active = false; },
        isActive() { return active; },
        perceive() { return structuredClone(state); },
        async wait() {},
        async action(requested, duration) {
            const keys = Array.isArray(requested) ? requested : [requested];
            actions.push({ keys, duration });
            for (const key of keys) {
                if (key !== 'catch') state.facing = key;
            }
            onAction?.(this, keys, duration);
            assert.ok(actions.length < 500, 'Strategy should make bounded progress');
        }
    };
}

test('scans in order, moves an estimated 60 px right, then repeats', async () => {
    const root = fakeRoot(root => {
        if (root.actions.length === 11) root.stop();
    });
    await strategy(root);
    assert.deepEqual(root.actions.slice(0, 5).map(action => action.keys[0]),
        ['up', 'right', 'down', 'left', 'up']);
    const patrol = root.actions.slice(5, 10);
    assert.ok(patrol.every(action => action.keys[0] === 'right'));
    assert.ok(Math.abs(patrol.reduce((sum, action) => sum + action.duration, 0)
        * 300 / 1000 - 60) < 0.001);
    assert.deepEqual(root.actions[10].keys, ['up']);
});

test('reverses the patrol at the configured right and left boundaries', async () => {
    let x = 36;
    let reachedRight = false;
    let reachedLeft = false;
    const root = fakeRoot((root, keys, duration) => {
        x += (Number(keys.includes('right')) - Number(keys.includes('left')))
            * 300 * duration / 1000;
        assert.ok(x >= -0.001 && x <= 72.001, 'Movement must stay inside the map');
        if (x >= 71.999) reachedRight = true;
        if (x <= 0.001) reachedLeft = true;
        if (root.actions.length === 36) root.stop();
    });
    await strategy(root, { mapWidth: 72, startX: 36 });
    const patrolActions = root.actions.filter(action => action.duration > 20);
    const directions = patrolActions.map(action => action.keys[0]);
    assert.ok(reachedRight && reachedLeft);
    const firstLeft = directions.indexOf('left');
    assert.ok(firstLeft > 0);
    assert.ok(directions.slice(firstLeft + 1).includes('right'));
});

test('remembers a chicken seen earlier in the scan and chases its relative bearing', async () => {
    const root = fakeRoot((root, keys) => {
        root.state.targets = root.actions.length === 1
            ? [{ type: 'chicken', name: 'Chicken', direction: 30, distance: 100 }]
            : [];
        if (keys.includes('catch')) root.stop();
    });
    await strategy(root);
    assert.deepEqual(root.actions.slice(0, 5).map(action => action.keys[0]),
        ['up', 'right', 'down', 'left', 'up']);
    assert.deepEqual(root.actions[5].keys, ['right', 'up']);
    assert.ok(root.actions.some(action => action.keys.includes('catch')));
});

test('ignores buildings, caught chickens and invalid target data', async () => {
    const root = fakeRoot(root => {
        root.state.targets = [
            { type: 'building', direction: 0, distance: 5 },
            { type: 'chicken', caught: true, direction: 0, distance: 5 },
            { type: 'chicken', direction: NaN, distance: 5 },
            { type: 'chicken', direction: 0, distance: -1 }
        ];
        if (root.actions.length === 6) root.stop();
    });
    await strategy(root);
    assert.deepEqual(root.actions[5].keys, ['right']);
});

test('updates chase direction from fresh sightings and stops on completion', async () => {
    const root = fakeRoot(root => {
        root.state.targets = [{ type: 'chicken', direction: 0, distance: 100 }];
        if (root.actions.length === 6) {
            root.state.facing = 'left';
            root.state.targets = [{ type: 'chicken', direction: 0, distance: 10 }];
        }
        if (root.actions.length === 7) root.stop();
    });
    await strategy(root);
    assert.deepEqual(root.actions[5].keys, ['up']);
    assert.deepEqual(root.actions[6].keys, ['catch']);
    assert.equal(root.actions.length, 7);
});

test('rejects invalid patrol configuration', async () => {
    const root = fakeRoot();
    await assert.rejects(strategy(root, { speed: 0 }), /speed/);
    await assert.rejects(strategy(root, { mapWidth: -1 }), /mapWidth/);
    await assert.rejects(strategy(root, { startX: 2000 }), /startX/);
    assert.equal(root.actions.length, 0);
});
