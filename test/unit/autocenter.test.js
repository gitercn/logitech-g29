'use strict'

// Hardware-free tests (see fake.js), run with `npm run test:unit` (Node 18+).

const test = require('node:test')
const assert = require('node:assert/strict')
const { g, connect, take } = require('./fake')

const ON = [0x14, 0, 0, 0, 0, 0, 0]
const OFF = [0xf5, 0, 0, 0, 0, 0, 0]
const spring = (left, right, force) => [0xfe, 0x0d, left, right, force, 0, 0, 0]

test('connect applies the default spring 07 07 ff and range 900', async () => {
    await connect()

    const reports = take()

    assert.deepEqual(reports.find((r) => r[0] === 0xf8 && r[1] === 0x81), [0xf8, 0x81, 0x84, 0x03, 0, 0, 0])
    assert.deepEqual(reports.filter((r) => r[0] === 0x14 || r[0] === 0xfe), [ON, spring(7, 7, 255)])
})

test('autocenterReports keeps the coefficient within 0x00 - 0x07', () => {
    assert.deepEqual(g.autocenterReports(true), [ON, spring(7, 7, 255)])
    assert.deepEqual(g.autocenterReports(false), [OFF])
    assert.deepEqual(g.autocenterReports([1, 1]), [ON, spring(7, 7, 255)])
    assert.deepEqual(g.autocenterReports([0.5, 0.5]), [ON, spring(4, 4, 128)])
    assert.deepEqual(g.autocenterReports([0, 0]), [ON, spring(0, 0, 0)])

    // values that used to produce 0x08 - 0x0f (which a G29 wraps around)
    for (const value of [0.53, 0.6, 0.8, 1]) {
        const coefficient = g.autocenterReports([value, 1])[1][2]
        assert.ok(coefficient <= 7, `${value} -> ${coefficient}`)
    }

    // out of range input is clamped instead of overflowing the byte
    assert.deepEqual(g.autocenterReports([2, -1]), [ON, spring(7, 7, 0)])
})

test('autocenterReports sets left and right separately', () => {
    assert.deepEqual(g.autocenterReports({ left: 1, right: 0, force: 1 }), [ON, spring(7, 0, 255)])
    assert.deepEqual(g.autocenterReports({ left: 0, right: 1 }), [ON, spring(0, 7, 255)])
    assert.deepEqual(g.autocenterReports({ force: 0.5 }), [ON, spring(7, 7, 128)])
})

test('autocenterReports rejects settings it cannot read', () => {
    for (const setting of [null, 'on', 3, [0.5], [0.5, 'x'], ['', 1]]) {
        assert.equal(g.autocenterReports(setting), null, JSON.stringify(setting))
    }
})

test('autocenter() writes immediately and does not touch the caller array', () => {
    const setting = [0.5, 1]

    assert.equal(g.autocenter(setting), true)
    assert.equal(g.autocenter(setting), true)

    // the old code scaled options.autocenter in place, so a second use multiplied again
    assert.deepEqual(setting, [0.5, 1])
    assert.deepEqual(take(), [ON, spring(4, 4, 255), ON, spring(4, 4, 255)])

    assert.equal(g.autocenter(false), true)
    assert.deepEqual(take(), [OFF])

    assert.equal(g.autocenter('nonsense'), false)
    assert.deepEqual(take(), [])
})

test('range() clamps to 40 - 900 and writes the range report', () => {
    assert.equal(g.range(540), true)
    assert.equal(g.range(10), true)
    assert.equal(g.range(2000), true)
    assert.equal(g.range('wide'), false)

    assert.deepEqual(take(), [
        [0xf8, 0x81, 0x1c, 0x02, 0, 0, 0],
        [0xf8, 0x81, 40, 0, 0, 0, 0],
        [0xf8, 0x81, 0x84, 0x03, 0, 0, 0]
    ])
})
