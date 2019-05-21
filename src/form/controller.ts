import { stringUnionHash } from '../handlebars-utils';

export function show(_req: Express.Request, res: Express.Response): void {
  res.liveRender('form', {
    form: {},
    title: 'Form',
    nav: stringUnionHash('form'),
  });
}
