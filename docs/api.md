# API - Logitech G29 Racing Wheel for Node

* [connect](#connect)
  * [options](#options)
* [events](#events)
  * [event map](#event-map)
  * [on](#on)
  * [once](#once)
* [force](#force)
  * [autocenter](#autocenter)
  * [forceConstant](#forceconstant)
  * [forceDamper](#forcedamper)
  * [forceFriction](#forcefriction)
  * [forceSpring](#forcespring)
  * [forceOff](#forceoff)
  * [effect slots](#effect-slots)
* [leds](#leds)
* [range](#range)
* [disconnect](#disconnect)
* [advanced](#advanced)
  * [autocenterReports](#autocenterreports)
  * [damperReports](#damperreports)
  * [springReports](#springreports)
  * [emitter](#emitter)
  * [relay](#relay)
  * [relayOS](#relayos)

## connect

`connect(callback)` or `connect(options, callback)`

Connect to the wheel and receive a callback once it is ready.

```js
g.connect(function(err) {
  console.log('Ready')
})
```

Connect with `options`.

```js
const options = {
  autocenter: false,
  range: 270
}

g.connect(options, function(err) {
  console.log('Ready')
})
```

### options

The following options can be set when using `connect(options, callback)`.

|Option|Default|Type|Examples|
|:--|:--|:--|:--|
|autocenter|true|boolean, array or object|true, false, [0.3, 0.7], {left: 1, right: 0.5, force: 1}|
|debug|false|boolean|true, false|
|range|900|number|270, 900|

`autocenter` accepts the same settings as the [autocenter](#autocenter) function below, which can also change it while connected.

`debug` enables a lot of console logging.

`range` is normally number from 270 to 900 although you can go as low as 40. Range sets the degrees of turn it takes before the wheel reports a maximum value for that direction. For example, if the range is 270, it won't take much turning before you receive a min or max return value. Even if you can physically turn the wheel more in the same direction, the return value will be the same.

## events

Events can be subscribed to using `on` and `once`.

For example, if you wanted to listen for wheel turns and gear changes you could write:

```js
g.on('wheel-turn', function(val) {
  console.log('Wheel turned to ' + val)
}).on('shifter-gear', function(val) {
  console.log('Shifted into ' + val)
})
```

**Wheel Events**

|Event|Returns|Values|Notes|
|:--|:--|:--|:--|
|`wheel-turn`|number|0 - 100|0 is full right<br>50 is centered<br>100 is full left|
|`wheel-shift_left`|binary|0, 1||
|`wheel-shift_right`|binary|0, 1||
|`wheel-dpad`|number|0 - 8|0 = neutral<br>1 = north<br>2 = northeast<br>3 = east<br>4 = southeast<br>5 = south<br>6 = southwest<br>7 = west<br>8 = northwest|
|`wheel-button_x`|binary|0, 1||
|`wheel-button_square`|binary|0, 1||
|`wheel-button_triangle`|binary|0, 1||
|`wheel-button_circle`|binary|0, 1||
|`wheel-button_l2`|binary|0, 1||
|`wheel-button_r2`|binary|0, 1||
|`wheel-button_l3`|binary|0, 1||
|`wheel-button_r3`|binary|0, 1||
|`wheel-button_plus`|binary|0, 1||
|`wheel-button_minus`|binary|0, 1||
|`wheel-spinner`|number|-1, 0, 1|-1 = left<br>0 = neutral<br>1 = right|
|`wheel-button_spinner`|binary|0, 1||
|`wheel-button_share`|binary|0, 1||
|`wheel-button_option`|binary|0, 1||
|`wheel-button_playstation`|binary|0, 1||

**Shifter Events**

|Event|Returns|Values|Notes|
|:--|:--|:--|:--|
|`shifter-gear`|number|0 - 6, -1|0 = neutral<br>1-6 = gears<br>-1 = reverse|

**Pedal Events**

|Event|Returns|Values|Notes|
|:--|:--|:--|:--|
|`pedals-gas`|number|0 - 1|0 is no pressure, 0.25 is quarter pressure, and 1 is fully pressed.|
|`pedals-brake`|number|0 - 1|0 is no pressure, 0.25 is quarter pressure, and 1 is fully pressed.|
|`pedals-clutch`|number|0 - 1|0 is no pressure, 0.25 is quarter pressure, and 1 is fully pressed.|

Not enough events for you? Try subscribing to `all`, `changes`, or `data` for even more information.

### event map

View `/images/event-map.png` for a visual representation.

### on

`on(event, callback)`

Can be specified before or after a `connect(callback)`.

```js
g.on('wheel-button_playstation', function(val) {
  if (val) {
      console.log('I really love it when you press my buttons.')
  }
})
```


### once

`once(event, callback)`

Can be specified before or after a `connect(callback)`.

```js
g.once('pedals-gas', function(val) {
    // the following message will only be displayed once
    console.log('Powered by dead dinosaur juice, your engine roars to life!')
})
```

## force

### autocenter

`autocenter(setting)`

Change the centering spring while connected. The setting is also remembered and applied again on the next `connect`. Returns `false` and sends nothing when the setting is not understood.

```js
g.autocenter()                                 // on, default spring (same as true)
g.autocenter(true)                             // on, strongest spring a G29 accepts
g.autocenter(false)                            // off
g.autocenter([0.5, 1])                         // [stiffness, force]
g.autocenter({ left: 1, right: 0.3, force: 1 }) // stiffer when turned left than right
```

Every value is 0 - 1 and is clamped to that range.

|Value|Meaning|Sent as|
|:--|:--|:--|
|stiffness, `left`, `right`|How quickly the centering force builds as the wheel moves away from center. `left` applies while the wheel is left of center, `right` while it is right of center. An array sets both sides to the same value.|0 - 7|
|force|Overall strength of the centering force.|0 - 255|

Object fields that are left out default to `1`, so `{ right: 0 }` keeps full centering on the left only.

The hardware report is `0xfe 0x0d LEFT RIGHT FORCE`, followed by `0x14` to switch centering on. A G29 only accepts stiffness values 0 - 7: values 8 - 15 wrap around to 0 - 7, so 8 feels like no spring at all. Versions before 3.2.0 of this library scaled stiffness to 0 - 15, which made any first value above 0.5 weaker instead of stronger. Linux fixed the same mistake for non-MOMO wheels in the hid-lg4ff commit "Correct Auto-center strength for wheels other than MOMO and MOMO2".

### forceConstant

`forceConstant(number)` where number is 0 - 1 to indicate both direction and strength.

```js
g.forceConstant()    // no force
g.forceConstant(0)   // full left
g.forceConstant(0.5) // no force
g.forceConstant(1)   // full right
```

### forceDamper

`forceDamper(setting)`

A damper: resistance that grows with how fast the wheel turns, like stirring honey. It is zero while the wheel is still. This is the finer version of [forceFriction](#forcefriction): 16 steps instead of 8, plus a force limit. Both use the same slot, so the most recent call wins. Returns `false` and sends nothing when the setting is not understood.

```js
g.forceDamper()                              // off
g.forceDamper(0)                             // off
g.forceDamper(0.5)                           // half strength
g.forceDamper(1)                             // full strength
g.forceDamper([1, 0.25])                     // [strength, max]: full strength, force capped at 25%
g.forceDamper({ strength: 1, max: 0.25 })    // same as above
```

|Value|Meaning|Sent as|
|:--|:--|:--|
|strength|How quickly the resistance builds with speed.|0 - 15|
|max|The most force the damper may apply, however fast the wheel turns. Defaults to `1`.|0 - 255|

The hardware report is `0x21 0x0c K 0x00 K 0x00 MAX`.

### forceFriction

`forceFriction(number)` where number is 0 - 1 to indicate effect strength.

```js
g.forceFriction()    // no friction
g.forceFriction(0)   // no friction
g.forceFriction(0.5) // half strength
g.forceFriction(1)   // full strength
```

Despite the name, this is a damper (effect type `0x02`): turning slowly is light and turning fast is heavy. It has 8 steps (`0x21 0x02 K 0x00 K 0x00 0x00`, K 0 - 7) and no force limit. Kept for compatibility; [forceDamper](#forcedamper) is the finer version. A G29 does not appear to have a true friction effect: the Linux driver turns friction requests into a damper for this wheel, as the Windows driver does.

### forceSpring

`forceSpring(setting)`

A position spring that pulls the wheel toward `center` and holds it there. Unlike [autocenter](#autocenter), the center can be anywhere and can have a dead band, so it can steer the wheel to a position by itself. Returns `false` and sends nothing when the setting is not understood.

```js
g.forceSpring()                                   // off
g.forceSpring(false)                              // off
g.forceSpring([0.5])                              // hold the middle, full stiffness and force
g.forceSpring([0.625, 1, 0.5])                    // [center, stiffness, max]
g.forceSpring([0.5, 1, 1, 0.1])                   // [center, stiffness, max, deadband]
g.forceSpring({ center: 0.625, max: 0.5 })        // fields left out use the defaults below
```

|Value|Meaning|Sent as|
|:--|:--|:--|
|center|Where the wheel is pulled to, across the *current* [range](#range): `0` left end, `0.5` middle, `1` right end. The same scale as the `wheel-turn` event divided by 100. Required.|0 - 2047|
|stiffness|How quickly the force builds as the wheel moves away from the center. Defaults to `1`.|0 - 15|
|max|The most force the spring may apply. Defaults to `1`.|0 - 255|
|deadband|Width of a free zone around the center, as a share of the range. Defaults to `0`.|-|

A bare number is not accepted, so that `forceSpring(0)` cannot mean "pull hard to the left end".

Because `center` follows the current range, the same setting points to a different angle after `range()` changes: with a G29, `center: 0.625` held the wheel at about 96° with a 900° range and at about 48° with a 450° range. The wheel settled at `wheel-turn` 60.65 rather than 62.5, so it stops a little short of the center.

**Careful:** the spring turns the wheel by itself. Start with a low `max`.

The hardware report is `0x41 0x0b D1 D2 K S MAX`, where D1 and D2 are the dead band edges.

### forceOff

`forceOff()` or `forceOff(slot)`

Turn off all force effects except auto-centering, or only the effect in one [slot](#effect-slots).

```js
g.forceOff()  // every slot
g.forceOff(1) // forceConstant
g.forceOff(2) // forceDamper / forceFriction
g.forceOff(3) // forceSpring
```

Versions before 3.3.0 sent `forceOff(3)` to slots 1 and 2 and `forceOff(4)` to slot 3.

### effect slots

A G29 plays up to four effects at once, each stored in a slot inside the wheel. The upper four bits of a report's first byte choose the slot as a bit mask (slot 1 `0x1_`, slot 2 `0x2_`, slot 3 `0x4_`, slot 4 `0x8_`) and the lower four bits are the operation (`_1` start, `_3` stop). For example `0x41 0x0b ...` starts a spring in slot 3.

|Slot|Used by|
|:--|:--|
|1|forceConstant|
|2|forceDamper, forceFriction|
|3|forceSpring|
|4|unused|

Auto-centering is not a slot effect and keeps working alongside all four. The wheel cannot report what is in a slot: the library only knows what it sent last.

### leds

`leds()` or `leds(number)` or `leds(string)` or `leds(array)`

The shift indicator LEDs can be interfaced with in a variety of ways.

`led()` is the easiest way to turn off all LEDs.

`led(number)` where number is between 0 - 1 to indicate a percent.

```js
g.led(0.45) // the least accurate way to control LEDs since an arbitrary scale will be used for conversion
```

`led(string)` where string is zero to five characters of zeroes or ones.

```js
g.leds('')      // all off
g.leds('1')     // green
g.leds('111')   // green, green, orange
g.leds('00001') // red only
```

`led(array)` where array is zero to five elements of zeroes or ones.

```js
g.leds([])          // all off
g.leds([1])         // green
g.leds([1,1,1])     // green, green, orange
g.leds([0,0,0,0,1]) // red only
```

## range

`range(degrees)`

Change the wheel range while connected, from 40 to 900 degrees. Values outside are clamped. The setting is also remembered for the next `connect`. Returns `false` and sends nothing when `degrees` is not a number.

```js
g.range(900) // full rotation
g.range(270) // short and twitchy
```

## disconnect

`disconnect()`

Disconnect in preparation to connect again or to allow other software to use the wheel.

## Advanced

### autocenterReports

`autocenterReports(setting)`

Return the HID reports `autocenter(setting)` would send, without sending them. Useful for logging or tests. Returns `null` when the setting is not understood.

```js
g.autocenterReports([0.5, 1]) // [[0x14, 0, 0, 0, 0, 0, 0], [0xfe, 0x0d, 4, 4, 255, 0, 0, 0]]
```

### damperReports

`damperReports(setting)`

Return the HID reports `forceDamper(setting)` would send, without sending them. Returns `null` when the setting is not understood.

```js
g.damperReports([1, 0.25]) // [[0x21, 0x0c, 15, 0, 15, 0, 64]]
```

### springReports

`springReports(setting)`

Return the HID reports `forceSpring(setting)` would send, without sending them. Returns `null` when the setting is not understood.

```js
g.springReports([0.625]) // [[0x41, 0x0b, 0xa0, 0xa0, 0xff, 0, 0xff]]
```

### emitter

`emitter.` + [nodejs.org/api/events.html](https://nodejs.org/api/events.html)

Exposes the EventEmitter that this library uses behind the scenes.

```js
g.emitter.removeAllListeners()
```

### relay

`relay(data)`

Relay low level commands directly to the hardware.

```js
// turn on all LEDs
g.relay([0x00, 0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01])
```

### relayOS

`relayOS(data)`

Relay low level commands directly to the hardware after applying OS specific tweaks, if needed.

```js
// turn on all LEDs
g.relayOS([0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01])
```