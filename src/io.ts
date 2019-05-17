import http from 'http';
import SocketIO from 'socket.io';
import liveRender from './live-render';

export function useSocketIO(server: http.Server) {
  const io = SocketIO(server);
  liveRender.listen(io.of('/live'));
}

export default useSocketIO;
