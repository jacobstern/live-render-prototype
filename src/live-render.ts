import Handlebars from 'handlebars';

export interface BasePayload {
  data: unknown;
}

export interface LiveRenderInstance {}

export interface LiveRenderOptions {
  handlebars: typeof Handlebars;
}

class DefaultInstance implements LiveRenderInstance {
  constructor(private options: LiveRenderOptions) {
    options.handlebars.registerHelper('liveRender', this.handlebarsHelper.bind(this));
  }

  private handlebarsHelper(partialName: string, options: Handlebars.HelperOptions) {
    if (arguments.length > 2) {
      throw new Error('Live Render helper only accepts one argument');
    }
    if (typeof partialName !== 'string') {
      throw new Error('Live Render helper requires a string argument for the partial name');
    }
    const handlebars = this.options.handlebars;
    const hash: any = options.hash || {};
    const partials = hash.partials || handlebars.partials;
    let partial = partials[partialName];
    if (partial == null) {
      throw new Error('Could not find partial ' + partialName);
    }
    if (typeof partial !== 'function') {
      partial = handlebars.compile(partial);
    }
    let context: unknown = options.data;
    if (hash.context) {
      context = hash.context;
    }
    const contextJson = JSON.stringify(context);
    const attrs: Array<[string, string]> = [
      ['data-live-context', handlebars.escapeExpression(contextJson)],
      ['data-live-entry', partialName],
    ];
    if (hash.containerClass) {
      attrs.push(['class', hash.containerClass]);
    }
    const attrsText = attrs.map(([key, val]) => `${key}="${val}"`).join(' ');
    return new handlebars.SafeString(`<div ${attrsText}>${partial(context)}</div>`);
  }
}

export function create(options: LiveRenderOptions): LiveRenderInstance {
  return new DefaultInstance(options);
}

export default create;
