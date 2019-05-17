import { Response, Request, Handler, RequestHandler } from 'express';
import { SafeString } from 'handlebars';
import uniqid from 'uniqid';
import crypto from 'crypto';
import http from 'http';
import sessionMiddleware from './session-middleware';
import { ClientReadyPayload, RegionInit } from '../common/types';

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

export interface LiveRenderExpressInstance {
  listen(server: SocketIO.Server | SocketIO.Namespace): SocketIO.Namespace;
  getMiddleware(): Handler;
}

class DefaultInstance implements LiveRenderExpressInstance {
  private sessionMiddleware: RequestHandler;

  constructor(options: LiveRenderExpressOptions) {
    this.sessionMiddleware = options.session;
  }

  listen(server: SocketIO.Server | SocketIO.Namespace): SocketIO.Namespace {
    server.use((socket, next) => {
      // TODO: Probably don't want/need to rely on express-session directly
      // Danger zone!
      const req = socket.handshake as any;
      sessionMiddleware(req, new http.ServerResponse(req) as any, next);
    });
    return server.on('connection', this.handleConnection.bind(this));
  }

  getMiddleware(): Handler {
    return (_req, res, next) => {
      res.liveRender = liveRender;
      next();
    };
  }

  private async handleConnection(socket: SocketIO.Socket) {
    const session = socket.handshake.session;
    if (session == null) {
      throw new Error('Session uninitialized in socket, likely liveRender internal error');
    }
    session.touch(err => {
      if (err) throw err; // I guess?
    });
    let regionIds: string[] = [];
    socket.on('live:ready', (payload: ClientReadyPayload) => {
      regionIds = payload.regionIds;
      session.reload(err => {
        if (err) throw err;
        const regions: Record<string, RegionInit | undefined> = {};
        for (const id of regionIds) {
          const region: any = session.liveRender.regions[id];
          if (region) {
            regions[id] = {
              source: region.source,
              hash: region.hash,
              templateData: region.templateData,
            };
          }
        }
        socket.emit('live:init', { regions });
      });
    });
  }
}

export interface LiveRenderExpressOptions {
  session: RequestHandler;
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

function registerLiveTemplate(req: Request, source: string, templateData: unknown): string {
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
    templateData,
    acked: {},
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
  const regionId = registerLiveTemplate(this.req!, source, context);
  return new SafeString(makeBeginComment(regionId) + source + makeEndComment(regionId));
}

export default create;
