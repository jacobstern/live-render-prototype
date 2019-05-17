import io from 'socket.io-client';
import morphdom from 'morphdom';
import Handlebars from 'handlebars/runtime';

function onDocumentReady(callback: VoidFunction) {
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    callback();
  } else {
    document.addEventListener('DOMContentLoaded', callback);
  }
}

interface LiveRenderSocketOptions {
  url: string;
  container: HTMLElement;
  renderCallback: (data: unknown) => string;
  initialData: unknown;
}

class LiveRenderSocket {
  private socket: SocketIOClient.Socket;
  private data: unknown;

  public connect() {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  constructor(private options: LiveRenderSocketOptions) {
    this.socket = io(options.url);
    this.data = options.initialData;
    this.initSocket();
    this.registerInitialHandlers();
  }

  private initSocket(): void {
    this.socket.on('live:update', (data: unknown) => {
      const { renderCallback, container } = this.options;
      const rendered = renderCallback(data);
      this.data = data;
      morphdom(container, `<div>${rendered}</div>`, {
        childrenOnly: true,
        onNodeAdded: node => {
          if (node instanceof HTMLElement && node.dataset.liveClick) {
            node.addEventListener('click', this.handleClick);
          }
          return node;
        },
        onNodeDiscarded: node => {
          if (node instanceof HTMLElement) {
            node.removeEventListener('click', this.handleClick);
          }
        },
      });
    });
  }

  private registerInitialHandlers(): void {
    this.options.container.querySelectorAll(selectors.click).forEach(elem => {
      if (elem instanceof HTMLElement) {
        elem.addEventListener('click', this.handleClick);
      }
    });
  }

  private handleClick = (event: MouseEvent) => {
    const target = event.currentTarget as HTMLElement;
    const eventName = target.dataset.liveClick;
    if (eventName) {
      this.socket.emit(eventName, { data: this.data });
    }
  };
}

const selectors = {
  entry: '[data-live-entry]',
  click: '[data-live-click]',
};

export interface LiveRenderOptions {
  handlebars: typeof Handlebars;
}

export class LiveRender {
  private sockets: Array<LiveRenderSocket> = [];

  constructor(private baseUrl: string, private options: LiveRenderOptions) {}

  connect(): void {
    onDocumentReady(this.initWithDom.bind(this));
  }

  private initWithDom() {
    document.querySelectorAll(selectors.entry).forEach(elem => {
      if (elem instanceof HTMLElement) {
        if (elem.querySelector(selectors.entry) != null) {
          throw new Error('Nested liveRender entry points detected, this is not supported.');
        }
        const partialName = elem.dataset.liveEntry;
        if (partialName) {
          const url = this.buildUrl(partialName);
          const contextJson = elem.dataset.liveContext;
          if (contextJson) {
            const renderCallback = (data: unknown) => {
              const partial = this.options.handlebars.partials[partialName];
              if (partial == null) {
                throw new Error('No partial registered with name ' + partialName);
              }
              return partial(data);
            };
            const initialData = JSON.parse(contextJson);
            const socket = new LiveRenderSocket({
              url,
              renderCallback,
              initialData,
              container: elem,
            });
            this.sockets.push(socket);
            socket.connect();
          }
        }
      }
    });
  }

  private buildUrl(partialName: string): string {
    let url = this.baseUrl;
    if (!url.endsWith('/')) {
      url += '/';
    }
    url += partialName;
    return url;
  }
}

export default LiveRender;
