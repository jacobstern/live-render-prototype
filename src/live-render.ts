import liveRenderExpress from './live-render-express';
import sessionMiddleware from './session-middleware';

export const liveRender = liveRenderExpress({ session: sessionMiddleware });

export default liveRender;
