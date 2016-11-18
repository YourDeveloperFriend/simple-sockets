
export default function createPubStub() {
  const globals = new Set();
  return {
    createPub,
    createSub,
    createPubSub,
  };
  function createPubSub() {
    return {
      pubClient: createPub(),
      subClient: createSub(),
    };
  }
  function createPub() {
    return {
      publish(channel, msg) {
        for(const global of globals) {
          global(channel, msg);
        }
      },
    };
  }
  function createSub() {
    const channels = new Set();
    const handlers = [];
    const subClient = {
      on(eventName, fn) {
        if(eventName === 'message') {
          handlers.push(fn);
        }
      },
      subscribe(channel) {
        channels.add(channel);
      },
      unsubscribe(channel) {
        channels.remove(channel);
      },
    }
    globals.add((channel, msg)=> {
      if(channels.has(channel)) {
        for(const handler of handlers) {
          handler(channel, msg);
        }
      }
    });
    return subClient;
  }
};
