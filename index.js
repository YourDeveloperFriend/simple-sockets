
import ws from 'ws';
import emit from './src/emit';
import rooms from './src/rooms';
import presense from './src/presense';

const ORIG_ON = Symbol('ORIG');
const LISTENERS = Symbol('LISTENERS');

class SimpleSockets {
  constructor(options) {
    this.wss = new WebSocketServer({
      server: options.server,
    });
    if(options.Promise) {
      options.Promise.promisifyAll(this);
    }
    this.rooms = rooms();
    if(options.presense) {
      this.presense = presense(this.rooms);
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
  on(event, fn) {
    if(event === 'connection') {
      this.wss.on(event, socket=> {
        runMiddleware(socket, this.middleware, fn);
      });
    } else {
      this.wss.on(event, fn);
    }
  }
  emitAll(eventName, payload) {

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
    socket[ON] = socket.on;
    socket[LISTENERS] = new Map();
    if(this.presense) {
      this.presense.createPresense(socket, room);
    }
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
      if(socket[LISTENERS].has(message.eventName)) {
        socket[LISTENERS].get(message.eventName).forEach(fn=> fn(message.data, result=> {
          emit(socket, {
            eventName: 'response-' + message.requestToken,
            result,
          });
        }));
      }
    });
    socket.on('close', ()=> {
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
    cb(socket);
  }
  middleware[index](socket, ()=> {
    runMiddleware(socket, middleware, cb, index + 1);
  });
}


export default function simpleSockets(options) {
  return new SimpleSockets(options);
};
