# HB / Movy local companion

This archive contains the same tested browser workspace as the private trial,
the existing read-only Move mirror companion, and its Node dependency. No Git,
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
emulator state is presented as device state. Current device transport remains
read-only because its subscription can consume the autosave dirty flag.

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
