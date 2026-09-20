export type ConnectionState = 'connecting' | 'live' | 'disconnected' | 'polling' | 'demo' | 'paused';
export type LiveEvent = { type: 'bus_position' | 'arrival_update' | 'bus_removed' | 'arrival_removed' | 'snapshot_end'; channel: string; [key: string]: unknown };
// React Native responds to the server's WebSocket ping control frames automatically.
// No application-level ping: the backend accepts subscribe/unsubscribe only.
export function subscribeLive({ url, channel, onEvent, onState, onReconnect, createSocket = url => new WebSocket(url) }: {
  url: string; channel: string; onEvent: (event: LiveEvent) => void;
  onState: (state: ConnectionState) => void; onReconnect: () => Promise<void>;
  createSocket?: (url: string) => WebSocket;
}) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let connectedBefore = false;
  const reconnect = () => {
    if (stopped || retry) return;
    onState('disconnected');
    retry = setTimeout(() => { retry = undefined; void connect(); }, Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)));
  };
  const connect = async () => {
    if (stopped) return;
    onState('connecting');
    if (connectedBefore) {
      try { await onReconnect(); } catch { reconnect(); return; }
      if (stopped) return;
    }
    let current: WebSocket;
    try { current = createSocket(url); socket = current; } catch { reconnect(); return; }
    const fail = () => {
      if (socket !== current || stopped) return;
      clearTimeout(deadline); socket = undefined;
      current.onclose = null; current.onerror = null; current.onmessage = null; current.onopen = null;
      try { current.close(); } catch { /* Already closed. */ }
      reconnect();
    };
    deadline = setTimeout(fail, 15000);
    current.onopen = () => {
      if (stopped || socket !== current) return;
      connectedBefore = true;
      try { current.send(JSON.stringify({ type: 'subscribe', channels: [channel] })); } catch { fail(); }
    };
    current.onmessage = event => {
      if (stopped || socket !== current) return;
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === 'error') { fail(); return; }
        if (message.type === 'subscribed' && Array.isArray(message.channels) && message.channels.includes(channel)) return;
        if (message.channel !== channel) return;
        if (message.type === 'snapshot_end') { clearTimeout(deadline); attempts = 0; onState('live'); }
        if (['bus_position', 'arrival_update', 'bus_removed', 'arrival_removed', 'snapshot_end'].includes(message.type)) onEvent(message);
      } catch { /* Ignore malformed events. The subscription deadline still applies. */ }
    };
    current.onerror = fail;
    current.onclose = fail;
  };
  void connect();
  return () => {
    stopped = true; clearTimeout(retry); clearTimeout(deadline);
    if (socket) {
      socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null;
      try { if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'unsubscribe', channels: [channel] })); } catch { /* Socket already lost. */ }
      try { socket.close(); } catch { /* Socket already closed. */ }
    }
  };
}
