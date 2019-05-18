import { Response, Request, Handler, RequestHandler } from 'express';
import { SafeString } from 'handlebars';
import uniqid from 'uniqid';
import crypto from 'crypto';
import http from 'http';
import diff from 'fast-diff';
import {
  ClientReadyPayload,
  RegionInit,
  InitPayload,
  ClientUpdateAckPayload,
  ClickEventPayload,
  FullUpdatePayload,
  DiffUpdatePayload,
} from '../common/types';
import { EventEmitter } from 'events';
import { CompactDiff } from '../common/diff';

function hashSource(source: string): string {
  return crypto
    .createHash('sha1')
    .update(source)
    .digest('base64');
}

export type ExpressRenderCallback = (err: Error | null | undefined, html: string) => void;

declare global {
  namespace Express {
    interface Response {
      liveRender(view: string, options?: Object, callback?: ExpressRenderCallback): void;
      liveRender(view: string, callback?: ExpressRenderCallback): void;
    }
  }

  namespace SocketIO {
    interface Handshake {
      session: Request['session'];
    }
  }
}

export interface Client {
  readonly socket: SocketIO.Socket;
  on(userEvent: string, callback: (message: UserEventMessage) => void): this;
  update(templateData: unknown): void;
}

class DefaultClient extends EventEmitter implements Client {
  constructor(
    public readonly socket: SocketIO.Socket,
    private gateway: LiveGateway,
    private updateDelegate: (templateData: unknown) => void
  ) {
    super();
  }

  update(templateData: unknown): void {
    this.updateDelegate(templateData);
  }

  on(userEvent: string, callback: (message: UserEventMessage) => void): this {
    this.gateway.on(userEvent, (client, message) => {
      if (client.socket.id === this.socket.id) {
        this.emit(userEvent, message);
      }
    });
    super.on(userEvent, callback);
    return this;
  }
}

export interface ClickMessage {
  type: 'click';
  templateData: unknown;
}

export type UserEventMessage = ClickMessage;

const RESERVED_GATEWAY_EVENTS = ['ready'];

export class LiveGateway extends EventEmitter {
  on(event: 'ready', callback: (client: Client) => void): this;
  on(userEvent: string, callback: (client: Client, message: UserEventMessage) => void): this;

  on(event: string, callback: (...args: any[]) => void): this {
    return super.on(event, callback);
  }
}

export interface LiveRenderExpressInstance {
  listen(server: SocketIO.Server | SocketIO.Namespace): SocketIO.Namespace;
  getMiddleware(): Handler;
  useGateway(templatePath: string, gateway: LiveGateway): this;
}

function computeCompactDiff(from: string, to: string): CompactDiff {
  return diff(from, to).map(([type, text]) => {
    switch (type) {
      case 1:
        return [1, text];
      case 0:
        return [0, text.length];
      case -1:
        return [-1, text.length];
    }
  });
}

class DefaultInstance implements LiveRenderExpressInstance {
  private session: RequestHandler;
  private gateways: Record<string, LiveGateway | undefined> = {};
  private expressHandlebars: Exphbs;

  constructor(options: LiveRenderExpressOptions) {
    this.session = options.session;
    this.expressHandlebars = options.expressHandlebars;
  }

  listen(server: SocketIO.Server | SocketIO.Namespace): SocketIO.Namespace {
    server.use((socket, next) => {
      // TODO: Custom sessions using memorystore?
      // Danger zone!
      const req = socket.handshake as any;
      this.session(req, new http.ServerResponse(req) as any, next);
    });
    return server.on('connection', this.handleConnection.bind(this));
  }

  getMiddleware(): Handler {
    return (_req, res, next) => {
      res.liveRender = liveRender;
      next();
    };
  }

  useGateway(templatePath: string, gateway: LiveGateway): this {
    const normalizedPath = this.normalizeGatewayPath(templatePath);
    this.gateways[normalizedPath] = gateway;
    return this;
  }

  private handleConnection(socket: SocketIO.Socket) {
    const session = socket.handshake.session;
    if (session == null) {
      throw new Error('Session uninitialized in socket, likely liveRender internal error');
    }
    session.reload(err => {
      if (err) throw err; // I guess?
    });
    let regionIds: string[] = [];
    socket
      .on('live:clickEvent', ({ regionId, eventName }: ClickEventPayload) => {
        session.reload(err => {
          if (err) throw err;
          const region: any = session.liveRender.regions[regionId];
          if (region) {
            const gateway = this.getGateway(region.templatePath);
            if (gateway && !RESERVED_GATEWAY_EVENTS.includes(eventName)) {
              const message: ClickMessage = {
                type: 'click',
                templateData: region.templateData,
              };
              gateway.emit(
                eventName,
                this.makeClient(gateway, socket, regionId, session),
                message
              );
            }
          }
        });
      })
      .on('live:ready', (payload: ClientReadyPayload) => {
        regionIds = payload.regionIds;
        session.reload(err => {
          if (err) throw err;
          const regions: Record<string, RegionInit | undefined> = {};
          for (const id of regionIds) {
            const region: any = session.liveRender.regions[id];
            if (region) {
              const gateway = this.getGateway(region.templatePath);
              if (gateway) {
                gateway.emit('ready', this.makeClient(gateway, socket, id, session));
              }
              regions[id] = {
                source: region.source,
                hash: region.hash,
                templateData: region.templateData,
              };
            }
          }
          const payload: InitPayload = { regions };
          socket.emit('live:init', payload);
        });
      })
      .on('live:desync', ({ regionId }: any) => {
        session.reload(err => {
          if (err) throw err;
          const region: any = session.liveRender.regions[regionId];
          if (region) {
            const payload: FullUpdatePayload = {
              regionId,
              source: region.source,
              hash: region.hash,
              templateData: region.templateData,
            };
            socket.emit('live:fullUpdate', payload);
          }
        });
      });
  }

  private normalizeGatewayPath(templatePath: string) {
    if (templatePath.startsWith('/')) {
      templatePath = templatePath.slice(1);
    }
    if (templatePath.endsWith('/')) {
      templatePath = templatePath.slice(0, templatePath.length - 1);
    }
    return templatePath;
  }

  private getGateway(templatePath: string): LiveGateway | undefined {
    const normalizedPath = this.normalizeGatewayPath(templatePath);
    return this.gateways[normalizedPath];
  }

  private makeClient(
    gateway: LiveGateway,
    socket: SocketIO.Socket,
    regionId: string,
    session: Express.Session
  ): DefaultClient {
    const client = new DefaultClient(socket, gateway, templateData => {
      session.reload(async err => {
        if (err) throw err;
        const region: any = session.liveRender.regions[regionId];
        if (region) {
          const priorSource = region.source;
          const priorHash = region.hash;
          const source = await this.renderTemplate(region.templatePath, templateData);
          const hash = hashSource(source);
          region.source = source;
          region.hash = hash;
          region.templateData = templateData;
          session.save(err => {
            if (err) throw err;
            const region = session.liveRender.regions[regionId];
            if (region) {
              const payload: DiffUpdatePayload = {
                regionId,
                diff: computeCompactDiff(priorSource, source),
                fromHash: priorHash,
                hash,
                templateData,
              };
              socket.emit('live:diffUpdate', payload);
            }
          });
        }
      });
    });
    return client;
  }

  private async renderTemplate(templatePath: string, templateData: unknown): Promise<string> {
    const partials = (await this.expressHandlebars.getPartials({ cache: true })) as any;
    const partial: any = partials[templatePath];
    return partial(templateData);
  }
}

export interface LiveRenderExpressOptions {
  session: RequestHandler;
  expressHandlebars: Exphbs;
}

export function create(options: LiveRenderExpressOptions): LiveRenderExpressInstance {
  return new DefaultInstance(options);
}

function liveRender(this: Response, view: string, arg2?: unknown, arg3?: unknown): void {
  let opts: Object | undefined;
  let callback: ExpressRenderCallback | undefined;
  if (typeof arg2 === 'function') {
    opts = undefined;
    callback = arg2 as ExpressRenderCallback | undefined;
  } else {
    opts = arg2 as Object | undefined;
    callback = arg3 as ExpressRenderCallback | undefined;
  }

  const options: any = opts || {};

  options.helpers = options.helpers || {};
  options.helpers.live = liveHelper.bind(this);

  this.render(view, options, callback);
}

function registerLiveTemplate(
  req: Request,
  templatePath: string,
  source: string,
  templateData: unknown
): string {
  const regionId = uniqid();
  const hash = hashSource(source);
  const session = req.session;
  if (session == null) {
    throw new Error('liveRender() requires an active session');
  }
  session.liveRender = session.liveRender || {};
  session.liveRender.regions = session.liveRender.regions || {};
  session.liveRender.regions[regionId] = {
    id: regionId,
    source,
    hash,
    templatePath,
    templateData,
  };
  return regionId;
}

function makeBeginComment(regionId: string) {
  return '<!--live-begin: ' + regionId + '-->';
}

function makeEndComment(regionId: string) {
  return '<!--live-end: ' + regionId + '-->';
}

function liveHelper(this: Response, arg1: unknown, arg2?: unknown, arg3?: unknown) {
  if (arguments.length === 1 || arguments.length > 3) {
    throw new Error('live helper takes either one or two arguments');
  }
  if (typeof arg1 !== 'string') {
    throw new Error('live helper partial name must be a string');
  }
  const partialName = arg1;
  let context: any;
  let options: Handlebars.HelperOptions;
  if (arguments.length === 2) {
    context = undefined;
    options = arg2 as Handlebars.HelperOptions;
  } else {
    context = arg2;
    options = arg3 as Handlebars.HelperOptions;
  }
  const partials = options.data.exphbs.partials;
  const partial = partials[partialName];
  if (partial == null) {
    throw new Error('Could not find partial named ' + partialName);
  }
  context = context || options.data;
  context = context || {};
  for (const [key, value] of Object.entries(options.hash)) {
    context[key] = value;
  }
  const source: string = partial(context);
  // this.req should be initialized at this point since middleware has run
  const regionId = registerLiveTemplate(this.req!, partialName, source, context);
  return new SafeString(makeBeginComment(regionId) + source + makeEndComment(regionId));
}

export default create;
