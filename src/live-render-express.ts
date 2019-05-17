import { Request, Response } from 'express';
import { NextFunction } from 'connect';
import { SafeString } from 'handlebars';
import uniqid from 'uniqid';

export type ExpressRenderCallback = (err: Error | null | undefined, html: string) => void;

declare global {
  namespace Express {
    interface Response {
      liveRender(view: string, options?: Object, callback?: ExpressRenderCallback): void;
      liveRender(view: string, callback?: ExpressRenderCallback): void;
    }
  }
}

export function liveRenderExpress() {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.liveRender = liveRender;
    next();
  };
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

function registerLiveTemplate(res: Response, context: unknown): string {
  return uniqid();
}

function makeBeginComment(id: string) {
  return '<!--live-begin: ' + id + '-->';
}

function makeEndComment(id: string) {
  return '<!--live-end: ' + id + '-->';
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
  const id = registerLiveTemplate(this, context);
  return new SafeString(makeBeginComment(id) + partial(context) + makeEndComment(id));
}

export default liveRenderExpress;
