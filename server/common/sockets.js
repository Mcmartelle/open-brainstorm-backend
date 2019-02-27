import socketio from 'socket.io';
import RandExp from 'randexp';

const rooms = {};

const generateRoomName = creatorId => {
  let roomName = null;
  const randExp = new RandExp(/^[A-Z]{5}/);
  while (typeof roomName !== 'string' || rooms[roomName]) {
    roomName = randExp.gen();
  }
  rooms[roomName] = { creatorId };
  return roomName;
};

const sockets = server => {
  const io = socketio(server);
  io.on('connection', socket => {
    console.log(`New connection from ${socket.handshake.address}, id:${socket.id}`);
    socket.on('createRoom', () => {
      const roomName = generateRoomName(socket.id);
      socket.join(roomName, () => {
        socket.emit('roomCreated', { roomName, socketId: socket.id });
        console.log('room created: ', roomName);
        socket.on('idea update', idea => {
          socket.in(roomName).emit('idea update', idea);
        });
        // socket.on(`get ${roomName} data`);
      });
    });
    socket.on('join room', roomName => {
      if (rooms[roomName]) {
        socket.join(roomName, () => {
          console.log('room joined: ', roomName);
          socket.emit('roomJoined', { roomName, socketId: socket.id });
          socket.on('idea update', idea => {
            socket.in(roomName).emit('idea update', idea);
          });
        });
      } else {
        console.log('error', 'The requested brainstorm does not exist');
        socket.emit('error', 'The requested brainstorm does not exist');
      }
    });
  });
};

export default sockets;
