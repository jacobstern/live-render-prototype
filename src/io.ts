import http from 'http';
import SocketIO from 'socket.io';

export function useSocketIO(server: http.Server) {
  const io = SocketIO(server);
  io.on('connection', socket => {
    socket.emit('hello', { data: 'Hello world!' });
  });
}

export default useSocketIO;
