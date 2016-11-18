
import createRooms from './rooms';
import should from 'should';
import createPubStub from '../test-utils/pubstub';

describe('rooms', function() {
  function createFakeSocket() {
    return {
      messages: [],
      send(msg) {
        this.messages.push(JSON.parse(msg));
      },
    };
  }
  it('should join a room', function() {
    const rooms = createRooms();
    const room = 'booyaroom';
    const fakeSocket = createFakeSocket();

    rooms.joinRoom(fakeSocket, room);
    rooms.emitTo(room, 'ape', {booya: 'man'});
    rooms.emitTo('fakeroom', 'what', {booya: 'other'});
    rooms.leaveRoom(fakeSocket, room);
    rooms.emitTo(room, 'cool', {booya: 'man'});
    rooms.joinRoom(fakeSocket, room);
    rooms.emitTo(room, 'fakes', {booya: 'geez'});
    rooms.leaveAllRooms(fakeSocket);
    rooms.emitTo(room, 'cool', {booya: 'man'});

    const messages = fakeSocket.messages
    messages.should.have.property('length', 2);
    messages[0].should.deepEqual({
      eventName: 'ape',
      data: {
        booya: 'man',
      },
    });
    messages[1].should.deepEqual({
      eventName: 'fakes',
      data: {
        booya: 'geez',
      },
    });
  });
  it('should interact with redis', function() {
    const rooms1 = createRooms();
    const rooms2 = createRooms();
    const room = 'booyaroom';
    const fakeSocket1 = createFakeSocket();
    const fakeSocket2 = createFakeSocket();
    const {createPubSub} = createPubStub();
    rooms1.connect(createPubSub());
    rooms2.connect(createPubSub());
    rooms1.joinRoom(fakeSocket1, room);
    rooms1.joinRoom(fakeSocket1, room + '1');
    rooms2.joinRoom(fakeSocket2, room);
    rooms2.joinRoom(fakeSocket2, room + '2');

    rooms1.emitTo(room, 'booya', {five: 'four'});
    rooms2.emitTo(room, 'sweet', {what: 'wait'});
    rooms1.emitTo(room + '1', 'silly', {who: 'no'});
    rooms2.emitTo(room + '2', 'friend', {lll: 5});
    rooms2.emitTo(room + '1', 'silly', {who: 'no'});
    rooms1.emitTo(room + '2', 'friend', {lll: 5});

    fakeSocket1.messages.should.deepEqual([{
      eventName: 'booya',
      data: {
        five: 'four',
      },
    }, {
      eventName: 'sweet',
      data: {
        what: 'wait',
      },
    }, {
      eventName: 'silly',
      data: {
        who: 'no',
      },
    }, {
      eventName: 'silly',
      data: {
        who: 'no',
      },
    }]);
    fakeSocket2.messages.should.deepEqual([{
      eventName: 'booya',
      data: {
        five: 'four',
      },
    }, {
      eventName: 'sweet',
      data: {
        what: 'wait',
      },
    }, {
      eventName: 'friend',
      data: {
        lll: 5,
      },
    }, {
      eventName: 'friend',
      data: {
        lll: 5,
      },
    }]);

  });
});

