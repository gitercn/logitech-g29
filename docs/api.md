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
  * [forceFriction](#forcefriction) (old name of forceDamper)
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

A damper: resistance that grows with how fast the wheel turns, like stirring honey. It is zero while the wheel is still. This is the new name for [forceFriction](#forcefriction), with 16 steps instead of 8, an optional force limit, a value per turning direction, and negative values that assist instead of resist. Both use the same slot, so the most recent call wins. Returns `false` and sends nothing when the setting is not understood.

```js
g.forceDamper()                              // off
g.forceDamper(0)                             // off
g.forceDamper(0.5)                           // half strength
g.forceDamper(1)                             // full strength
g.forceDamper([1, 0.25])                     // [strength, max]: full strength, force capped at 25%
g.forceDamper({ strength: 1, max: 0.25 })    // same as above
g.forceDamper({ left: 1, right: 0 })         // heavy while turning left, free while turning right
g.forceDamper(-0.3)                          // assist: pushes along with the wheel, so it feels lighter
```

|Value|Meaning|Sent as|
|:--|:--|:--|
|strength|How quickly the resistance builds with speed, `-1` to `1`. Negative values push along with the movement instead (an assist; the wheel coasts further and can run away, so keep it small or set `max`).|0 - 15, plus a sign bit|
|left, right|The same, only while the wheel turns left or right. Each defaults to `strength`.|0 - 15, plus a sign bit|
|max|The most force the damper may apply, however fast the wheel turns. Defaults to `1`.|0 - 255|

Measured on a G29 with a 52% push (free wheel 379 °/s):

|Step|2|4|8|15|
|:--|:--|:--|:--|:--|
|Speed|302 °/s|237 °/s|131 °/s|44 °/s|

The hardware report is `0x21 0x0c K1 S1 K2 S2 MAX`: K1 / S1 act while turning left, K2 / S2 while turning right, and S = 1 assists. Step 0 is the weakest damper, not necessarily none; set both to `0` to turn it off.

### forceFriction

**Old name, use [forceDamper](#forcedamper) instead.** `forceFriction` still works and sends exactly what it always did, so existing code feels the same.

`forceFriction(number)` where number is 0 - 1 to indicate effect strength.

```js
g.forceFriction()    // off
g.forceFriction(0)   // off
g.forceFriction(0.5) // half strength
g.forceFriction(1)   // full strength
```

Despite the name, this is a damper (effect type `0x02`), confirmed on a G29: turning slowly is light, turning fast is heavy, and there is no force while the wheel is still. It has 8 steps (`0x21 0x02 K 0x00 K 0x00 0x00`, K 0 - 7) and no force limit. A G29 has no true friction effect: the friction report `0x0e` measured as a weaker damper (resistance grows with speed), and the Linux driver turns friction requests into a damper for this wheel, as the Windows driver does.

Switching is a rename: `forceDamper` takes the same 0 - 1 value, uses the same slot and is turned off the same way. Step K here measured about as strong as step 2K + 1 there (7 matched 15 exactly), so the same value feels nearly the same.

|Old|New|
|:--|:--|
|`forceFriction()` / `forceFriction(0)`|`forceDamper()` / `forceDamper(0)`|
|`forceFriction(0.5)`|`forceDamper(0.5)`|
|`forceOff(2)`|`forceOff(2)`|

### forceSpring

`forceSpring(setting)`

A position spring that pulls the wheel toward `center` and holds it there. Unlike [autocenter](#autocenter), the center can be anywhere and can have a dead band, each side can be set apart, and a negative stiffness turns it into an anti-spring that pushes away from the center. It can steer the wheel to a position by itself. Returns `false` and sends nothing when the setting is not understood.

```js
g.forceSpring()                                   // off
g.forceSpring(false)                              // off
g.forceSpring([0.5])                              // hold the middle, full stiffness and force
g.forceSpring([0.625, 1, 0.5])                    // [center, stiffness, max]
g.forceSpring([0.5, 1, 1, 0.1])                   // [center, stiffness, max, deadband]
g.forceSpring({ center: 0.625, max: 0.5 })        // fields left out use the defaults below
g.forceSpring({ center: 0.5, left: 1, right: 0 }) // spring only left of the center
g.forceSpring([0.5, -0.5, 0.3])                   // anti-spring: pushes away from the middle
```

|Value|Meaning|Sent as|
|:--|:--|:--|
|center|Where the wheel is pulled to, across the *current* [range](#range): `0` left end, `0.5` middle, `1` right end. The same scale as the `wheel-turn` event divided by 100. Required.|0 - 2047|
|stiffness|How quickly the force builds as the wheel moves away from the center, `-1` to `1`. Negative pushes away instead, on both sides. Defaults to `1`.|0 - 15, plus a sign bit|
|left, right|Stiffness on each side of the center, `0` to `1`. Each defaults to the size of `stiffness`. `0` means no spring on that side at all.|0 - 15|
|max|The most force the spring may apply. Defaults to `1`.|0 - 255|
|deadband|Width of a free zone around the center, as a share of the range. Defaults to `0`.|-|

A bare number is not accepted, so that `forceSpring(0)` cannot mean "pull hard to the left end".

Stiffness is not linear on a G29. Measured with the same 30% push against a centered spring:

|Step|0|1|2|4|8|15|
|:--|:--|:--|:--|:--|:--|:--|
|Pushed aside|77°|59°|49°|38°|25°|11°|
|Stiffness (15 = 1)|0.15|0.19|0.23|0.29|0.44|1|

Step 0 is still a weak spring, which is why a side set to `0` gets its edge moved to the end of the range instead. The two sign bits of the report (bit 0 and bit 4 of byte 6) each invert both sides on a G29, so a per-side anti-spring is not possible; the library only sets bit 0. The dead band was measured too: released at 119°, the wheel stopped at 55°, on the edge of a ±56° band. A wheel moving fast coasts well past the edge, though: on a G29 it slides about 110° after a quick push, so add a little [forceDamper](#forcedamper) if it overshoots. This matters most with one side at `0`: nothing stops the wheel once it crosses the center. Pulled back from -90° by `{ center: 0.5, left: 1, right: 0 }` at full force, it crossed the center at about 650 °/s and coasted on to +250°; with `max: 0.5` and `forceDamper(0.6)` it stopped at the center.

Because `center` follows the current range, the same setting points to a different angle after `range()` changes. Turn [autocenter](#autocenter) off first: it pulls toward the middle, so the wheel stops where the two springs balance. With auto-centering off, a G29 settled within about 0.3% of the center (`center: 0.72` → `wheel-turn` 71.96); with `autocenter([0.3, 1])` still on, `center: 0.625` stopped at 60.65 instead of 62.5.

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

A G29 plays up to four effects at once, each stored in a slot inside the wheel. The upper four bits of a report's first byte choose the slot as a bit mask (slot 1 `0x1_`, slot 2 `0x2_`, slot 3 `0x4_`, slot 4 `0x8_`) and the lower four bits are the operation (`_1` start, `_c` refresh, `_3` stop). For example `0x41 0x0b ...` starts a spring in slot 3.

|Slot|Used by|
|:--|:--|
|1|forceConstant|
|2|forceDamper, forceFriction|
|3|forceSpring|
|4|unused (works, for [relayOS](#relayos))|

Auto-centering is not a slot effect and keeps working alongside all four. The wheel cannot report what is in a slot: the library only knows what it sent last.

Since 3.4.0 the library starts an effect once and refreshes it after that, as the Linux driver does, and does not send a report identical to the last one in that slot. Streaming the same value from an app therefore costs no USB traffic. Restarting and refreshing measured the same on a G29 (a refresh also restarts a stopped effect). A stop, a different effect type in the slot, or a slot report sent by hand through `relayOS` makes the next call start the effect again.

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