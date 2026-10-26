'use strict'

// Loads the library with node-hid replaced by a fake device that records every
// report written, so the unit tests run anywhere without a wheel.

const Module = require('module')
const { EventEmitter } = require('events')

const written = []

class FakeHID extends EventEmitter {
    read(callback) {
        // a 12 byte report means "already in high precision mode", so connect()
        // goes straight to listen() without the 8 second calibration wait
        setImmediate(() => callback(null, Buffer.alloc(12)))
    }

    write(data) {
        written.push(Array.from(data))
    }

    close() {}
}

const fakeHid = {
    HID: FakeHID,
    devices: () => [{ vendorId: 1133, productId: 49743, interface: 0, usagePage: 1, path: 'fake' }]
}

const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
    if (request === 'node-hid') return fakeHid
    return originalLoad.call(this, request, parent, isMain)
}

const g = require('../../code/index.js')

// relayOS prepends a 0x00 report id on Windows; compare without it everywhere.
const prepend = process.platform === 'win32'
const strip = (report) => (prepend ? report.slice(1) : report)

module.exports = {
    g,
    connect: () => new Promise((resolve, reject) => g.connect((err) => (err ? reject(err) : resolve()))),
    take: () => written.splice(0).map(strip)
}
