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

The trial’s **Engine → Move → Connecting from an iPad** section offers a
portable companion download. Extract it on your computer and run
`node start.mjs --help` (Node.js 22+). It includes this exact tested workspace
and its Node dependency; no Git/compiler/npm install is needed. See
[portable instructions](COMPANION-README.md). The archive launcher is read-only
and binds loopback unless you explicitly choose one private LAN address.

The source-development path is the included companion on a computer on
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

## Paired transport readiness (Schwung 1.8.2)

**Current Movy builds remain read-only.** Source inspection found that Manager's
`subscribe_tool` seeds and polls `get_param("state")`. Movy's implementation
clears its autosave dirty flag on that read. Merely subscribing can consume a
pending save even without sending a control command. Do not connect current
Movy to that subscription to obtain identity or infer safe support from a host
upgrade. This companion rejects the unsafe path before opening the upstream
WebSocket; its live screen mirror remains available.

The shared transport adapter is implemented and tested behind a device-owned
capability gate. A future Movy integration must prove non-consuming state reads
and advertise this exact module.json capability before it can be enabled:

```json
{"browser_transport_v1":{"state_read_preserves_dirty":true}}
```

This is an integration contract, **not a user override**. Do not hand-edit the
installed metadata to enable it. The browser work does not modify on-device
persistence or duplicate the separate host compatibility implementation. The
current 0.34.0 / 0.34.1-hbclean metadata lacks this flag and is correctly refused.

To check readiness without installing anything on Move, start the companion
with its existing Node dependencies (`npm --prefix dev/local ci`) and add
`--enable-transport` to the command above. Bind one explicit private LAN IPv4
address, or 127.0.0.1 for same-computer testing. It prints a random per-launch
pairing key. In Engine → Move enter the companion address, select **Check paired
Play/Stop**, paste the key and Connect. The key is cleared immediately and never
saved in local storage; enter it again to reconnect. Current builds show the
persistence-safe subscription requirement and leave Play/Stop disabled.

Plain HTTP/WS provides no confidentiality for the key or commands. Use only a
trusted LAN, or a trusted HTTPS companion for encrypted access. Hosted HTTPS
continues to require HTTPS. No public tunnel, port forwarding, TLS bypass or
loosening of the trial's audience is provided.

### Transport contract after a persistence-safe device adapter exists

The companion reads installed `movy/module.json` through Manager's module asset
route, checks the supported release family and capability, then uses stock
`/ws/remote-ui`. `tool_info.id` must identify active Movy. The only writes are
`set_param`, slot 0, key `overtake_dsp:cmd`, and value `play` or `stop`. Slot 0
selects the overtake routing mailbox; it does not map Schwung slots to Movy's
16 tracks. The pairing WebSocket belongs to the companion, not the device.

One control client is allowed. Exact Host/Origin, pairing, payload limits,
heartbeats and a fixed upstream constrain the route. Arbitrary parameters,
module loading, recording, files and MIDI injection are not exposed. Play/Stop
use the shared command encoder and production behavior. Play is not a toggle
and does not finish recording; Stop closes a take. Combining Stop/Play can queue
Move Link toggles, so the adapter does not invent a restart action.

Feedback says **request sent**, not executed: Manager has no execution
acknowledgment. Tool changes, socket/mirror loss, hidden tabs and Disconnect
revoke control without queued/replayed commands. Disconnect leaves device
playback running. These stateless actions hold no pads, modifiers or touches;
input gestures remain disabled. Host version is unreported; installed Movy
metadata is not a host-version probe. Writable 1.7.3 operation is not certified.

### Semantic device adapter still needed

Production Movy returns persisted `movy1` text for `state`, while Manager expects
a JSON object and `rui_poll`. Manager has no arbitrary `get_param` WebSocket
request. `get_hierarchy` covers stock chains, not the 16 Movy-owned chains.
The native development host's rich surface/watch protocol is unavailable on
hardware. A host upgrade alone does not supply it. Do not change persistence
format casually or manufacture labels from a parallel emulator.

The canonical components and ParameterBridge remain shared. The host adapter
must supply actual semantic observations, safe persistence reads and input
release semantics. Exact source evidence: Schwung v1.8.2
`462aa675222f4cc830cb6e04ad6520addb30ecdc`, `schwung-manager/remote_ui.go`
(`handleSubscribeTool`, `fetchAllParams`); pinned Movy
`5c01a4fe7745b730ee98111194fc64328ea2659b`,
`engine/crates/movy-dsp/src/lib.rs` (`get_param("state")`) and
`src/seq/set-save.ts` (autosave dirty ownership).

### Validation and physical acceptance

Node fixtures cover exact protocol writes, keys/origins, read-only default,
unsupported versions, absent persistence capability, wrong tools, loss, stale
callbacks and reconnect. Browser CI runs the packaged UI through the real
companion: current metadata must be rejected before any subscription and retain
the compiled engine's pending-save flag. A separate **future-capability fixture**
then verifies real production Stop/Play and recorded MIDI replay. It is a test
harness, not evidence that current device metadata or state reads are safe.

Physical Move/iPad testing remains required after the host integration satisfies
the capability contract: identity, command delivery, Link response, recording
completion, Wi-Fi/lock loss, tool changes and trusted TLS/CORS permissions.
Manager has no atomic identity-and-command operation, so changing tools during
a request remains an upstream race. Nothing was installed or changed on Move.

### Explicit capability check

Check capabilities reads only the fixed installed Movy module.json through the
companion. It never subscribes to state, opens the remote WebSocket, starts the
mirror or sends musical commands. The report separates installed module version,
subscription safety and companion transport configuration. Eligibility is not a
connection or proof of the currently active tool; the existing paired handshake
still checks those before accepting commands. Host version remains unknown, and
rich semantic controls and device audio are not available through this adapter.
A missing metadata endpoint does not prevent the separate screen mirror.
Changing address or switching engines discards a pending report. HTTPS pages
reject insecure endpoints before requesting metadata, just as for the mirror.
