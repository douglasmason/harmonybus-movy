# HB / Movy local companion

This archive contains the same tested browser workspace as the private trial,
the existing Move companion, and its Node dependency. Mirroring is read-only
by default; paired Play/Stop is an explicit option. No Git,
compiler, npm install, or software installation on Move is needed.

1. Install Node.js 22 or later on your Mac/computer if it is not already present.
2. Extract `move-companion.tar.gz` and open Terminal in `move-companion`.
3. Run `node start.mjs --help` to see your computer's IPv4 addresses.
4. Choose the address on the trusted Wi-Fi/LAN shared with your iPad and Move:

   `node start.mjs --host 192.168.1.20 --move http://move.local:7700`

   Replace the example computer address. If Move's name does not resolve, use
   its actual IP in `--move`. Change `--port 7703` if that port is occupied.
5. Open the printed **local** URL on your iPad. Select **Engine → Move**, confirm
   the automatically filled companion address, then **Connect**. Same Wi-Fi alone does not
   connect. Stop with Ctrl+C; reconnect explicitly after restarting.

With no arguments, `node start.mjs` binds only 127.0.0.1 for this computer.
The launcher never connects to Move on startup, opens a firewall port, creates
a public tunnel, installs a service, or starts automatically at login. Do not
forward its port or expose it outside a trusted LAN. The local read-only page
is accessible to devices on that LAN; the hosted trial remains private.

## What you get

Actual device screen pixels and available LEDs, with explicit connection status.
The current device protocol does not supply rich knob/pad labels, settings
navigation or semantic editors. Those stay unavailable in Move mode. No
emulator state is presented as device state.

### Optional paired Play/Stop

Start the same launcher with the transport flag:

```sh
node start.mjs --host 192.168.1.20 --move http://move.local:7700 --enable-transport
```

Replace the example computer address as above. On the printed local page,
choose **Engine → Move**, select **Check paired Play/Stop**, paste the printed
**Pairing key**, then **Connect**. The companion checks installed Movy metadata
and the active tool before enabling control. Movy **hbclean.320 and later**
advertise the required safe-state capability; older builds stay read-only.
Schwung 1.8.2 is the tested host protocol. Nothing is installed or upgraded by
this command, and startup makes no device request.

Only Play and Stop are exposed. Feedback means **request sent**, not confirmed
execution. Disconnect leaves device playback running. Commands are never
queued or replayed after a lost connection. Reconnect explicitly and enter the
key again; the page does not save it. Every launcher restart generates a new
key. Keep it private: plain LAN HTTP does not encrypt keys or commands. Use
only a trusted LAN, or the trusted HTTPS setup in MOVE-CONNECTION.md.

Launch without `--enable-transport` to return to read-only mirroring.

If connection fails, use **Download connection report** in Engine → Move.
It captures the checks already performed, screen/LED counts, transport readiness
and the last failure. Export makes no device request and includes no address,
pairing key, screen contents or session. Keep the report with your observations
on Move/iPad; it cannot confirm command execution or physical audio behavior.

Browser and device sessions remain separate. This local origin also has its own
browser storage: it does not automatically receive sessions or appearance from
the hosted trial. Session transfer is not part of connection setup.

The hosted HTTPS page cannot use this plain HTTP companion endpoint. Open the
printed local page for Move mirroring; use the hosted HTTPS trial for Browser
audio. Trusted HTTPS setup is documented in MOVE-CONNECTION.md. No certificate
or browser-security bypass is provided. Actual iPad/Move network acceptance
still requires your hardware; CI uses a source-derived protocol fixture.

`BUILD.json` identifies the tested source and hashes every distributed file.
The hosted download's adjacent SHA256 file verifies the archive. Dependencies
and their licenses are included. Updating means extracting a fresh download;
there is no automatic updater.
