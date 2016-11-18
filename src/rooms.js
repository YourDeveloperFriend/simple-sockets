
import {v4} from 'uuid';
import emit from './emit';

const ROOMS_KEY = Symbol('ROOMS');
const defaultChannelPrefix = 'socket-rooms-';

class RoomManager {
  constructor({channelPrefix = defaultChannelPrefix} = {}) {
    this.channelPrefix = channelPrefix;
    this.clientId = v4();
    this.rooms = new Map();
  }
  connect({pubClient, subClient}) {
    this.pubClient = pubClient;
    this.subClient = subClient;
    subClient.on('message', (channel, message)=> {
      if(channel.startsWith(this.channelPrefix)) {
        const room = channel.substring(this.channelPrefix.length);
        const payload = JSON.parse(message);
        if(payload.clientId !== this.clientId) {
          this.emitToMe(room, payload.eventName, payload.data);
        }
      }
    });
  }
  emitTo(room, eventName, data) {
    this.emitToMe(room, eventName, data);
    this.emitToOthers(room, eventName, data);
  }
  emitToMe(room, eventName, data) {
    if(this.rooms.has(room)) {
      for(let socket of this.rooms.get(room)) {
        emit(socket, eventName, data);
      }
    }
  }
  emitToOthers(room, eventName, data) {
    if(!this.pubClient) return;
    this.pubClient.publish(this.channelPrefix + room, JSON.stringify({
      clientId: this.clientId,
      eventName,
      data,
    }));
  }
  joinRoom(socket, room) {
    if(!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
      this.startListening(room);
    }
    this.rooms.get(room).add(socket);
    if(!socket[ROOMS_KEY]) {
      socket[ROOMS_KEY] = new Set();
    }
    socket[ROOMS_KEY].add(room);
  }
  leaveRoom(socket, room) {
    if(this.rooms.has(room)) {
      const roomSet = this.rooms.get(room)
      roomSet.delete(socket);
      if(!roomSet.size) {
        this.rooms.delete(room);
        this.stopListening(room);
      }
    }
    socket[ROOMS_KEY] && socket[ROOMS_KEY].delete(room);
  }
  leaveAllRooms(socket, room) {
    if(socket[ROOMS_KEY]) {
      for(let room of socket[ROOMS_KEY]) {
        this.leaveRoom(socket, room);
      }
      delete socket[ROOMS_KEY];
    }
  }
  startListening(room) {
    if(!this.subClient) return;
    this.subClient.subscribe(this.channelPrefix + room);
  }

  stopListening(room) {
    if(!this.subClient) return;
    this.subClient.unsubscribe(this.channelPrefix + room);
  }
}

export default function createRooms(...args) {
  return new RoomManager(...args);
};
