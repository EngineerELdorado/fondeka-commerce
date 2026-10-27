import test from 'node:test';
import assert from 'node:assert/strict';
import { storeOffersTraining } from './store-training.mjs';

const physical = { id: 1, type: 'PHYSICAL' };
const training = { id: 2, type: 'TRAINING' };

test('loaded public training or a complete non-training catalog needs no discovery request', async () => {
    const readPage = () => assert.fail('Catalog must not be fetched again');
    assert.equal(await storeOffersTraining({ initialPage: { content: [physical, training], last: false }, readPage }), true);
    assert.equal(await storeOffersTraining({ initialPage: { content: [physical], number: 0, last: true }, readPage }), false);
    assert.equal(await storeOffersTraining({ initialPage: { content: [], totalPages: 0 }, readPage }), false);
    assert.equal(await storeOffersTraining({ initialPage: [physical], readPage }), false);
});

test('training after the first twenty products is found through documented public pagination', async () => {
    const calls = [];
    const result = await storeOffersTraining({
        initialPage: { content: Array(20).fill(physical), number: 0, last: false, totalPages: 6 },
        readPage: async (number, size) => {
            calls.push({ number, size });
            return { content: number === 0 ? Array(100).fill(physical) : [training], number, totalPages: 2, last: number === 1 };
        },
    });
    assert.equal(result, true);
    assert.deepEqual(calls, [{ number: 0, size: 100 }, { number: 1, size: 100 }]);
});

test('a non-training product detail does not establish that its store has no trainings', async () => {
    const calls = [];
    assert.equal(await storeOffersTraining({ readPage: async (number, size) => {
        calls.push({ number, size });
        return { content: [physical, training], number, last: true };
    } }), true);
    assert.deepEqual(calls, [{ number: 0, size: 100 }]);
});

test('discovery stops at the final page of a store without trainings', async () => {
    const calls = [];
    assert.equal(await storeOffersTraining({ readPage: async number => {
        calls.push(number);
        return { content: [physical], number, last: number === 1 };
    } }), false);
    assert.deepEqual(calls, [0, 1]);
});

test('an aborted or failed discovery never probes more pages', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(storeOffersTraining({ signal: cancelled.signal, readPage: () => assert.fail() }), { name: 'AbortError' });
    let calls = 0;
    const failure = Object.assign(new Error('Unavailable catalog'), { status: 404 });
    await assert.rejects(storeOffersTraining({ readPage: async () => { calls += 1; throw failure; } }), failure);
    assert.equal(calls, 1);

    const task = new AbortController();
    calls = 0;
    await assert.rejects(storeOffersTraining({ signal: task.signal, readPage: async () => {
        calls += 1;
        task.abort();
        return { content: [physical], last: false };
    } }), { name: 'AbortError' });
    assert.equal(calls, 1);
});

test('malformed or repeated page responses cannot cause an endless scan', async () => {
    await assert.rejects(storeOffersTraining({ readPage: async () => ({}) }), /Invalid public catalog/);
    await assert.rejects(storeOffersTraining({ readPage: async () => ({ content: [], last: false }) }), /Invalid public catalog pagination/);
    const calls = [];
    await assert.rejects(storeOffersTraining({ readPage: async number => {
        calls.push(number);
        return { content: [physical], number: 0, last: false };
    } }), /Invalid public catalog pagination/);
    assert.deepEqual(calls, [0, 1]);
});
