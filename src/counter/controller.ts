import { Request, Response } from 'express';

export function show(_req: Request, res: Response) {
  res.render('counter', { title: 'Counter', counter: { value: 0 } });
}
