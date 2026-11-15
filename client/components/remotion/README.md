# RemotionPlayer (CMS)

Remotion compositions written directly in a CmsPage — no build. Remotion, `@remotion/player`
and `htm` are in the lazy `remotion` chunk and only load when a player scrolls into view.

## Props

| prop | |
|---|---|
| `composition` | name of a factory in `_app_.remotionCompositions` (page script) |
| `code` | alternative: factory as source string `"({html, ...}) => (props) => html\`...\`"` |
| `inputProps` | props for the composition (stable as long as the JSON is equal) |
| `durationInFrames` / `fps` | default 150 / 30 |
| `width` / `height` | composition size, default 1280×720; the player scales to the container width |
| `controls` `loop` `autoPlay` `clickToPlay` `muted` | player options (controls/loop/clickToPlay default on, muted default on) |
| `scrollSync` | `true`: frame follows scrolling instead of playing |
| `scrollTarget` | css selector of the element whose scroll progress drives the frame |
| `name` | PlayerRef as `_app_.remotionPlayers[name]` (seekTo, play, pause, …) |
| `lazyLoad` | `false`: load immediately |
| `acknowledgeRemotionLicense` | hides Remotion's license console note |

The factory receives the whole `remotion` API (`useCurrentFrame`, `useVideoConfig`, `interpolate`,
`spring`, `Easing`, `AbsoluteFill`, `Sequence`, `Series`, `Img`, `Audio`, …) plus `React`, `html`
(htm bound to React), `h` (createElement), `fps`, `width`, `height`, `durationInFrames`.
In htm use `className`, not `class`; close components with `<//>`.

## Example page

Template:

```json
[
  {"t": "RemotionPlayer", "p": {"composition": "Intro", "durationInFrames": 150, "autoPlay": true,
    "inputProps": {"title": "Hallo Thal", "subtitle": "Remotion im CMS", "color": "#0b3d91"}}},
  {"t": "section", "p": {"id": "story", "style": {"height": "300vh", "position": "relative"}}, "c": [
    {"t": "div", "p": {"style": {"position": "sticky", "top": 0}}, "c": [
      {"t": "RemotionPlayer", "p": {"composition": "Counter", "durationInFrames": 300,
        "scrollSync": true, "scrollTarget": "#story", "style": {"width": "min(100%, 177.78vh)", "margin": "0 auto"},
        "inputProps": {"from": 0, "to": 9000, "label": "Einwohner"}}}
    ]}
  ]}
]
```

Script:

```js
_app_.remotionCompositions = _app_.remotionCompositions || {}

// Titel fliegt mit Feder-Animation ein, Untertitel blendet nach 1 s ein
_app_.remotionCompositions.Intro = ({html, useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill, Sequence}) =>
    ({title, subtitle, color}) => {
        const frame = useCurrentFrame()
        const {fps} = useVideoConfig()
        const y = spring({frame, fps, config: {damping: 12}})
        return html`
            <${AbsoluteFill} style=${{background: color, color: '#fff', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, Arial, sans-serif'}}>
                <h1 style=${{fontSize: 110, margin: 0, transform: `translateY(${(1 - y) * 250}px)`, opacity: interpolate(frame, [0, 15], [0, 1])}}>${title}</h1>
                <${Sequence} from=${fps} layout="none">
                    <p style=${{fontSize: 44, opacity: interpolate(frame, [fps, fps + 20], [0, 1], {extrapolateRight: 'clamp'})}}>${subtitle}</p>
                <//>
            <//>`
    }

// Zähler + Balken, gedacht für scrollSync: der Frame folgt dem Scrollen
_app_.remotionCompositions.Counter = ({html, useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill}) =>
    ({from, to, label}) => {
        const frame = useCurrentFrame()
        const {durationInFrames} = useVideoConfig()
        const p = interpolate(frame, [0, durationInFrames - 1], [0, 1], {easing: Easing.inOut(Easing.cubic)})
        const value = Math.round(from + (to - from) * p)
        return html`
            <${AbsoluteFill} style=${{background: '#f6f7f9', justifyContent: 'center', padding: 120, fontFamily: 'Inter, Arial, sans-serif'}}>
                <div style=${{fontSize: 160, fontWeight: 700, color: '#0b3d91'}}>${value.toLocaleString('de-CH')}</div>
                <div style=${{fontSize: 48, color: '#555', marginBottom: 40}}>${label}</div>
                <div style=${{height: 40, background: '#dde3ec', borderRadius: 20}}>
                    <div style=${{height: '100%', width: `${p * 100}%`, background: '#0b3d91', borderRadius: 20}}/>
                </div>
            <//>`
    }
```
