import socketio from 'socket.io';
import RandExp from 'randexp';
import Redis from 'ioredis';

const redis = new Redis();

async function generateRoomName(creatorId) {
  let roomName = null;
  const randExp = new RandExp(/^[0-9]{6}/);
  roomName = randExp.gen();
  const result = await redis.get(roomName);
  console.log('result: ', result);
  // avoiding any room names that already exist
  if (result === null) {
    console.log(`setting room ${roomName} to redis`);
    redis.set(roomName, creatorId, 'EX', process.env.REDIS_EXPIRATION_TIME);
    return roomName;
  }
  console.log('trying again');
  return generateRoomName(creatorId);
}

const sockets = server => {
  const io = socketio(server, { path: '/api/socket.io' });
  io.on('connection', socket => {
    async function joinRoom(roomName) {
      const creatorId = await redis.get(roomName);
      if (typeof creatorId === 'string') {
        socket.join(roomName, () => {
          console.log(socket.id, ' joined room: ', roomName);
          socket.emit('roomJoined', { roomName, isCreator: false, creatorId, socketId: socket.id });
          socket.on('idea update', (idea, isNewIdea) => {
            console.log('idea: ', idea);
            socket.in(roomName).emit('idea update', idea, isNewIdea);
          });
          // Getting full state from the brainstorm creator
          socket.on('brainstorm state request', roomId => {
            redis.get(roomId).then(roomCreatorId => {
              io.to(`${roomCreatorId}`).emit('brainstorm state requested', socket.id);
            });
          });
        });
      } else {
        console.log('Error: The requested brainstorm does not exist');
        socket.emit('room not found', 'The requested brainstorm does not exist');
      }
    }

    function creatorJoinRoom(roomName, creatorId) {
      socket.join(roomName, () => {
        console.log(socket.id, ' creator joined room: ', roomName);
        redis.set(roomName, creatorId);
        socket.emit('roomJoined', { roomName, isCreator: true, creatorId, socketId: socket.id });
        socket.on('idea update', (idea, isNewIdea) => {
          console.log('idea: ', idea);
          socket.in(roomName).emit('idea update', idea, isNewIdea);
        });
        socket.on('brainstorm state send', (requesterId, brainstormState) => {
          io.to(`${requesterId}`).emit('brainstorm state sent', brainstormState);
        });
      });
    }

    socket.emit('connected', socket.id);
    console.log(`New connection from ${socket.handshake.address}, id:${socket.id}`);
    socket.on('createRoom', () => {
      generateRoomName(socket.id).then(roomName => {
        creatorJoinRoom(roomName, socket.id);
      });
    });
    socket.on('creator rejoin', roomName => {
      creatorJoinRoom(roomName, socket.id);
    });
    socket.on('join room', joinRoom);
  });
};

export default sockets;
