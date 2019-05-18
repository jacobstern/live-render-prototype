import { LiveGateway } from '../live-render-express';

const gateway = new LiveGateway();

interface EventStreamState {
  streaming: boolean;
}

gateway.on('startStreaming', client => {
  client.update({ streaming: true });
  client.on('stopStreaming', () => {
    client.update({ streaming: false });
  });
});

export default gateway;
