import type { Server } from 'socket.io';
import { DISCOVERY } from '../shared/types/discovery';
import { SERVER_TO_CLIENT_EVENTS } from '../shared/types/protocol';
import { roomDiscovery } from './roomDiscovery';

// One bounded cadence per server; catches creation, leave, host transfer, full rooms and TTL expiry.
// Only changed lists are sent. Locations and private hands never enter this payload.
export function startDiscoveryBroadcast(io: Server): () => void {
  const previous = new Map<string, string>();
  const timer = setInterval(() => {
    roomDiscovery.prune();
    for (const id of previous.keys()) {
      if (!io.sockets.sockets.has(id)) previous.delete(id);
    }
    for (const [id, socket] of io.sockets.sockets) {
      if (!socket.data.discoveryBrowsing) continue;
      const rooms = roomDiscovery.nearby(id);
      const serialized = JSON.stringify(rooms);
      if (previous.get(id) !== serialized) {
        previous.set(id, serialized);
        socket.emit(SERVER_TO_CLIENT_EVENTS.nearbyRooms, rooms);
      }
    }
  }, DISCOVERY.publishMs);
  timer.unref();
  return () => clearInterval(timer);
}
