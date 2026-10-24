import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleFieldScrollTop } from './checkout-viewport.mjs';

test('keyboard shrinking the viewport reveals the active phone without another focus event', () => {
    const top = visibleFieldScrollTop({ scrollTop: 0, scrollHeight: 800, viewportTop: 100, viewportBottom: 260, fieldTop: 300, fieldBottom: 400, controlTop: 330, controlBottom: 380 });
    assert.equal(top, 152);
    assert.ok(380 - top < 260);
});

test('returning to an earlier field reveals its label and preserves a visible field position', () => {
    assert.equal(visibleFieldScrollTop({ scrollTop: 300, scrollHeight: 800, viewportTop: 120, viewportBottom: 320, fieldTop: 80, fieldBottom: 170, controlTop: 110, controlBottom: 158 }), 248);
    assert.equal(visibleFieldScrollTop({ scrollTop: 100, scrollHeight: 800, viewportTop: 100, viewportBottom: 300, fieldTop: 150, fieldBottom: 220, controlTop: 172, controlBottom: 220 }), 100);
});

test('long validation copy prioritizes the control when the complete field will not fit', () => {
    assert.equal(visibleFieldScrollTop({ scrollTop: 100, scrollHeight: 800, viewportTop: 100, viewportBottom: 200, fieldTop: 120, fieldBottom: 250, controlTop: 140, controlBottom: 188 }), 100);
});

test('focus scrolling stays within the scroll region bounds', () => {
    assert.equal(visibleFieldScrollTop({ scrollTop: 0, scrollHeight: 300, viewportTop: 0, viewportBottom: 200, fieldTop: -30, fieldBottom: 50, controlTop: 0, controlBottom: 48 }), 0);
    assert.equal(visibleFieldScrollTop({ scrollTop: 100, scrollHeight: 300, viewportTop: 0, viewportBottom: 200, fieldTop: 250, fieldBottom: 350, controlTop: 280, controlBottom: 328 }), 100);
});
