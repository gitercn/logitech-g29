'use strict'

// Hardware-free tests (see fake.js) for forceDamper, forceSpring, forceOff and the
// slot bookkeeping. The byte layouts are the ones measured on a G29 with
// scripts/hw-probe.mjs in the ProtoPie plugin.

const test = require('node:test')
const assert = require('node:assert/strict')
const { g, connect, take } = require('./fake')

const stop = (first) => [first, 0, 0, 0, 0, 0, 0]

// Every test starts with all slots stopped, so the first report is a start (0x_1).
const fresh = () => {
    g.forceOff()
    take()
}

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

test('forceFriction, the old name of forceDamper, still sends the 8 step damper', () => {
    fresh()
    g.forceFriction(1)
    g.forceFriction(0.5)
    g.forceFriction()

    assert.deepEqual(take(), [
        [0x21, 0x02, 7, 0, 7, 0, 0],
        [0x2c, 0x02, 4, 0, 4, 0, 0],
        stop(0x23)
    ])
})

test('forceDamper accepts every forceFriction call', () => {
    fresh()
    g.forceDamper(1)
    g.forceDamper(0.5)
    g.forceDamper()

    assert.deepEqual(take(), [
        [0x21, 0x0c, 15, 0, 15, 0, 0xff],
        [0x2c, 0x0c, 8, 0, 8, 0, 0xff],
        stop(0x23)
    ])
})

test('updates refresh the running effect and repeats are not sent', () => {
    fresh()
    g.forceConstant(0.7)
    g.forceConstant(0.7)
    g.forceConstant(0.8)
    g.forceSpring([0.5])
    g.forceSpring([0.5])
    g.forceSpring([0.625])

    assert.deepEqual(take(), [
        [0x11, 0x00, 77, 0, 0, 0, 0],
        [0x1c, 0x00, 51, 0, 0, 0, 0],
        [0x41, 0x0b, 0x80, 0x80, 0xff, 0, 0xff],
        [0x4c, 0x0b, 0xa0, 0xa0, 0xff, 0, 0xff]
    ])
})

test('a stopped slot, a new effect type or a report sent by hand starts again', () => {
    fresh()
    g.forceSpring([0.5])
    g.forceOff(3)
    g.forceSpring([0.5])
    g.forceFriction(1)
    g.forceDamper(1)
    g.relayOS([0x41, 0x0b, 0xa0, 0xa0, 0xff, 0, 0xff])
    g.forceSpring([0.5])

    assert.deepEqual(take(), [
        [0x41, 0x0b, 0x80, 0x80, 0xff, 0, 0xff],
        stop(0x43),
        [0x41, 0x0b, 0x80, 0x80, 0xff, 0, 0xff],
        [0x21, 0x02, 7, 0, 7, 0, 0],
        [0x21, 0x0c, 15, 0, 15, 0, 0xff],
        [0x41, 0x0b, 0xa0, 0xa0, 0xff, 0, 0xff],
        [0x41, 0x0b, 0x80, 0x80, 0xff, 0, 0xff]
    ])
})

test('reports that are not slot effects leave the bookkeeping alone', () => {
    fresh()
    g.forceSpring([0.5])
    g.leds('11111')
    g.autocenter(false)
    g.forceSpring([0.5])

    const reports = take()

    assert.deepEqual(reports[0], [0x41, 0x0b, 0x80, 0x80, 0xff, 0, 0xff])
    assert.equal(reports.filter((r) => r[0] === 0x41 || r[0] === 0x4c).length, 1)
})

test('damperReports uses the 16 step damper in slot 2', () => {
    assert.deepEqual(g.damperReports(1), [[0x21, 0x0c, 0x0f, 0, 0x0f, 0, 0xff]])
    assert.deepEqual(g.damperReports(0.53), [[0x21, 0x0c, 0x08, 0, 0x08, 0, 0xff]])
    assert.deepEqual(g.damperReports([1, 0.0625]), [[0x21, 0x0c, 0x0f, 0, 0x0f, 0, 0x10]])
    assert.deepEqual(g.damperReports({ strength: 0.5, max: 0.25 }), [[0x21, 0x0c, 0x08, 0, 0x08, 0, 0x40]])
    assert.deepEqual(g.damperReports({ strength: 2 }), [[0x21, 0x0c, 0x0f, 0, 0x0f, 0, 0xff]])
})

test('damperReports sets each turning direction and negative values assist', () => {
    // K1 / S1 act while turning left, K2 / S2 while turning right
    assert.deepEqual(g.damperReports({ left: 1, right: 0 }), [[0x21, 0x0c, 15, 0, 0, 0, 0xff]])
    assert.deepEqual(g.damperReports({ right: 1, left: 0 }), [[0x21, 0x0c, 0, 0, 15, 0, 0xff]])
    assert.deepEqual(g.damperReports(-0.5), [[0x21, 0x0c, 8, 1, 8, 1, 0xff]])
    assert.deepEqual(g.damperReports([-1, 0.25]), [[0x21, 0x0c, 15, 1, 15, 1, 0x40]])
    assert.deepEqual(g.damperReports({ left: -1, right: 0.5, max: 0.5 }), [[0x21, 0x0c, 15, 1, 8, 0, 0x80]])
    assert.deepEqual(g.damperReports({ strength: -2 }), [[0x21, 0x0c, 15, 1, 15, 1, 0xff]])
})

test('damperReports turns slot 2 off for 0, false or nothing', () => {
    for (const setting of [0, false, undefined, [0, 1], { left: 0, right: 0 }]) {
        assert.deepEqual(g.damperReports(setting), [stop(0x23)], JSON.stringify(setting))
    }
})

test('damperReports rejects settings it cannot read', () => {
    // object fields fall back to their default instead, like autocenter's
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

test('springReports sets each side, and a side at 0 has no spring at all', () => {
    // left stiffness in the low nibble; a side at 0 moves its edge to the end, since
    // stiffness 0 alone still pulls a little on a G29
    assert.deepEqual(
        g.springReports({ center: 0.5, left: 1, right: 0 }),
        [[0x41, 0x0b, 0x80, 0xff, 0x0f, 0xe0, 0xff]]
    )
    assert.deepEqual(
        g.springReports({ center: 0.5, left: 0, right: 1 }),
        [[0x41, 0x0b, 0x00, 0x80, 0xf0, 0x00, 0xff]]
    )
    assert.deepEqual(
        g.springReports({ center: 0.5, stiffness: 0.5, right: 1 }),
        [[0x41, 0x0b, 0x80, 0x80, 0xf8, 0, 0xff]]
    )
    assert.deepEqual(g.springReports({ center: 0.5, left: 0, right: 0 }), [stop(0x43)])
    assert.deepEqual(g.springReports([0.5, 0]), [stop(0x43)])
})

test('a negative stiffness inverts the whole spring with bit 0 only', () => {
    // on a G29 either bit inverts both sides, so only bit 0 is ever set
    assert.deepEqual(g.springReports([0.5, -1, 0.3]), [[0x41, 0x0b, 0x80, 0x80, 0xff, 0x01, 0x4d]])
    assert.deepEqual(
        g.springReports({ center: 0.5, stiffness: -0.5, right: 1 }),
        [[0x41, 0x0b, 0x80, 0x80, 0xf8, 0x01, 0xff]]
    )
})

test('springReports turns slot 3 off and rejects what it cannot read', () => {
    assert.deepEqual(g.springReports(false), [stop(0x43)])
    assert.deepEqual(g.springReports(), [stop(0x43)])

    // a bare number is refused so that 0 cannot mean "spring at the left end"
    for (const setting of [0, 0.5, true, null, 'x', [], [0.5, 1, 1, 0, 1], ['x'], {}, { center: '' }, [0.5, 'x']]) {
        assert.equal(g.springReports(setting), null, JSON.stringify(setting))
    }
})

test('forceDamper and forceSpring send their reports and report bad input', () => {
    fresh()
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
