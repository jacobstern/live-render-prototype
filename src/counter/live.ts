import { handleNamespace } from '../handle-namespace';
import { BasePayload } from '../live-render';

interface TemplateData {
  count: number;
}

export default handleNamespace('/live/counter', namespace => {
  namespace.on('connect', socket => {
    socket.on('increment', (payload: BasePayload) => {
      const data = payload.data as TemplateData;
      data.count++;
      socket.emit('live:update', data);
    });

    socket.on('decrement', (payload: BasePayload) => {
      const data = payload.data as TemplateData;
      if (data.count > 0) {
        data.count--;
        socket.emit('live:update', data);
      }
    });
  });
});
