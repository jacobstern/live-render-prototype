import liveRenderExpress from './live-render-express';
import sessionMiddleware from './session-middleware';
import counterGateway from './counter/live';

export const liveRender = liveRenderExpress({ session: sessionMiddleware });
liveRender.useGateway('live/counter', counterGateway);

export default liveRender;
