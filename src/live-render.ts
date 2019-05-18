import liveRenderExpress from './live-render-express';
import session from './session-middleware';
import expressHandlebars from './express-handlebars';
import counterGateway from './counter/live';

export const liveRender = liveRenderExpress({ session, expressHandlebars });
liveRender.useGateway('live/counter', counterGateway);

export default liveRender;
