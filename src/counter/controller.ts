import { stringUnionHash } from '../handlebars-utils';

export function show(_req: Express.Request, res: Express.Response) {
  res.liveRender('counter.hbs', {
    title: 'Counter',
    nav: stringUnionHash('counter'),
    counter: { count: 0 },
  });
}
