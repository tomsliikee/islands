// A stand-in music player on the session bus for the headless shell: one
// MPRIS player that plays a track, answers PlayPause, and quits after
// the number of seconds given (default 60).
//
//   gjs -m tools/headless/mpris.js [seconds] [cover file]

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const [seconds = '60', cover = ''] = ARGV;
const loop = new GLib.MainLoop(null, false);
const XML = `<node>
<interface name="org.mpris.MediaPlayer2">
  <property name="Identity" type="s" access="read"/>
  <property name="CanRaise" type="b" access="read"/>
  <property name="DesktopEntry" type="s" access="read"/>
</interface>
<interface name="org.mpris.MediaPlayer2.Player">
  <method name="PlayPause"/><method name="Play"/><method name="Pause"/><method name="Next"/><method name="Previous"/>
  <property name="PlaybackStatus" type="s" access="read"/>
  <property name="Metadata" type="a{sv}" access="read"/>
  <property name="Position" type="x" access="read"/>
  <property name="CanGoNext" type="b" access="read"/>
  <property name="CanGoPrevious" type="b" access="read"/>
  <property name="CanPlay" type="b" access="read"/>
  <property name="CanPause" type="b" access="read"/>
</interface>
</node>`;

let status = 'Playing';
const metadata = () => new GLib.Variant('a{sv}', {
    'mpris:trackid': new GLib.Variant('o', '/test/track/1'),
    'xesam:title': new GLib.Variant('s', 'Midnight Drive'),
    'xesam:artist': new GLib.Variant('as', ['Low Tide']),
    'mpris:length': new GLib.Variant('x', 190_000_000),
    ...(cover ? {'mpris:artUrl': new GLib.Variant('s', `file://${cover}`)} : {}),
});
const properties = {
    Identity: () => new GLib.Variant('s', 'Test Player'),
    CanRaise: () => new GLib.Variant('b', false),
    DesktopEntry: () => new GLib.Variant('s', ''),
    PlaybackStatus: () => new GLib.Variant('s', status),
    Metadata: metadata,
    Position: () => new GLib.Variant('x', 72_000_000),
    CanGoNext: () => new GLib.Variant('b', true),
    CanGoPrevious: () => new GLib.Variant('b', true),
    CanPlay: () => new GLib.Variant('b', true),
    CanPause: () => new GLib.Variant('b', true),
};
const info = Gio.DBusNodeInfo.new_for_xml(XML);
Gio.bus_own_name(Gio.BusType.SESSION, 'org.mpris.MediaPlayer2.islandstest', Gio.BusNameOwnerFlags.NONE, connection => {
    for (const iface of info.interfaces) {
        connection.register_object('/org/mpris/MediaPlayer2', iface,
            (conn, sender, path, ifaceName, method, params, invocation) => {
                if (['PlayPause', 'Play', 'Pause'].includes(method)) {
                    status = method === 'Play' || (method === 'PlayPause' && status !== 'Playing') ? 'Playing' : 'Paused';
                    conn.emit_signal(null, path, 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
                        new GLib.Variant('(sa{sv}as)', ['org.mpris.MediaPlayer2.Player', {PlaybackStatus: properties.PlaybackStatus()}, []]));
                }
                invocation.return_value(null);
            },
            (conn, sender, path, ifaceName, name) => properties[name]?.() ?? null,
            null);
    }
}, null, null);
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, Number(seconds), () => loop.quit());
loop.run();
