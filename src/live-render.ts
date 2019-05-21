import liveRenderExpress from './live-render-express';
import session from './session-middleware';
import expressHandlebars from './express-handlebars';
import counterGateway from './counter/live';
import eventStreamGateway from './event-stream/live';
import formGateway from './form/live';

export const liveRender = liveRenderExpress({ session, expressHandlebars });
liveRender.useGateway('live/counter', counterGateway);
liveRender.useGateway('live/event-stream', eventStreamGateway);
liveRender.useGateway('live/form', formGateway);

export default liveRender;
