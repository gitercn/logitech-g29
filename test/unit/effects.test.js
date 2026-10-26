'use strict'

// Hardware-free tests (see fake.js) for forceDamper, forceSpring and forceOff.
// The expected bytes are the ones tried by hand on a G29 with relayOS.

const test = require('node:test')
const assert = require('node:assert/strict')
const { g, connect, take } = require('./fake')

const stop = (first) => [first, 0, 0, 0, 0, 0, 0]

test.before(async () => {
    await connect()
    take()
})

test('forceOff stops the right slot', () => {
    g.forceOff()
    g.forceOff(0)
    g.forceOff(1)
    g.forceOff(2)
    g.forceOff(3)
    g.forceOff(4)
    g.forceOff(9)

    // 3 used to become 0x30 (slots 1 and 2) and 4 became 0x40 (slot 3)
    assert.deepEqual(take(), [0xf3, 0xf3, 0x13, 0x23, 0x43, 0x83, 0xf3].map(stop))
})

test('forceConstant(0.5) and forceFriction(0) still stop their own slot', () => {
    g.forceConstant(0.5)
    g.forceFriction(0)

    assert.deepEqual(take(), [stop(0x13), stop(0x23)])
})

test('damperReports uses the 16 step damper in slot 2', () => {
    assert.deepEqual(g.damperReports(1), [[0x21, 0x0c, 0x0f, 0, 0x0f, 0, 0xff]])
    assert.deepEqual(g.damperReports(0.53), [[0x21, 0x0c, 0x08, 0, 0x08, 0, 0xff]])
    assert.deepEqual(g.damperReports([1, 0.0625]), [[0x21, 0x0c, 0x0f, 0, 0x0f, 0, 0x10]])
    assert.deepEqual(g.damperReports({ strength: 0.5, max: 0.25 }), [[0x21, 0x0c, 0x08, 0, 0x08, 0, 0x40]])
    assert.deepEqual(g.damperReports({ strength: 2 }), [[0x21, 0x0c, 0x0f, 0, 0x0f, 0, 0xff]])
})

test('damperReports turns slot 2 off for 0, false or nothing', () => {
    for (const setting of [0, false, undefined, [0, 1]]) {
        assert.deepEqual(g.damperReports(setting), [stop(0x23)], JSON.stringify(setting))
    }
})

test('damperReports rejects settings it cannot read', () => {
    for (const setting of [null, true, 'x', NaN, [1], [1, 'x'], ['', 1]]) {
        assert.equal(g.damperReports(setting), null, JSON.stringify(setting))
    }
})

test('springReports builds the position spring in slot 3', () => {
    // centered and offset springs as tried by hand
    assert.deepEqual(g.springReports([0.5, 1, 0.25]), [[0x41, 0x0b, 0x80, 0x80, 0xff, 0, 0x40]])
    assert.deepEqual(g.springReports([0.625]), [[0x41, 0x0b, 0xa0, 0xa0, 0xff, 0, 0xff]])
    assert.deepEqual(g.springReports({ center: 0.625 }), [[0x41, 0x0b, 0xa0, 0xa0, 0xff, 0, 0xff]])

    // stiffness goes to both nibbles; the ends of the range stay within 11 bits
    assert.deepEqual(g.springReports([0.5, 0.5]), [[0x41, 0x0b, 0x80, 0x80, 0x88, 0, 0xff]])
    assert.deepEqual(g.springReports([1]), [[0x41, 0x0b, 0xff, 0xff, 0xff, 0xee, 0xff]])
    assert.deepEqual(g.springReports([0]), [[0x41, 0x0b, 0, 0, 0xff, 0, 0xff]])
})

test('springReports puts the dead band edges around the center', () => {
    // 0.5 +- 0.05 -> positions 922 and 1126: high bits 0x73 / 0x8c, low bits 2 and 6
    assert.deepEqual(
        g.springReports({ center: 0.5, deadband: 0.1 }),
        [[0x41, 0x0b, 0x73, 0x8c, 0xff, (6 << 5) + (2 << 1), 0xff]]
    )
})

test('springReports turns slot 3 off and rejects what it cannot read', () => {
    assert.deepEqual(g.springReports(false), [stop(0x43)])
    assert.deepEqual(g.springReports(), [stop(0x43)])

    // a bare number is refused so that 0 cannot mean "spring at the left end"
    for (const setting of [0, 0.5, true, null, 'x', [], [0.5, 1, 1, 0, 1], ['x'], {}, { center: '' }]) {
        assert.equal(g.springReports(setting), null, JSON.stringify(setting))
    }
})

test('forceDamper and forceSpring send their reports and report bad input', () => {
    assert.equal(g.forceDamper(0.5), true)
    assert.equal(g.forceSpring([0.625]), true)
    assert.equal(g.forceSpring(false), true)
    assert.equal(g.forceDamper('x'), false)
    assert.equal(g.forceSpring(0), false)

    assert.deepEqual(take(), [
        [0x21, 0x0c, 0x08, 0, 0x08, 0, 0xff],
        [0x41, 0x0b, 0xa0, 0xa0, 0xff, 0, 0xff],
        stop(0x43)
    ])
})
