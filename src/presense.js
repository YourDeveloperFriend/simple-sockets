
import _ from 'lodash';
import {v4} from 'uuid';
import {EventEmitter} from 'events';
import batchify from './batchify';

const defaultOptions = {
  pingInterval: 15000,
};

class PresenceManager extends EventEmitter {
  constructor(options) {
    super();
    this.options = _.merge({}, defaultOptions, options);
    this.clientId = v4();
    this.myNumPresent = new Map();
    this.allNumPresent = new Map();
    this.presenses = new WeakMap();
  }
  connect({pubClient, subClient}) {
    this.pubClient = pubClient;
    this.subClient = subClient;
    if(subClient) {
      this.allNumPresentCache = new Map();
      subClient.subscribe('numPresent-start');
      subClient.subscribe('numPresent-stop');
      subClient.subscribe('numPresent-ping');
      subClient.subscribe('numPresent-update');
      subClient.subscribe('numPresent-full-update');
      const fullUpdateLoadResponse = 'numPresent-full-update-response-' + this.clientId;
      subClient.subscribe(fullUpdateLoadResponse);
      const requestFullUpdate = 'numPresent-request-full-update-' + this.clientId;
      subClient.subscribe(requestFullUpdate);
      subClient.on('message', this._onMessage = (channel, message)=> {
        try {
          message = JSON.parse(message);
        } catch (e) {
          return;
        }
        if(!message.clientId || message.clientId === this.clientId) {
          return;
        }
        const {clientId} = message;
        if(channel === requestFullUpdate) {
          this._publishFullUpdate(clientId);
          return;
        }
        if(this.allNumPresentCache.has(clientId)) {
          this._resetTimer(clientId);
        }
        if(channel === 'numPresent-start') {
          this.allNumPresentCache.set(clientId, {
            cache: new Map(),
            timer: this._setTimer(clientId),
          });
          this._publishFullUpdate(clientId);
          return;
        } else if(channel === 'numPresent-stop') {
          this._clearCache(clientId);
        } else if(!this.allNumPresentCache.has(clientId) && channel !== fullUpdateLoadResponse) {
          this.allNumPresentCache.set(clientId, {
            cache: new Map(),
            timer: this._setTimer(clientId),
          });
          this._publish('numPresent-request-full-update-' + clientId);
        } else {
          switch(channel) {
            case fullUpdateLoadResponse:
              this.allNumPresentCache.set(clientId, {
                cache: new Map(),
                timer: this._setTimer(clientId),
              });
            case 'numPresent-full-update':
              this._clearAllRooms(clientId);
            case 'numPresent-update':
              const cache = this.allNumPresentCache.get(clientId).cache;
              _.forEach(message.rooms, (numPresent, room)=> {
                const difference = numPresent - (cache.get(room) || 0);
                if(numPresent) {
                  cache.set(room, numPresent);
                } else {
                  cache.delete(room);
                }
                this._offsetNumPresent(room, difference);
              });
              break;
          }
        }
      });
    }
    if(pubClient) {
      this._publish('numPresent-start');
      this.interval = setInterval(()=> {
        this._publish('numPresent-ping');
      }, this.options.pingInterval);
    }
  }
  _setTimer(clientId) {
    return setTimeout(()=> {
      this._clearCache(clientId);
    }, this.options.pingInterval * 2.5);
  }
  _resetTimer(clientId) {
    const cache = this.allNumPresentCache.get(clientId);
    clearTimeout(cache.timer);
    cache.timer = this._setTimer(clientId);
  }
  _clearCache(clientId) {
    const {timer} = this.allNumPresentCache.get(clientId);
    clearTimeout(timer);
    this._clearAllRooms(clientId);
    this.allNumPresentCache.delete(clientId);
  }
  _clearAllRooms(clientId) {
    for(const [room, numPresent] of this.allNumPresentCache.get(clientId).cache.entries()) {
      this._offsetNumPresent(room, -numPresent);
    }
    this.allNumPresentCache.get(clientId).cache = new Map();
  }
  _offsetNumPresent(room, offset) {
    this.allNumPresent.set(room, (this.allNumPresent.get(room) || 0) + offset);
    this._notifyMe(room);
  }
  disconnect() {
    this.disconnected = true;
    if(this.subClient) {
      this.subClient.removeEventListener('message', this._onMessage);
    }
    return this._publish('numPresent-stop');
  }
  createPresense(socket, room) {
    if(!this.myNumPresent.has(room)) {
      this.myNumPresent.set(room, new Set());
    }
    const roomSet = this.myNumPresent.get(room);
    if(!roomSet.has(socket)) {
      if(!this.presenses.has(socket)) {
        this.presenses.set(socket, new Set());
      }
      this.presenses.get(socket).add(room);
      roomSet.add(socket);
      this._offsetNumPresent(room, 1);
      this._notifyOthers(room);
    }
  }
  leavePresense(socket, room) {
    if(this.myNumPresent.has(room)) {
      const roomSet = this.myNumPresent.get(room);
      if(roomSet.delete(socket)) {
        if(roomSet.size === 0) {
          this.myNumPresent.delete(room);
        }
        this._offsetNumPresent(room, -1);
        this._notifyOthers(room);
      }
    }
    if(this.presenses.has(socket)) {
      this.presenses.get(socket).delete(room);
    }
  }
  leaveAll(socket) {
    if(this.presenses.has(socket)) {
      for(const room of this.presenses.get(socket)) {
        this.leavePresense(socket, room);
      }
      this.presenses.delete(socket);
    }
  }
  onNumPresent(room, cb, init = false) {
    this.on('numPresent-key-' + room, cb);
    if(init) {
      cb(this.allNumPresent.get(room) || 0);
    }
    return ()=> {
      this.removeListener('numPresent-key-' + room, cb);
    };
  }
  _notifyNumPresent(room) {
    this._notifyMe(room);
    this._notifyOthers(room);
  }
  @batchify
  _notifyMe(rooms) {
    if(!this.disconnected) {
      rooms = _.uniq(rooms);
      rooms.forEach(room=> {
        const numPresent = this.allNumPresent.get(room);
        this.emit('numPresent-key-' + room, numPresent);
      });
    }
  }
  @batchify
  _notifyOthers(rooms) {
    if(!this.disconnected) {
      rooms = _(rooms)
      .uniq()
      .invert()
      .mapValues((a, room)=> _.get(this.myNumPresent.get(room), 'size', 0))
      .value();
      this._publish('numPresent-update', {
        rooms,
      });
    }
  }
  @batchify.withTimeout(50)
  _publishFullUpdate(clientIds) {
    const rooms = {};
    for(const [room, set] of this.myNumPresent.entries()) {
      rooms[room] = set.size;
    }
    if(clientIds.length > 2) {
      this._publish('numPresent-full-update', {rooms});
    } else {
      clientIds.forEach(clientId=> {
        this._publish('numPresent-full-update-response-' + clientId, {rooms});
      });
    }
  }
  _publish(channel, message) {
    if(!this.pubClient) return;
    message = JSON.stringify(_.merge({}, message, {clientId: this.clientId}));
    return this.pubClient.publishAsync(channel, message);
  }
}

export default function createPresense(...args) {
  return new PresenceManager(...args);
}
