const loopback = url => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
export function relayOrigin(pageHref, configured = '') {
  const page = new URL(pageHref);
  if (!configured) return loopback(page) ? page.origin : null;
  const relay = new URL(configured);
  if (relay.username || relay.password || relay.pathname !== '/' || relay.search || relay.hash) throw new Error('invalid-relay-origin');
  if (relay.protocol !== 'https:' && !(relay.protocol === 'http:' && loopback(page) && loopback(relay))) throw new Error('https-relay-required');
  return relay.origin;
}
export function invitationFrom(pageHref) {
  const params = new URLSearchParams(new URL(pageHref).hash.slice(1));
  const room = (params.get('room') || '').toUpperCase();
  return { room: /^[A-F0-9]{32}$/.test(room) ? room : '' };
}
export function invitationURL(pageHref, room) {
  if (!/^[A-F0-9]{32}$/.test(room)) throw new Error('invalid-room');
  const url = new URL(pageHref); url.search = ''; url.hash = new URLSearchParams({ room }).toString(); return url.href;
}
