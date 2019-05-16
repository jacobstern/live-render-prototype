import { Request, Response } from 'express';
import { stringUnionHash } from '../handlebars-utils';

export function show(_req: Request, res: Response) {
  res.render('counter', {
    title: 'Counter',
    nav: stringUnionHash('counter'),
    counter: { count: 0 },
  });
}
