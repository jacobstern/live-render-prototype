import { LiveGateway } from '../live-render-express';

const gateway = new LiveGateway();

interface CounterState {
  count: number;
}

gateway.on('increment', (client, message) => {
  const templateData = message.templateData as CounterState;
  templateData.count++;
  client.update(templateData);
});

gateway.on('decrement', (client, message) => {
  const templateData = message.templateData as CounterState;
  if (templateData.count > 0) {
    templateData.count--;
  }
  client.update(templateData);
});

export default gateway;
