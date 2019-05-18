import { LiveGateway } from '../live-render-express';
import EventSource from 'eventsource';
import debounce from 'debounce';

const gateway = new LiveGateway();

interface EventStreamState {
  streaming: boolean;
  messages?: Message[];
}

interface Message {
  bot: boolean;
  user: string;
  parsedcomment: string;
  server_url: string;
}

gateway.on('startStreaming', client => {
  const eventSource = new EventSource('https://stream.wikimedia.org/v2/stream/recentchange');
  const messages: Message[] = [];
  eventSource.onopen = () => {
    client.update({ streaming: true });
  };
  const debouncedUpdate = debounce(() => {
    // This implementation doesn't do very well when spamming the client with messages
    if (eventSource.readyState !== EventSource.CLOSED) {
      client.update({ streaming: true, messages });
    }
  }, 300);
  eventSource.onmessage = event => {
    const message: Message = JSON.parse(event.data);
    if (message.server_url === 'https://en.wikipedia.org' && !message.bot) {
      messages.unshift(message);
      messages.splice(50);
      debouncedUpdate();
    }
  };
  client.on('stopStreaming', message => {
    const templateData = message.templateData as EventStreamState;
    templateData.streaming = false;
    eventSource.close();
    client.update(templateData);
  });
});

export default gateway;
