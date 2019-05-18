import { stringUnionHash } from '../handlebars-utils';

export function show(_req: Express.Request, res: Express.Response) {
  res.liveRender('event-stream', {
    eventStream: {
      streaming: false,
    },
    title: 'Event Stream',
    nav: stringUnionHash('eventStream'),
  });
}
