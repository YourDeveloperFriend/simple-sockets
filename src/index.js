
import _ from 'lodash';
import {Server} from 'ws';
import emit from './emit';
import rooms from './rooms';
import presense from './presense';

const ORIG_ON = Symbol('ORIG');
const ORIG_EMIT = Symbol('ORIG_EMIT');
const LISTENERS = Symbol('LISTENERS');
const numPresentSubscriptions = Symbol('numPresentSubscriptions');

class SimpleSockets {
  constructor(options) {
    this.wss = new Server({
      server: options.server,
    });
    if(options.Promise) {
      options.Promise.promisifyAll(this.wss);
    }
    this.rooms = rooms();
    if(options.presense) {
      this.presense = presense();
    }
    this.middleware = [::this.modifySocket];
    const {pubClient, subClient} = options;
    if(pubClient && subClient) {
      this.rooms.connect({pubClient, subClient});
      if(this.presense) {
        this.presense.connect({pubClient, subClient});
      }
    }
  }
  disconnect() {
    if(this.presense) {
      this.presense.disconnect();
    }
    return this.wss.closeAsync();
  }
  on(event, fn) {
    if(event === 'connection') {
      this.wss.on(event, socket=> {
        runMiddleware(socket, this.middleware, fn);
      });
    } else {
      this.wss.on(event, fn);
    }
  }
  emitTo(room, eventName, payload) {
    this.rooms.emitTo(room, eventName, data);
  }
  use(fn) {
    this.middleware.push(fn);
  }
  close(...args) {
    this.wss.close(...args);
  }

  modifySocket(socket, next) {
    socket[ORIG_ON] = socket.on;
    socket[LISTENERS] = new Map();
    socket[ORIG_EMIT] = socket.emit;
    socket[numPresentSubscriptions] = {};
    socket.emit = (channel, data)=> {
      console.log('attempting to emit', channel);
      if(['close', 'error', 'message'].includes(channel)) {
        socket[ORIG_EMIT](channel, data);
      } else {
        emit(socket, channel, data);
      }
    };
    socket.join = room=> {
      socket.joinRoom(room);
      socket.joinPresense(room);
    };
    socket.leave = room=> {
      socket.leaveRoom(room);
      socket.leavePresense(room);
    };
    socket.leaveAll = ()=> {
      socket.leaveAllRooms();
      socket.leaveAllPresense();
    };
    socket.joinRoom = room=> {
      this.rooms.joinRoom(socket, room);
    };
    socket.leaveRoom = room=> {
      this.rooms.leaveRoom(socket, room);
    };
    socket.leaveAllRooms = ()=> {
      this.rooms.leaveAllRooms(socket);
    };
    socket.subscribeToNumPresent = (room, key = room)=> {
      if(this.presense) {
        const off = this.presense.onNumPresent(room, numPresent=> {
          emit(socket, key, numPresent);
        }, true);
        _.get(socket[numPresentSubscriptions], `${room}.${key}`, off);
      }
    };
    socket.unsubscribeToNumPresent = (room, key = room)=> {
      delete socket[numPresentSubscriptions][room][key];
      if(_.keys(socket[numPresentSubscriptions][room]).length === 0) {
        delete socket[numPresentSubscriptions][room];
      }
    };
    socket.joinPresense = room=> {
      if(!this.presense) return;
      this.presense.createPresense(socket, room);
    };
    socket.leavePresense = room=> {
      if(!this.presense) return;
      this.presense.leavePresense(socket, room);
    };
    socket.leaveAllPresense = ()=> {
      if(!this.presense) return;
      this.presense.leaveAll(socket);
    };
    socket.on('message', message=> {
      try {
        message = JSON.parse(message);
      } catch(e) {
        return;
      }
      if(socket[LISTENERS].has(message.eventName)) {
        socket[LISTENERS].get(message.eventName).forEach(fn=> {
          if(message.requestToken) {
            fn(message.data, result=> {
              emit(socket, 'response-' + message.requestToken, result);
            });
          } else {
            fn(message.data);
          }
        });
      }
    });
    socket.on('close', ()=> {
      _.forEach(socket[numPresentSubscriptions], offs=> {
        _.forEach(offs, off=> {
          off();
        });
      });
      delete socket[numPresentSubscriptions];
      socket.leaveAll();
    });
    socket.on = function on(eventName, fn) {
      if(['close', 'error'].includes(eventName)) {
        socket[ORIG_ON](eventName, fn);
      } else {
        if(!socket[LISTENERS].has(eventName)) {
          socket[LISTENERS].set(eventName, []);
        }
        socket[LISTENERS].get(eventName).push(fn);
      }
    };
    next();
  }
}

function runMiddleware(socket, middleware, cb, index = 0) {
  if(middleware.length <= index) {
    return cb(socket);
  }
  middleware[index](socket, ()=> {
    runMiddleware(socket, middleware, cb, index + 1);
  });
}


export default function simpleSockets(options) {
  return new SimpleSockets(options);
};
