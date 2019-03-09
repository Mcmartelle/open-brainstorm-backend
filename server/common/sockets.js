import socketio from 'socket.io';
import RandExp from 'randexp';
import Redis from 'ioredis';

const redis = new Redis();

const rooms = {};

const generateRoomName = creatorId => {
  let roomName = null;
  const randExp = new RandExp(/^[A-Z]{5}/);
  // avoiding any room names that already exist
  while (typeof roomName !== 'string' || rooms[roomName]) {
    roomName = randExp.gen();
  }
  rooms[roomName] = { creatorId };
  return roomName;
};

const sockets = server => {
  const io = socketio(server, { path: '/api/socket.io' });
  io.on('connection', socket => {
    function joinRoom(roomName, isCreator = false) {
      if (rooms[roomName]) {
        socket.join(roomName, () => {
          console.log(socket.id, ' joined room: ', roomName);
          socket.emit('roomJoined', { roomName, isCreator, creatorId: rooms[roomName].creatorId, socketId: socket.id });
          socket.on('idea update', (idea, isNewIdea) => {
            console.log('idea: ', idea);
            socket.in(roomName).emit('idea update', idea, isNewIdea);
          });
          // Getting full state from the brainstorm creator
          if (isCreator) {
            socket.on('brainstorm state send', (requesterId, brainstormState) => {
              redis.set(roomName, JSON.stringify(brainstormState), 'EX', process.env.REDIS_EXPIRATION_TIME); // testing redis
              redis.get(roomName, function (err, result) {
                console.log(JSON.parse(result));
              });
              io.to(`${requesterId}`).emit('brainstorm state sent', brainstormState);
            });
          } else {
            socket.on('brainstorm state request', creatorId => {
              io.to(`${creatorId}`).emit('brainstorm state requested', socket.id);
            });
          }
        });
      } else {
        console.log('Error: The requested brainstorm does not exist');
        socket.emit('room not found', 'The requested brainstorm does not exist');
      }
    }
    socket.emit('connected', socket.id);
    console.log(`New connection from ${socket.handshake.address}, id:${socket.id}`);
    socket.on('createRoom', () => {
      const roomName = generateRoomName(socket.id);
      joinRoom(roomName, true);
    });
    socket.on('join room', joinRoom);
  });
};

export default sockets;
