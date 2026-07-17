Use Slider for bounded continuous values such as brightness, curtain position, or thermostat setpoint.

```jsx
<Slider label="亮度" value={brightness} min={1} max={100} unit="%" onChange={setBrightness} onCommit={saveBrightness} />
```

Separate local feedback from committed writes and preserve keyboard commit behavior.
