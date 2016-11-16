
export default function emit(socket, eventName, data) {
  socket.send(JSON.stringify({eventName, data}));
}
