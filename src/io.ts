import http from 'http';
import SocketIO from 'socket.io';
import useCounter from './counter/live';

export function useSocketIO(server: http.Server) {
  const io = SocketIO(server);
  useCounter(io);
}

export default useSocketIO;
