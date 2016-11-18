
import _ from 'lodash';
import createPresense from './presense';
import createRooms from './presense';
import should from 'should';
import sinon from 'sinon';
import createPubStub from '../test-utils/pubstub';

describe('presense', function() {
  let clock = null;
  beforeEach(()=> clock = sinon.useFakeTimers());
  afterEach(()=> clock.restore());
  it('should join a room', function() {
    const presenses = createPresense();
    const room = 'booyaroom';
    const a = {};
    const events = [];
    presenses.onNumPresent(room, num=> events.push(num));
    presenses.createPresense(a, room);
    presenses._notifyMe.flush();
    events.should.deepEqual([
      1,
    ]);
  });
  it('shouldnt join the same room twice', ()=> {
    const presenses = createPresense();
    const room = 'booyaroom';
    const a = {};
    const events = [];
    presenses.onNumPresent(room, num=> events.push(num));
    presenses.createPresense(a, room);
    presenses.createPresense(a, room);
    presenses._notifyMe.flush();
    events.should.deepEqual([
      1,
    ]);
  });
  it('should leave the room', ()=> {
    const presenses = createPresense();
    const room = 'booyaroom';
    const a = {};
    const events = [];
    presenses.onNumPresent(room, num=> events.push(num));
    presenses.createPresense(a, room);
    presenses._notifyMe.flush();
    presenses.leavePresense(a, room);
    presenses._notifyMe.flush();
    events.should.deepEqual([
      1,
      0,
    ]);
    // Clean up myNumPresent
    presenses.myNumPresent.should.have.property('size', 0);
  });
  it('should leave all rooms', ()=> {
    const presenses = createPresense();
    const baseroom = 'booyaroom';
    const a = {};
    const events = {};
    _.times(3, i=> {
      const room = baseroom + i;
      events[room] = [];
      presenses.createPresense(a, room);
      presenses.onNumPresent(room, num=> events[room].push(num));
    });
    presenses.leaveAll(a);
    presenses._notifyMe.flush();
    events.should.deepEqual(_.merge(..._.times(3, i=> ({[baseroom + i]: [0]}))));
    // Clean up myNumPresent
    presenses.myNumPresent.should.have.property('size', 0);
  });

  it('should interact with redis', function() {
    const {createPubSub} = createPubStub();
    const room = 'booya';
    const pingInterval = 5;
    const [a, b, c] = _.times(3, ()=> {
      const presenses = createPresense({pingInterval});
      presenses.connect(createPubSub());
      return presenses;
    });
    clock.tick(1);
    a.allNumPresentCache.should.have.property('size', 2);
    // clearTimeout(b.interval);
    const events = [];
    a.onNumPresent(room, numPresent=> {
      events.push(numPresent);
    });
    const member = {};
    b.createPresense(member, room);
    clock.tick(1);
    events.should.deepEqual([
      1,
    ]);
    b.leavePresense(member, room);
    clock.tick(1);
    events.should.deepEqual([
      1,
      0,
    ]);
    b.createPresense(member, room);
    c.createPresense(member, room);
    clock.tick(1);
    events.should.deepEqual([
      1,
      0,
      2,
    ]);
    const presenses = createPresense({pingInterval});
    const events1 = [];
    presenses.onNumPresent(room, numPresent=> {
      events1.push(numPresent);
    });
    presenses.connect(createPubSub());
    clock.tick(60);
    events1.should.deepEqual([
      2,
    ]);
  });
});



