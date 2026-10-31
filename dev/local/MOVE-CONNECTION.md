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

The mirror itself is **read-only**. Opt-in Play/Stop through the companion is described below. The existing `/ws/remote-ui` parameter API is
not the native development host's extended protocol: `move_midi`, `move_panel`,
`dev_watch` and session commands cannot be assumed on hardware. Screen/LED
events do not supply the production semantic geometry, knob/pad labels, panel
navigation or clip model used for the high-resolution browser workspace.
Those components are unavailable in mirror mode. Host version is unreported;
the page does not infer 1.7.3 from a valid frame. Audio continues on Move.

## Supported network paths

This workspace requires HTTPS endpoints when opened from the hosted HTTPS
trial. Plain HTTP/WS is subject to mixed-content blocking; same-LAN routing and
CORS alone do not establish browser permission. The app rejects insecure URLs
before making a request, rather than relying on version-specific exceptions.

Browser support is evolving: the [Local Network Access draft](https://wicg.github.io/local-network-access/)
allows permission-mediated mixed-content exceptions, and [WebKit landed related
changes in September 2026](https://bugs.webkit.org/show_bug.cgi?id=297739).
Its [implementation tracker](https://bugs.webkit.org/show_bug.cgi?id=250607)
remains open. These are not evidence that the user's iPad Safari supports the
complete path. This increment does not probe experimental flags or claim a
successful physical Safari test. It never disables security or TLS validation.
Apple's [local-network privacy note](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
exempts Safari traffic from the app-level permission; that does not waive web
mixed-content, CORS or future site-level network permission checks.

The simplest local path is the included companion on a computer on
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
do not forward its port or expose it publicly. The default has no write/control route.
Browser audio may be unavailable on a non-secure LAN page; use the HTTPS trial
for the browser engine, or a trusted local HTTPS setup for both modes.

For the existing HTTPS trial, an endpoint must already provide HTTPS with a
certificate trusted by the iPad and permit that exact trial origin. The
companion supports supplied `--tls-cert`/`--tls-key` and `--allow-origin` flags.
It never generates a certificate, bypasses TLS checks, opens firewall ports or
creates a public tunnel. A valid HTTPS origin does not guarantee reachability:
Safari/device network permission, DNS and network policy still need testing.

The companion validates Host/Origin, permits GET only for HTTP, limits mirror streams,
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

## Paired Play/Stop (Schwung 1.8.2)

The same workspace can now send two real Movy commands through a deliberately
limited companion adapter. Nothing is installed on Move. Start the companion
from this repository with its existing Node dependencies (`npm --prefix
dev/local ci`) and add `--enable-transport` to the command above. Bind one
explicit private LAN IPv4 address, or 127.0.0.1 for same-computer testing.

The companion prints a random, per-launch pairing key. In Engine → Move, enter
the **companion** address, enable **paired Play/Stop**, paste that key, and tap
Connect. The key is cleared immediately, never saved in local storage, and must
be entered again to reconnect. Use this only on a trusted LAN: plain HTTP/WS
provides no confidentiality for either the key or commands. For encrypted access
use a trusted HTTPS companion, including when connecting from the hosted trial.
No public tunnel, port forwarding or authentication bypass is provided.

The companion reads the installed `movy/module.json` via Manager's module asset
route, accepts the inspected 0.34.0 / 0.34.1-hbclean release family, and subscribes
to the existing `/ws/remote-ui` API. `tool_info.id` must identify active Movy.
The only writes are stock `set_param` messages with slot 0, key
`overtake_dsp:cmd`, and value `play` or `stop`. That slot selects the overtake
routing mailbox; it does **not** map the four Schwung slots onto Movy's tracks.
The pairing WebSocket protocol belongs to this companion, not the device.
One control client is allowed. Exact Host/Origin, pairing, payload limits,
heartbeat checks and a fixed upstream constrain the route. Arbitrary parameters,
module loading, recording, files and MIDI injection are not exposed.

Play and Stop retain production Movy/Move Link semantics. Play is not a toggle
and does not end a take; use Stop to finish recording before replay. The adapter
does not combine Stop/Play because that can queue Move Link transport toggles.
Feedback says **request sent**, not executed: stock Manager has no command
execution acknowledgment. Confirm the result on Move. A tool change, socket
loss, mirror loss, hidden tab or Disconnect closes control and drops pending
work; no command is queued or replayed across reconnect. Disconnect does not
stop physical playback. These stateless actions hold no pads, modifiers or
encoder touches, and input gestures remain disabled in Move mode.

This is source-verified against Schwung tag v1.8.2, not a claim of an on-device
test or automatic host version detection. Metadata reports the installed Movy
version; the host version remains unreported. The older mirror stays usable
without enabling transport. Writable operation on 1.7.3 is not certified.

### Why the full editor still needs a semantic device adapter

Pinned production Movy returns persisted `movy1` text for `get_param("state")`.
Manager's tool subscription expects a JSON object and its `rui_poll` contract;
Movy does not implement that observation contract. Manager has no arbitrary
`get_param` WebSocket request. `get_hierarchy` covers stock chain components,
not the 16 chains owned by the Movy overtake tool. The native development host's
rich surface and watch messages therefore cannot simply be sent to hardware.
A host upgrade alone does not supply them. Do not change the persistence format
or invent labels/state from a parallel emulator to conceal this gap.

The canonical components and ParameterBridge remain shared. A future on-device
observation/input adapter must provide their actual state and release semantics;
its implementation belongs with the host integration, not a second browser
musical engine. Meanwhile the same workspace displays actual device pixels/LEDs
and enables only the two verified commands.

### Validation and remaining physical checks

Node tests cover source-derived tool messages, exact writes, wrong keys/origins,
read-only default, unsupported version/tool, loss, stale callbacks and reconnect.
Browser CI runs the packaged workspace through the real companion and a stock
protocol fixture backed by a separate compiled production Movy DSP. It records
a take in that fixture, sends Stop/Play through the real WebSocket route, and
verifies MIDI replay plus retained browser state. This is a test harness, never
a substitute device state source in the product.

Still required on Move/iPad: installed module metadata and active-tool detection,
Manager command delivery, actual Link/transport response, recording completion,
Wi-Fi/lock loss, tool swaps, and trusted TLS/CORS/network permissions. There is
no atomic tool-identity-and-command operation in Manager; changing tools during
a request remains an upstream race. Keep Movy open while controlling it.
