// A stand-in for Torch's D-Bus service in the headless session: State
// (JSON) with one app that eats power after a few seconds, Freeze and
// Watch logged to stdout. Quits after the seconds given (default 60).
//
//   gjs -m tools/headless/torch.js [seconds]

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const [seconds = '60'] = ARGV;
const loop = new GLib.MainLoop(null, false);
const XML = `<node><interface name="io.github.tomsliikee.Torch">
  <method name="Freeze"><arg type="s" direction="in"/></method>
  <method name="Thaw"><arg type="s" direction="in"/></method>
  <method name="Watch"><arg type="b" direction="in"/></method>
  <property name="State" type="s" access="read"/>
</interface></node>`;
let eating = false;
const state = () => JSON.stringify({
    processor: {percent: eating ? 48.2 : 3.1},
    apps: [{id: 'org.gnome.TextEditor', kind: 'app', cpu: eating ? 45 : 0.1, watts: null, eater: eating, mayFreeze: true, frozen: false}],
    performance: {celsius: 54, gpu: {name: 'NVIDIA', percent: 19, celsius: 62}},
});
const iface = Gio.DBusNodeInfo.new_for_xml(XML).interfaces[0];
let connection = null;
Gio.bus_own_name(Gio.BusType.SESSION, 'io.github.tomsliikee.Torch', Gio.BusNameOwnerFlags.NONE, conn => {
    connection = conn;
    conn.register_object('/io/github/tomsliikee/Torch', iface,
        (c, sender, path, ifaceName, method, params, invocation) => {
            print(`torch: ${method} ${JSON.stringify(params.deepUnpack())}`);
            invocation.return_value(null);
        },
        (c, sender, path, ifaceName, name) => (name === 'State' ? new GLib.Variant('s', state()) : null),
        null);
}, null, null);
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {
    eating = true;
    connection?.emit_signal(null, '/io/github/tomsliikee/Torch', 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
        new GLib.Variant('(sa{sv}as)', ['io.github.tomsliikee.Torch', {State: new GLib.Variant('s', state())}, []]));
    return GLib.SOURCE_REMOVE;
});
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, Number(seconds), () => loop.quit());
loop.run();
