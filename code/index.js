'use strict'

//----------------
// Includes: Self
//----------------
const color   = require('./color.js')
const dataMap = require('./data-map.js')

//----------
// Includes
//----------
const events = require('events')
const hid = require('node-hid')
const os = require('os')

//-----------
// Variables
//-----------
const eventEmitter = new events.EventEmitter()
const options = {
    'autocenter': true,
    'debug': false,
    'range': 900
}
const platform = os.platform()

let dataPrev = Array(12)
let device = ''
let ledPrev = []
let memoryPrev = {
    'wheel': {
        'turn': 50,
        'shift_left': 0,
        'shift_right': 0,
        'dpad': 0,
        'button_x': 0,
        'button_square': 0,
        'button_triangle': 0,
        'button_circle': 0,
        'button_l2': 0,
        'button_r2': 0,
        'button_l3': 0,
        'button_r3': 0,
        'button_plus': 0,
        'button_minus': 0,
        'spinner': 0,
        'button_spinner': 0,
        'button_share': 0,
        'button_option': 0,
        'button_playstation': 0
    },
    'shifter': {
        'gear': 0
    },
    'pedals': {
        'gas'   : 0,
        'brake' : 0,
        'clutch': 0
    }
}
let prependWrite = false

// What the library last started in each effect slot (index 1 - 4): the six report
// bytes after the command byte, or null when the slot is stopped or unknown.
let slotState = [null, null, null, null, null]

//-------------
// OS Specific
//-------------
if (platform === 'win32' || platform === 'win64') {
    prependWrite = true
}

//-----------
// Functions
//-----------
function clone(obj) {
    /*
    Clone an object.
    @param   {Object}  obj  Object to clone.
    @return  {Object}
    */
    if (obj === null || typeof obj !== 'object') {
        return obj
    }

    const temp = obj.constructor()

    for (let key in obj) {
        temp[key] = clone(obj[key])
    }

    return temp
} // clone

function connect(odo, callback) { // Constable Odo takes many forms.
    /*
    Connect to a Logitech G29 wheel.
    @param   {Object, Function}  odo       Options object or callback function.
    @param   {Function}          callback  Callback function.
    */
    if (typeof odo === 'function') {
        callback = odo
    } else {
        userOptions(odo)
    }

    callback = (typeof callback === 'function') ? callback : function() {}

    resetSlots()
    device = new hid.HID(findWheel())

    device.read(function(err, data) {
        if (err) {
            if (options.debug) {
                console.log(color.red('connect -> Error reading from device.'), err)
            }
            callback(err)
        } else {
            forceOff()

            if (data.length === 12) {
                // wheel is already in high precision mode

                if (options.debug) {
                    console.log(color.cyan('connect -> Wheel already in high precision mode.'))
                }

                listen(true, callback)
            } else {
                // wheel is not in high precision mode

                if (options.debug) {
                    console.log(color.cyan('connect -> Initing'))
                }

                try {
                    // G29 Wheel init from - https://github.com/torvalds/linux/blob/master/drivers/hid/hid-lg4ff.c
                    relayOS([0xf8, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00])
                    relayOS([0xf8, 0x09, 0x05, 0x01, 0x01, 0x00, 0x00])

                    // wait for wheel to finish calibrating
                    setTimeout(function() {
                        listen(false, callback)
                    }, 8000)
                } catch(err) {
                    callback(err)
                }
            }
        }
    })

    forceConstant(1) // move the wheel to generate a read event
} // connect

function disconnect() {
    /*
    Disconnect in preparation to connect again or to allow other software to use the wheel.
    */
    device.close()
} // disconnect

function findWheel() {
    /*
    Return the USB location of a Logitech G29 wheel.
    @return  {String}  devicePath  USB path like: USB_046d_c294_fa120000
    */
    const devices = hid.devices()
    let devicePath = ''

    for (let i in devices) {
        // devices[i].vendorId seems to be the only completely reliable property on each OS.
        // devices[i].productId can not be trusted and can sometimes be wildly different.
        // devices[i].product should be set to 'G29 Driving Force Racing Wheel'.
        // devices[i].interface should be 0 on Windows and Linux.
        // devices[i].usagePage should be 1 on Windows and Mac.
        if (devices[i].vendorId === 1133 &&
            (devices[i].productId === 49743 || devices[i].product === 'G29 Driving Force Racing Wheel') &&
            (devices[i].interface === 0 || devices[i].usagePage === 1)) {
            devicePath = devices[i].path
            break
        }
    }

    if (devicePath === '') {
        if (options.debug) {
            console.log(color.yellow('findWheel -> Oops, could not find a G29 Wheel. Is it plugged in?\n'))
            process.exit()
        }
    } else if (options.debug) {
        console.log(color.cyan('findWheel -> Found G29 Wheel at ') + devicePath)
    }

    return devicePath
} // findWheel

function on(str, func) {
    return eventEmitter.on(str, func)
} // on

function once(str, func) {
    return eventEmitter.once(str, func)
} // once

function relay(data) {
    /*
    Relay low level commands directly to the hardware.
    @param  {Object}  data  Array of data to write. For example: [0x00, 0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01]
    */
    if (Array.isArray(data)) {
        device.write(data)
    }
} // relay

function relayOS(data) {
    /*
    Relay low level commands directly to the hardware after applying OS specific tweaks, if needed.
    @param  {Object}  data  Array of data to write. For example: [0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01]
    */
    forgetSlots(data)

    if (prependWrite) {
        data.unshift(0x00)
    }

    device.write(data)
}

function setRange() {
    /*
    Set wheel range.
    */
    if (options.range < 40) {
        options.range = 40
    }

    if (options.range > 900) {
        options.range = 900
    }

    const range1 = options.range & 0x00ff
    const range2 = (options.range & 0xff00) >> 8

    relayOS([0xf8, 0x81, range1, range2, 0x00, 0x00, 0x00])
} // setRange

function userOptions(opt) {
    /*
    Set user options.
    @param  {Object}  opt   Options object originally passed into the connect function.
    */
    if (typeof opt !== 'object') return;

    for (let i in options) {
        if (opt.hasOwnProperty(i)) {
            options[i] = opt[i]
        }
    }

    if (options.debug) {
        console.log(color.cyan('userOptions -> '), options)
    }
} // userOptions

//----------------
// Function: LEDs
//----------------
function leds(setting) {
    /*
    Control the shift indicator LEDs using a variety of convenience methods.
    @param  {*}  setting  String, Number, or Array setting. Optional. See API documentation for more info.
    */

    // no setting
    if (typeof setting === 'undefined') {
        setting = []
    }

    // percent based settings
    if (typeof setting === 'number') {
        setting = Math.round(setting * 100)

        if (setting > 84) {
            setting = '11111'
        } else if (setting > 69) {
            setting = '1111'
        } else if (setting > 39) {
            setting = '111'
        } else if (setting > 19) {
            setting = '11'
        } else if (setting > 4) {
            setting = '1'
        } else {
            setting = ''
        }
    }

    // string based settings
    if (typeof setting === 'string') {
        setting = setting.split('')
    }

    // array based settings
    if (Array.isArray(setting)) {
        if (ledPrev === setting) {
            return
        }

        const ledValues = [1, 2, 4, 8, 16]

        const ledArray = setting

        // remove any extra elements
        ledArray.splice(5, ledArray.length - 5)

        const len = ledArray.length

        setting = 0

        for (let i = 0; i < len; i++) {
            if (parseInt(ledArray[i]) === 1) {
                setting = setting + ledValues[i]
            }
        }

        /*
        Setting should be a number from 0 to 31

            From outside in, mirrored on each side.

            0 = No LEDs
            1 = Green One
            2 = Green Two
            4 = Orange One
            8 = Orange Two
            16 = Red

            31 = All LEDs
        */

        try {
            relayOS([0xf8, 0x12, setting, 0x00, 0x00, 0x00, 0x01])

            // update global variable for next time
            ledPrev = setting
        } catch(err) {
            // do nothing
        }
    }
} // leds

//------------------
// Functions: Force
//------------------
function unit(value, fallback) {
    /*
    Clamp a 0 - 1 setting. Anything that is not a finite number becomes the fallback.
    @param   {*}       value     Candidate value.
    @param   {Number}  fallback  Value to use when the candidate is not a finite number.
    @return  {Number}
    */
    const number = (typeof value === 'number') ? value : Number(value)

    if (value === null || value === '' || !Number.isFinite(number)) {
        return fallback
    }

    return Math.min(1, Math.max(0, number))
} // unit

function autocenterReports(setting) {
    /*
    Build the HID reports for an auto-centering setting without sending them.
    @param   {*}  setting  true, false, [stiffness, force] or {left, right, force}. See API documentation.
    @return  {Array}       Array of reports to send in order, or null when the setting is not understood.

    The spring report is 0xfe 0x0d LEFT RIGHT FORCE 0x00 0x00:
        LEFT   spring coefficient while the wheel is left of center, 0x00 to 0x07
        RIGHT  spring coefficient while the wheel is right of center, 0x00 to 0x07
        FORCE  force level, 0x00 to 0xff

    Only the MOMO / MOMO2 wheels accept coefficients up to 0x0f. A G29 ignores the
    high bit, so 0x08 to 0x0f wrap around to 0x00 to 0x07 (0x08 feels like no spring).
    The Linux driver fixed the same mistake in "HID:hid-lg4ff: Correct Auto-center
    strength for wheels other than MOMO and MOMO2", and earlier versions of this
    library scaled the coefficient to 0x0f, which made values above 0.5 weaker.

    0x14 turns auto-centering on with the most recent spring report; 0xf5 turns it off.
    */
    const on = [0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    const off = [0xf5, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]

    let left
    let right
    let force

    if (setting === true) {
        // default profile, the strongest spring a G29 accepts
        left = 1
        right = 1
        force = 1
    } else if (setting === false || setting === 0) {
        return [off]
    } else if (Array.isArray(setting) && setting.length === 2) {
        left = unit(setting[0], NaN)
        right = left
        force = unit(setting[1], NaN)
    } else if (setting !== null && typeof setting === 'object' && !Array.isArray(setting)) {
        left = unit(setting.left, 1)
        right = unit(setting.right, 1)
        force = unit(setting.force, 1)
    } else {
        return null
    }

    if (Number.isNaN(left) || Number.isNaN(force)) {
        return null
    }

    const spring = [
        0xfe,
        0x0d,
        Math.round(left * 7),
        Math.round(right * 7),
        Math.round(force * 255),
        0x00,
        0x00,
        0x00
    ]

    return [on, spring]
} // autocenterReports

function autoCenter() {
    /*
    Set wheel autocentering based on existing options.
    */
    const reports = autocenterReports(options.autocenter)

    if (reports === null) {
        if (options.debug) {
            console.log(color.yellow('autoCenter -> Ignoring unknown setting'), options.autocenter)
        }
        return
    }

    for (const report of reports) {
        relayOS(report)
    }
} // autoCenter

function autocenter(setting) {
    /*
    Change auto-centering while connected. The setting is remembered for the next connect.
    @param   {*}        setting  true, false, [stiffness, force] or {left, right, force}. See API documentation.
    @return  {Boolean}           False when the setting was not understood and nothing was sent.
    */
    if (typeof setting === 'undefined') {
        setting = true
    }

    if (autocenterReports(setting) === null) {
        if (options.debug) {
            console.log(color.yellow('autocenter -> Ignoring unknown setting'), setting)
        }
        return false
    }

    // keep a copy so later changes to the caller's array or object have no effect
    options.autocenter = (setting !== null && typeof setting === 'object')
        ? JSON.parse(JSON.stringify(setting))
        : setting

    autoCenter()

    return true
} // autocenter

function range(degrees) {
    /*
    Change the wheel range while connected. The setting is remembered for the next connect.
    @param   {Number}   degrees  40 to 900. Values outside are clamped.
    @return  {Boolean}           False when degrees is not a number and nothing was sent.
    */
    const number = Number(degrees)

    if (degrees === null || degrees === '' || !Number.isFinite(number)) {
        return false
    }

    options.range = Math.round(number)
    setRange()

    return true
} // range

function resetSlots() {
    // Nothing is known to be playing, e.g. on connect.
    slotState = [null, null, null, null, null]
} // resetSlots

function forgetSlots(data) {
    /*
    Forget the state of every slot a report touches, so a report sent by hand with
    relayOS (or a stop) makes the next library call start its effect again.
    @param  {Array}  data  Report about to be written, without the Windows report id.
    */
    const op = data[0] & 0x0f
    const mask = data[0] >> 4

    // 0x_0 / 0x_1 / 0x_2 / 0x_3 / 0x_c act on effect slots; 0xf8, 0xfe, 0x14, 0xf5 do not
    if (![0x00, 0x01, 0x02, 0x03, 0x0c].includes(op)) {
        return
    }

    for (let slot = 1; slot <= 4; slot++) {
        if (mask & (1 << (slot - 1))) {
            slotState[slot] = null
        }
    }
} // forgetSlots

function playSlot(slot, body) {
    /*
    Start or update the effect in one slot the way the Linux driver does: the first
    report starts it (0x_1), later ones with the same effect type only refresh its
    parameters (0x_c), and a report identical to the last one is not sent at all.
    Restarting and refreshing measured the same on a G29; skipping repeats saves USB
    traffic when an app streams the same value.
    @param  {Number}  slot  1 to 4.
    @param  {Array}   body  The six bytes after the command byte: effect type, then parameters.
    */
    const last = slotState[slot]

    if (last !== null && last.every((byte, i) => byte === body[i])) {
        return
    }

    const op = (last === null || last[0] !== body[0]) ? 0x01 : 0x0c

    relayOS([(0x10 << (slot - 1)) + op].concat(body))
    slotState[slot] = body.slice()
} // playSlot

function forceConstant(number) {
    /*
    Set or disable a constant force effect.
    @param  {Number}  number  Number between 0 and 1. Optional.
    */
    if (typeof number === 'undefined') number = 0.5

    if (number === 0.5) {
        forceOff(1)
        return
    }

    number = Math.round(Math.abs(number - 1) * 255)

    playSlot(1, [0x00, number, 0x00, 0x00, 0x00, 0x00])
} // forceConstant

function forceFriction(number) {
    /*
    Old name for forceDamper, kept so existing code feels exactly the same.
    Set or disable a damper: resistance that grows with how fast the wheel turns.
    @param  {Number}  number  Number between 0 and 1. Optional.
    @deprecated  Use forceDamper(number), which takes the same 0 - 1 value with 16 steps instead of 8.
    */
    if (typeof number === 'undefined') number = 0

    if (number === 0) {
        forceOff(2)
        return
    }

    // sending manual relay() commands to the hardware seems to reveal a 0x00 through 0x07 range
    // 0x07 is the strongest friction and then 0x08 is no friction
    // friction ramps up again from 0x08 to 0x0F
    number = Math.round(number * 7)

    // Effect type 0x02 is the low resolution damper: resistance grows with how fast the
    // wheel turns. Despite the name this is not friction (confirmed on a G29). Step K
    // here measured about as strong as step 2K + 1 of forceDamper, so 7 matches 15.
    // the first "number" is for left rotation, the second for right rotation
    playSlot(2, [0x02, number, 0x00, number, 0x00, 0x00])
} // forceFriction

function signedUnit(value, fallback) {
    /*
    Clamp a -1 - 1 setting. Anything that is not a finite number becomes the fallback.
    @param   {*}       value     Candidate value.
    @param   {Number}  fallback  Value to use when the candidate is not a finite number.
    @return  {Number}
    */
    const number = (typeof value === 'number') ? value : Number(value)

    if (value === null || value === '' || typeof value === 'boolean' || !Number.isFinite(number)) {
        return fallback
    }

    return Math.min(1, Math.max(-1, number))
} // signedUnit

function damperReports(setting) {
    /*
    Build the HID reports for a damper setting without sending them.
    @param   {*}  setting  Number, [strength, max] or {strength, left, right, max}. See API documentation.
    @return  {Array}       Array of reports to send in order, or null when the setting is not understood.

    The damper report is 0x21 0x0c K1 S1 K2 S2 MAX in slot 2 (shared with forceFriction):
        K1, S1  while the wheel turns left: coefficient 0x00 to 0x0f (16 steps, no wrap
                around) and 0x00 to resist the movement or 0x01 to push along with it
        K2, S2  the same while the wheel turns right
        MAX     force limit, 0x00 to 0xff
    All of this was measured on a G29 (scripts/hw-probe.mjs in the ProtoPie plugin).
    */
    let left
    let right
    let max

    if (typeof setting === 'undefined' || setting === false) {
        return [forceOffReport(2)]
    } else if (typeof setting === 'number') {
        left = signedUnit(setting, NaN)
        right = left
        max = 1
    } else if (Array.isArray(setting) && setting.length === 2) {
        left = signedUnit(setting[0], NaN)
        right = left
        max = unit(setting[1], NaN)
    } else if (setting !== null && typeof setting === 'object' && !Array.isArray(setting)) {
        const strength = signedUnit(setting.strength, 1)

        left = signedUnit(setting.left, strength)
        right = signedUnit(setting.right, strength)
        max = unit(setting.max, 1)
    } else {
        return null
    }

    if ([left, right, max].some(Number.isNaN)) {
        return null
    }

    if (left === 0 && right === 0) {
        return [forceOffReport(2)]
    }

    return [[
        0x21,
        0x0c,
        Math.round(Math.abs(left) * 15),
        left < 0 ? 0x01 : 0x00,
        Math.round(Math.abs(right) * 15),
        right < 0 ? 0x01 : 0x00,
        Math.round(max * 255)
    ]]
} // damperReports

function forceDamper(setting) {
    /*
    Set or disable a damper: resistance that grows with how fast the wheel turns. The
    new name of forceFriction, with 16 steps, a force limit, a value per direction and
    negative values that push along with the wheel instead. Both use slot 2, so the
    most recent call wins.
    @param   {*}        setting  Number between -1 and 1, [strength, max] or {strength, left, right, max}. Optional.
    @return  {Boolean}           False when the setting was not understood and nothing was sent.
    */
    return relayReports('forceDamper', 2, damperReports(setting), setting)
} // forceDamper

function springPosition(value) {
    // 0 - 1 across the current wheel range to the 11 bit position the spring report uses
    return Math.min(2047, Math.max(0, Math.round(value * 2048)))
} // springPosition

function springReports(setting) {
    /*
    Build the HID reports for a position spring without sending them.
    @param   {*}  setting  false, [center, stiffness, max, deadband] or {center, stiffness, left, right, max, deadband}. See API documentation.
    @return  {Array}       Array of reports to send in order, or null when the setting is not understood.

    The spring report is 0x41 0x0b D1 D2 K S MAX in slot 3:
        D1, D2  upper 8 bits of the 11 bit dead band edges (0 - 2047 across the current range)
        K       stiffness, right side in the upper 4 bits and left side in the lower 4 bits
        S       lower 3 bits of D1 (bits 1 - 3) and D2 (bits 5 - 7); bit 0 inverts the spring
        MAX     force limit, 0x00 to 0xff
    Measured on a G29 (scripts/hw-probe.mjs in the ProtoPie plugin):
      - stiffness 0 is still a weak spring, so a side set to 0 gets its edge moved to the
        end of the range instead, which leaves no spring on that side at all
      - bit 0 and bit 4 each invert BOTH sides (the spring pushes away from the center),
        so only bit 0 is used and only for the whole spring
    */
    let center
    let stiffness
    let left
    let right
    let max
    let deadband

    if (typeof setting === 'undefined' || setting === false) {
        return [forceOffReport(3)]
    } else if (Array.isArray(setting) && setting.length >= 1 && setting.length <= 4) {
        center = unit(setting[0], NaN)
        stiffness = setting.length > 1 ? signedUnit(setting[1], NaN) : 1
        left = Math.abs(stiffness)
        right = left
        max = setting.length > 2 ? unit(setting[2], NaN) : 1
        deadband = setting.length > 3 ? unit(setting[3], NaN) : 0
    } else if (setting !== null && typeof setting === 'object' && !Array.isArray(setting)) {
        center = unit(setting.center, NaN)
        stiffness = signedUnit(setting.stiffness, 1)
        left = unit(setting.left, Math.abs(stiffness))
        right = unit(setting.right, Math.abs(stiffness))
        max = unit(setting.max, 1)
        deadband = unit(setting.deadband, 0)
    } else {
        return null
    }

    if ([center, stiffness, left, right, max, deadband].some(Number.isNaN)) {
        return null
    }

    if (left === 0 && right === 0) {
        return [forceOffReport(3)]
    }

    const d1 = left === 0 ? 0 : springPosition(center - deadband / 2)
    const d2 = right === 0 ? 2047 : springPosition(center + deadband / 2)
    const kLeft = Math.round(left * 15)
    const kRight = Math.round(right * 15)

    return [[
        0x41,
        0x0b,
        d1 >> 3,
        d2 >> 3,
        (kRight << 4) + kLeft,
        ((d2 & 7) << 5) + ((d1 & 7) << 1) + (stiffness < 0 ? 0x01 : 0x00),
        Math.round(max * 255)
    ]]
} // springReports

function forceSpring(setting) {
    /*
    Set or disable a position spring that pulls the wheel toward a chosen position.
    Unlike auto-centering, the center can be anywhere and can have a dead band, each
    side can be set apart, and a negative stiffness pushes away from the center.
    @param   {*}        setting  false, [center, stiffness, max, deadband] or {center, stiffness, left, right, max, deadband}. Optional.
    @return  {Boolean}           False when the setting was not understood and nothing was sent.
    */
    return relayReports('forceSpring', 3, springReports(setting), setting)
} // forceSpring

function relayReports(name, slot, reports, setting) {
    /*
    Send reports built by one of the *Reports functions. A start report goes through
    playSlot, so updates become refreshes and repeats are skipped.
    @param   {String}   name      Function name for the debug message.
    @param   {Number}   slot      Effect slot the reports belong to.
    @param   {Array}    reports   Reports to send in order, or null.
    @param   {*}        setting   Original setting for the debug message.
    @return  {Boolean}            False when reports is null and nothing was sent.
    */
    if (reports === null) {
        if (options.debug) {
            console.log(color.yellow(name + ' -> Ignoring unknown setting'), setting)
        }
        return false
    }

    for (const report of reports) {
        if ((report[0] & 0x0f) === 0x01) {
            playSlot(slot, report.slice(1))
        } else {
            relayOS(report)
        }
    }

    return true
} // relayReports

function forceOffReport(slot) {
    /*
    Build the report that stops one effect slot, or every slot.
    @param   {Number}  slot  1 to 4 for one slot, anything else for every slot.
    @return  {Array}

    The upper 4 bits of the first byte select slots as a bit mask (slot 1 = 0x10,
    slot 2 = 0x20, slot 3 = 0x40, slot 4 = 0x80) and the lower 4 bits are the
    operation, 0x03 = stop. Earlier versions built 0x30 for slot 3 (slots 1 and 2)
    and 0x40 for slot 4 (slot 3).
    */
    const mask = (Number.isInteger(slot) && slot >= 1 && slot <= 4) ? (0x10 << (slot - 1)) : 0xf0

    return [mask + 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
} // forceOffReport

function forceOff(slot) {
    /*
    Turn off all force effects except auto-centering.
    @param  {Number}  slot  Number between 0 and 4. Optional.
    */
    // Great info at http://wiibrew.org/wiki/Logitech_USB_steering_wheel, especially about writing to more than one effect slot.
    // Slot 1 forceConstant, slot 2 forceFriction / forceDamper, slot 3 forceSpring, slot 4 unused.

    // turn off effects (except for auto-center)
    relayOS(forceOffReport(slot))
} // forceOff

//------------------
// Function: Listen
//------------------
function listen(ready, callback) {
    /*
    @param  {Boolean}   ready     True if the wheel is ready for commands. Optional.
    @param  {Function}  callback  Optional callback function.
    */
    if (!ready) {
        device.close()
        device = new hid.HID(findWheel())
    }

    setRange()
    autoCenter()

    device.on("data", function(data) {
        // reset memory
        let memory = clone(memoryPrev)
        const memoryCache = clone(memoryPrev)

        const dataDiffPositions = []

        // find out if anything has changed since the last event
        const dataLength = data.length
        for (let i = 0; i < dataLength; i++) {
            if (data[i] !== dataPrev[i]) {
                dataDiffPositions.push(i)
            }
        }

        if (dataDiffPositions.length === 0) {
            return
        }

        memory = dataMap(dataDiffPositions, data, memory)

        //-------------------------
        // Figure out what changed
        //-------------------------
        const memoryDiff = {}
        let count = 0

        for (let o in memoryCache) {
            for (let y in memory[o]) {
                if (memory[o][y] != memoryCache[o][y]) {
                    if (!memoryDiff.hasOwnProperty(o)) {
                        memoryDiff[o] = {}
                    }
                    eventEmitter.emit(o + '-' + y, memory[o][y]) // for example, wheel-turn
                    memoryDiff[o][y] = memory[o][y]
                    count = count + 1
                }
            }
        }

        if (count > 0) {
            if (options.debug) {
                console.log(memoryDiff)
            }

            // emit changes only
            eventEmitter.emit('changes', memoryDiff)
        }

        // emit everything in all event
        eventEmitter.emit('all', memory)

        // emit raw data
        eventEmitter.emit('data', data)

        // set global variables for next event
        memoryPrev = memory
        dataPrev = data
    })

    device.on("error", function(err) {
        if (options.debug) {
            console.log(color.red('device error -> '), JSON.stringify(err), err)
        }
    })

    leds(0)

    if (options.debug) {
        console.log(color.cyan('listen -> listening'))
    }

    callback(null)
} // listen

//---------
// Exports
//---------
module.exports.connect = connect
module.exports.disconnect = disconnect

// events
module.exports.emitter = eventEmitter
module.exports.on = on
module.exports.once = once

// leds
module.exports.leds = leds

// force
module.exports.autocenter = autocenter
module.exports.forceConstant = forceConstant
module.exports.forceDamper = forceDamper
module.exports.forceFriction = forceFriction
module.exports.forceOff = forceOff
module.exports.forceSpring = forceSpring

// wheel
module.exports.range = range

// advanced
module.exports.autocenterReports = autocenterReports
module.exports.damperReports = damperReports
module.exports.springReports = springReports
module.exports.relay = relay
module.exports.relayOS = relayOS