# Connect the shared workspace to Move

Choose **Engine → Move**, enter the endpoint, then **Connect**. Being on the
same Wi-Fi never selects an engine or establishes a connection. Browser remains
the startup default. Disconnect, network loss and tab hiding close the stream;
reconnect requires Connect. No browser session is sent to Move.

## What works with Schwung 1.7.3

The existing Manager on port **7700** proxies `/stream-auto?v=2`: SSE screen
frames, optional `surface` events and `hb` heartbeats. The adapter validates
128×64 `mono1_packed` and `gray4` screens and 2232-byte `SURFLV1` version-1
surface snapshots. It shows actual pixels, LEDs and observed held controls in
the same adaptable UI. The source-derived fixture records the pinned source
revision; it is not a captured hardware session.

This is a **read-only mirror**. The existing `/ws/remote-ui` parameter API is
not the native development host's extended protocol: `move_midi`, `move_panel`,
`dev_watch` and session commands cannot be assumed on hardware. Screen/LED
events do not supply the production semantic geometry, knob/pad labels, panel
navigation or clip model used for the high-resolution browser workspace.
Those components are unavailable in mirror mode. Host version is unreported;
the page does not infer 1.7.3 from a valid frame. Audio continues on Move.

## Supported network paths

A public HTTPS page cannot connect to Move's plain HTTP/WS services as mixed
content. This applies to iPad Safari too; same-LAN routing and CORS do not remove
that restriction. The app rejects such a URL before starting a request. It
does not disable browser security or work around certificate validation.

The simplest local path is the included read-only companion on a computer on
the same trusted LAN. It serves the **same packaged workspace** and proxies one
fixed Move mirror endpoint, without installing anything on Move:

```sh
# From this repository, with the tested static artifact at dev/wasm/build/site:
node dev/local/move-device-server.mjs \
  --move http://move.local:7700 \
  --site dev/wasm/build/site \
  --host 192.168.1.20 --origin http://192.168.1.20:7703
```

Replace the computer's example LAN address. On iPad, open
`http://192.168.1.20:7703/move/`, choose Move, enter
`http://192.168.1.20:7703`, then Connect. Keep the companion on a trusted LAN;
do not forward its port or expose it publicly. It has no write/control route.
Browser audio may be unavailable on a non-secure LAN page; use the HTTPS trial
for the browser engine, or a trusted local HTTPS setup for both modes.

For the existing HTTPS trial, an endpoint must already provide HTTPS with a
certificate trusted by the iPad and permit that exact trial origin. The
companion supports supplied `--tls-cert`/`--tls-key` and `--allow-origin` flags.
It never generates a certificate, bypasses TLS checks, opens firewall ports or
creates a public tunnel. A valid HTTPS origin does not guarantee reachability:
Safari/device network permission, DNS and network policy still need testing.

The companion validates Host/Origin, permits GET only, limits mirror streams,
never forwards browser cookies, follows no upstream redirects and closes the
upstream connection on disconnect. An allowed hosted origin requires HTTPS on
both endpoints. It is a presentation bridge, not a public device control API.

## Physical acceptance checklist

Confirm the actual host version and Manager address; open the local companion
on iPad Safari; connect explicitly; check OLED pixels, LED animation and held
indicators while operating Move. Test intentional disconnect, Wi-Fi loss,
screen locking, reconnect and returning to Browser. Confirm no device session
changes, no stuck notes, browser clock suspension, stopped browser restore and
explicit audio enable. Validate trusted HTTPS/CORS on the actual network before
claiming the hosted trial can connect. No physical test or host upgrade is
performed by the repository fixture tests.

## Schwung 1.8.2 integration seam

Inspected upstream tag `v1.8.2` (`462aa675222f4cc830cb6e04ad6520addb30ecdc`).
Manager advertises module `web_ui.html` through `custom_ui` messages and serves
`/api/remote-ui/module-assets/{id}/{filepath...}`. Its original
`schwung-remote-api.js` offers the same getParam/setParam API through either an
iframe parent or a standalone `/ws/remote-ui` connection. The canonical Field
and probability components retain that bridge, so Manager and this workspace
use the same handlers. A richer host adapter can supply our ParameterBridge
without rewriting the editors.

Module selection/loading changes device state and is owned by the separate
host-compatibility work. Neither that API nor module asset discovery constitutes
a complete semantic Movy screen/pad/control protocol. This increment does not
load a module, discover devices, claim the upgrade is installed or guess missing
state. The mirror reports only capabilities actually observed in valid frames.
