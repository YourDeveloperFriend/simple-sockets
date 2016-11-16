
import {v4} from 'uuid';

const PRESENSES = Symbol('PRESENSES');

class PresenceManager {
  constructor() {
    this.myNumPresent = new Map();
  }
  connect({pubClient, subClient}) {
    this.pubClient = pubClient;
    this.subClient = subClient;
    if(subClient) {
      this.allNumPresentCache = new Set();
      this.interval = setInterval(()=> {
        this.publish('numPresent-ping', {system: this.systemId});
      }, PING_INTERVAL);
    }
  }
  createPresense(socket, room) {
    if(!this.myNumPresent.has(room)) {
      this.myNumPresent.set(room, new Set());
    }
    const roomSet = this.myNumPresent.get(room);
    roomSet.add(socket);
    socket[PRESENSES] = socket[PRESENSES] || new Set();
    socket[PRESENSES].add(room);
    this.notifyNumPresent(room, roomSet.size);
  }
  leavePresense(socket, room) {
    if(this.myNumPresent.has(room)) {
      const roomSet = this.myNumPresent.get(room);
      roomSet.delete(socket);
      if(roomSet.size === 0) {
        this.myNumPresent.delete(Room);
      }
      this.notifyNumPresent(room, roomSet.size);
    }
    if(socket[PRESENSES]) {
      socket[PRESENSES].delete(room);
    }
  }
  notifyNumPresent(room, numPresent) {
    this.notifyMe(room, numPresent);
    this.publish('numPresent-update', {
      system: this.systemId,
      room,
      numPresent,
    });
  }
  notifyMe(room, numPresent) {
    this.rooms.emitToMe(room, 'numPresent', {numPresent});
  }
  leaveAll(socket) {
    for(const room of socket[PRESENSES]) {
      this.leavePresense(socket, room);
    }
    delete socket[PRESENSES];
  }
  publish(channel, message) {
    if(!this.pubClient) return;
    this.pubClient.publish(channel, JSON.stringify(message));
  }
}

export default function presense(...args) {
  return new PresenceManager(...args);
}
