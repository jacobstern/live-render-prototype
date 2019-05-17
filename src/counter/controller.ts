import { Request, Response } from 'express';
import { stringUnionHash } from '../handlebars-utils';

export function show(_req: Request, res: Response) {
  res.liveRender('counter.hbs', {
    title: 'Counter',
    nav: stringUnionHash('counter'),
    counter: { count: 0 },
  });
}
