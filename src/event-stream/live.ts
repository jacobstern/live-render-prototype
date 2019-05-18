import { LiveGateway } from '../live-render-express';
import EventSource from 'eventsource';

const gateway = new LiveGateway();

interface EventStreamState {
  streaming: boolean;
  messages?: Message[];
}

interface Message {
  id: string;
  bot: boolean;
  user: string;
  parsedcomment: string;
  server_url: string;
}

function fixRelativeLinks(commentHtml: string): string {
  // For fun, make the Wikipedia links in the demo actually work
  return commentHtml.replace(/href="(\/wiki\/.+?)"/g, (_match, p1) => {
    return `href="https://en.wikipedia.org${p1}"`;
  });
}

gateway.on('startStreaming', client => {
  const eventSource = new EventSource('https://stream.wikimedia.org/v2/stream/recentchange');
  const messages: Message[] = [];
  eventSource.onopen = () => {
    client.update({ streaming: true });
  };
  eventSource.onmessage = event => {
    const message: Message = JSON.parse(event.data);
    if (message.server_url === 'https://en.wikipedia.org') {
      message.parsedcomment = fixRelativeLinks(message.parsedcomment);
      messages.unshift(message);
      messages.splice(50);
      client.update({ streaming: true, messages });
    }
  };
  client.once('stopStreaming', message => {
    const templateData = message.templateData as EventStreamState;
    templateData.streaming = false;
    eventSource.close();
    client.update(templateData);
  });
});

export default gateway;
